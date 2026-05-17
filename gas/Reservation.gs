/**
 * Reservation.gs
 * 予約の空き判定・席アサイン・登録・キャンセル。
 * LockServiceで二重予約を防止。
 */

/**
 * 席種優先順位（人数別）
 */
function seatPriority_(partySize, preferred) {
  if (preferred === '個室') return ['個室'];
  if (partySize <= 2) return ['カウンター', 'テーブル', '個室'];
  return ['テーブル', '個室']; // 3-4名はテーブル系のみ
}

/**
 * 席マスタを取得
 */
function getSeats_() {
  const sh = getSheet_(SHEET_NAMES.SEAT);
  const rows = sh.getRange(2, 1, sh.getLastRow() - 1, 3).getValues();
  return rows.filter(function (r) { return r[0]; }).map(function (r) {
    return { id: String(r[0]), type: String(r[1]), capacity: parseInt(r[2], 10) };
  });
}

/**
 * 既存予約を取得（確定のみ）
 */
function loadConfirmedReservations_() {
  const sh = getSheet_(SHEET_NAMES.RESERVATION);
  if (sh.getLastRow() < 2) return [];
  const rows = sh.getRange(2, 1, sh.getLastRow() - 1, 13).getValues();
  return rows.filter(function (r) { return r[0] && r[11] === '確定'; }).map(function (r) {
    return {
      id: r[0],
      uid: r[1],
      date: (r[4] instanceof Date) ? formatDate_(r[4]) : String(r[4]),
      startMin: timeToMin_(r[5] instanceof Date ? Utilities.formatDate(r[5], 'Asia/Tokyo', 'HH:mm') : r[5]),
      endMin: timeToMin_(r[6] instanceof Date ? Utilities.formatDate(r[6], 'Asia/Tokyo', 'HH:mm') : r[6]),
      partySize: r[7],
      seatType: r[8],
      seatId: r[9]
    };
  });
}

/**
 * 指定席が指定区間と被るか
 */
function hasConflict_(reservations, seatId, ymd, startMin, endMin) {
  for (let i = 0; i < reservations.length; i++) {
    const r = reservations[i];
    if (r.seatId !== seatId) continue;
    if (r.date !== ymd) continue;
    if (startMin < r.endMin && r.startMin < endMin) return true;
  }
  return false;
}

/**
 * 空き席を1つ見つける（なければnull）
 */
function findAvailableSeat_(reservations, seats, ymd, startMin, endMin, partySize, preferred) {
  const priorities = seatPriority_(partySize, preferred);
  for (let p = 0; p < priorities.length; p++) {
    const seatType = priorities[p];
    const candidates = seats.filter(function (s) {
      return s.type === seatType && s.capacity >= partySize;
    });
    for (let i = 0; i < candidates.length; i++) {
      if (!hasConflict_(reservations, candidates[i].id, ymd, startMin, endMin)) {
        return candidates[i];
      }
    }
  }
  return null;
}

/**
 * 指定日の予約可能なスロット一覧を返す
 * { slots: [{ time, available, seatTypes: ['カウンター',...] }] }
 */
function getAvailability(payload) {
  const ymd = payload.date;
  const partySize = parseInt(payload.partySize, 10);
  const preferred = payload.preferred || '';

  const autoMax = parseInt(getSetting_()['自動受付上限人数'], 10) || 4;
  if (partySize > autoMax) {
    return { ok: false, error: autoMax + '名を超えるご予約はお電話でお願いいたします' };
  }

  const slots = listSlots_(ymd);
  if (slots.length === 0) {
    return { ok: true, slots: [], closed: true };
  }

  const seats = getSeats_();
  const reservations = loadConfirmedReservations_();
  const stay = stayMinutes_();

  const result = slots.map(function (t) {
    const startMin = timeToMin_(t);
    const endMin = startMin + stay;
    const seat = findAvailableSeat_(reservations, seats, ymd, startMin, endMin, partySize, preferred);
    return {
      time: t,
      available: !!seat,
      seatType: seat ? seat.type : null
    };
  });

  return { ok: true, slots: result, closed: false };
}

/**
 * 予約登録
 */
function createReservation(payload, profile) {
  // バリデーション
  const ymd = payload.date;
  const time = payload.time;
  const partySize = parseInt(payload.partySize, 10);
  const preferred = payload.preferred || '';
  const course = payload.course === '飲み放題' ? '飲み放題' : '席のみ';
  const phone = String(payload.phone || '').trim();

  if (!ymd || !time) return { ok: false, error: '日時を指定してください' };
  if (!partySize || partySize < 1) return { ok: false, error: '人数を指定してください' };
  if (!phone) return { ok: false, error: 'お電話番号をご入力ください' };

  const autoMax = parseInt(getSetting_()['自動受付上限人数'], 10) || 4;
  if (partySize > autoMax) return { ok: false, error: autoMax + '名を超えるご予約はお電話でお願いいたします' };

  // 受付期間チェック
  const target = parseDate_(ymd);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  if (target.getTime() < today.getTime()) return { ok: false, error: '過去の日付は指定できません' };
  const maxDays = maxAcceptDays_();
  const diffDays = Math.floor((target.getTime() - today.getTime()) / (24 * 3600 * 1000));
  if (diffDays > maxDays) return { ok: false, error: maxDays + '日先までご予約いただけます' };

  const startMin = timeToMin_(time);
  const endMin = startMin + stayMinutes_();

  // 営業時間チェック
  const biz = getBusinessHours_(ymd);
  if (!biz.open) return { ok: false, error: 'この日は休業日です' };
  if (startMin < biz.openMin || startMin > biz.lastStartMin) {
    return { ok: false, error: 'この時刻は受付外です' };
  }

  // 二重予約防止のためロック取得
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return { ok: false, error: '混雑のため処理できません。少し待って再試行してください' };

  try {
    const reservations = loadConfirmedReservations_();
    const seats = getSeats_();
    const seat = findAvailableSeat_(reservations, seats, ymd, startMin, endMin, partySize, preferred);
    if (!seat) return { ok: false, error: 'ご希望の時刻は満席です。別の時刻をお試しください' };

    const id = 'R' + Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyMMdd') + '-' + uuid_();
    const sh = getSheet_(SHEET_NAMES.RESERVATION);
    sh.appendRow([
      id,
      profile.userId,
      profile.displayName || '',
      phone,
      ymd,
      time,
      minToTime_(endMin),
      partySize,
      seat.type,
      seat.id,
      course,
      '確定',
      new Date()
    ]);

    upsertCustomer_(profile.userId, profile.displayName || '', phone, ymd);

    const reservation = {
      id: id,
      date: ymd,
      time: time,
      endTime: minToTime_(endMin),
      partySize: partySize,
      seatType: seat.type,
      seatId: seat.id,
      course: course,
      phone: phone,
      displayName: profile.displayName || ''
    };

    // 通知
    try { pushReservationConfirm_(profile.userId, reservation); } catch (e) { Logger.log(e); }
    try { pushOwnerNewReservation_(reservation); } catch (e) { Logger.log(e); }

    return { ok: true, reservation: reservation };
  } finally {
    lock.releaseLock();
  }
}

