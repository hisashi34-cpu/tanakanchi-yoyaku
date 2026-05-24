/**
 * Utils.gs
 * シートアクセス・日付/時刻ヘルパ。
 */

function getSpreadsheet_() {
  return SpreadsheetApp.openById(getProp_(PROP_KEYS.SHEET_ID));
}

function getSheet_(name) {
  const sh = getSpreadsheet_().getSheetByName(name);
  if (!sh) throw new Error('シート未存在: ' + name);
  return sh;
}

function jsonResponse_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function uuid_() {
  return Utilities.getUuid().slice(0, 8).toUpperCase();
}

function pad2_(n) {
  return n < 10 ? '0' + n : '' + n;
}

/**
 * "HH:mm" or Date → 分（0-1439）
 * スプレッドシートが '17:00' を Date('1899-12-30 17:00 JST') に自動変換するため両対応する。
 */
function timeToMin_(hhmm) {
  if (hhmm instanceof Date) {
    const s = Utilities.formatDate(hhmm, 'Asia/Tokyo', 'HH:mm');
    const md = s.match(/^(\d{1,2}):(\d{2})$/);
    return parseInt(md[1], 10) * 60 + parseInt(md[2], 10);
  }
  const m = String(hhmm).match(/^(\d{1,2}):(\d{2})$/);
  if (!m) throw new Error('不正な時刻: ' + hhmm);
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

function minToTime_(min) {
  return pad2_(Math.floor(min / 60)) + ':' + pad2_(min % 60);
}

/**
 * "YYYY-MM-DD" → Date (JST 00:00)
 */
function parseDate_(ymd) {
  const m = String(ymd).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) throw new Error('不正な日付: ' + ymd);
  return new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10));
}

function formatDate_(d) {
  return Utilities.formatDate(d, 'Asia/Tokyo', 'yyyy-MM-dd');
}

/**
 * 指定日が営業日か。月火は定休、営業日例外シートで上書き可。
 * 戻り値: { open: bool, openMin: number, closeMin: number, lastStartMin: number }
 */
function getBusinessHours_(ymd) {
  const setting = getSetting_();
  const openMin = timeToMin_(setting['通常開店']);
  const closeMin = timeToMin_(setting['通常閉店']);
  const lastStartMin = timeToMin_(setting['最終予約開始']);
  const result = { open: true, openMin: openMin, closeMin: closeMin, lastStartMin: lastStartMin };

  const date = parseDate_(ymd);
  const dow = date.getDay(); // 0=日 1=月 2=火
  if (dow === 1 || dow === 2) result.open = false;

  // 例外シート確認
  const sh = getSheet_(SHEET_NAMES.HOLIDAY);
  const last = sh.getLastRow();
  if (last >= 2) {
    const rows = sh.getRange(2, 1, last - 1, 4).getValues();
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (!r[0]) continue;
      const exDate = (r[0] instanceof Date) ? formatDate_(r[0]) : String(r[0]);
      if (exDate !== ymd) continue;
      if (r[1] === '休業') {
        result.open = false;
      } else if (r[1] === '営業') {
        result.open = true;
        if (r[2]) result.openMin = timeToMin_(r[2] instanceof Date
          ? Utilities.formatDate(r[2], 'Asia/Tokyo', 'HH:mm') : r[2]);
        if (r[3]) result.closeMin = timeToMin_(r[3] instanceof Date
          ? Utilities.formatDate(r[3], 'Asia/Tokyo', 'HH:mm') : r[3]);
      }
      break;
    }
  }
  return result;
}

/**
 * 指定日の30分刻みスロット一覧（開始時刻のみ）
 */
function listSlots_(ymd) {
  const b = getBusinessHours_(ymd);
  if (!b.open) return [];
  const slots = [];
  for (let t = b.openMin; t <= b.lastStartMin; t += 30) {
    slots.push(minToTime_(t));
  }
  return slots;
}

/**
 * 滞在時間（分）
 */
function stayMinutes_() {
  return parseInt(getSetting_()['滞在時間分'], 10) || 120;
}

/**
 * 受付可能日数
 */
function maxAcceptDays_() {
  return parseInt(getSetting_()['受付可能日数'], 10) || 90;
}

/**
 * キャンセル受付期限（日）
 */
function cancelLimitDays_() {
  return parseInt(getSetting_()['キャンセル受付期限日数'], 10) || 3;
}