/**
 * 顧客台帳のupsert
 */
function upsertCustomer_(uid, name, phone, ymd) {
  const sh = getSheet_(SHEET_NAMES.CUSTOMER);
  const last = sh.getLastRow();
  let rowIdx = -1;
  if (last >= 2) {
    const ids = sh.getRange(2, 1, last - 1, 1).getValues();
    for (let i = 0; i < ids.length; i++) {
      if (ids[i][0] === uid) { rowIdx = i + 2; break; }
    }
  }
  if (rowIdx === -1) {
    sh.appendRow([uid, name, phone, 1, ymd]);
  } else {
    const cur = sh.getRange(rowIdx, 1, 1, 5).getValues()[0];
    sh.getRange(rowIdx, 1, 1, 5).setValues([[
      uid, name || cur[1], phone || cur[2], (parseInt(cur[3], 10) || 0) + 1, ymd
    ]]);
  }
}

/**
 * ユーザーの予約一覧（来店日が今日以降の確定のみ）
 */
function listMyReservations(payload, profile) {
  const sh = getSheet_(SHEET_NAMES.RESERVATION);
  if (sh.getLastRow() < 2) return { ok: true, reservations: [] };
  const rows = sh.getRange(2, 1, sh.getLastRow() - 1, 13).getValues();
  const today = formatDate_(new Date());
  const list = rows.filter(function (r) {
    if (r[1] !== profile.userId) return false;
    if (r[11] !== '確定') return false;
    const ymd = (r[4] instanceof Date) ? formatDate_(r[4]) : String(r[4]);
    return ymd >= today;
  }).map(function (r) {
    const ymd = (r[4] instanceof Date) ? formatDate_(r[4]) : String(r[4]);
    const time = (r[5] instanceof Date) ? Utilities.formatDate(r[5], 'Asia/Tokyo', 'HH:mm') : r[5];
    return {
      id: r[0], date: ymd, time: time, partySize: r[7],
      seatType: r[8], course: r[10]
    };
  });
  return { ok: true, reservations: list };
}

/**
 * 予約キャンセル（本人 & 3日前まで）
 */
function cancelReservation(payload, profile) {
  const id = payload.id;
  if (!id) return { ok: false, error: '予約IDが指定されていません' };

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return { ok: false, error: '混雑のため処理できません' };

  try {
    const sh = getSheet_(SHEET_NAMES.RESERVATION);
    const last = sh.getLastRow();
    if (last < 2) return { ok: false, error: '予約が見つかりません' };
    const rows = sh.getRange(2, 1, last - 1, 13).getValues();
    let rowIdx = -1;
    let target = null;
    for (let i = 0; i < rows.length; i++) {
      if (rows[i][0] === id) { rowIdx = i + 2; target = rows[i]; break; }
    }
    if (rowIdx === -1) return { ok: false, error: '予約が見つかりません' };
    if (target[1] !== profile.userId) return { ok: false, error: 'この予約はキャンセルできません' };
    if (target[11] !== '確定') return { ok: false, error: 'すでにキャンセル済みです' };

    // 3日前チェック
    const ymd = (target[4] instanceof Date) ? formatDate_(target[4]) : String(target[4]);
    const target_dt = parseDate_(ymd);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const diffDays = Math.floor((target_dt.getTime() - today.getTime()) / (24 * 3600 * 1000));
    const limit = cancelLimitDays_();
    if (diffDays < limit) {
      const tel = getSetting_()['電話番号'] || '';
      return { ok: false, error: limit + '日前を過ぎたキャンセルはお電話（' + tel + '）でお願いいたします' };
    }

    sh.getRange(rowIdx, 12).setValue('キャンセル');

    const info = {
      id: id,
      date: ymd,
      time: (target[5] instanceof Date) ? Utilities.formatDate(target[5], 'Asia/Tokyo', 'HH:mm') : target[5],
      partySize: target[7], seatType: target[8],
      displayName: target[2], phone: target[3]
    };
    try { pushReservationCancel_(profile.userId, info); } catch (e) { Logger.log(e); }
    try { pushOwnerCancel_(info); } catch (e) { Logger.log(e); }
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}
