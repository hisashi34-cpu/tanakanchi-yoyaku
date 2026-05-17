/**
 * Notify.gs
 * LINE Messaging API ラッパ。Reply / Push を使う。
 */

const LINE_API = 'https://api.line.me/v2/bot';

function lineHeaders_() {
  return {
    Authorization: 'Bearer ' + getProp_(PROP_KEYS.LINE_CHANNEL_ACCESS_TOKEN),
    'Content-Type': 'application/json'
  };
}

function replyText_(replyToken, text) {
  return replyMessages_(replyToken, [{ type: 'text', text: text }]);
}

function replyMessages_(replyToken, messages) {
  const res = UrlFetchApp.fetch(LINE_API + '/message/reply', {
    method: 'post',
    headers: lineHeaders_(),
    payload: JSON.stringify({ replyToken: replyToken, messages: messages }),
    muteHttpExceptions: true
  });
  if (res.getResponseCode() >= 300) Logger.log('reply error: ' + res.getContentText());
}

function pushTo_(uid, messages) {
  if (!uid) return;
  const res = UrlFetchApp.fetch(LINE_API + '/message/push', {
    method: 'post',
    headers: lineHeaders_(),
    payload: JSON.stringify({ to: uid, messages: messages }),
    muteHttpExceptions: true
  });
  if (res.getResponseCode() >= 300) Logger.log('push error: ' + res.getContentText());
}

function pushText_(uid, text) {
  pushTo_(uid, [{ type: 'text', text: text }]);
}

/**
 * 予約確定メッセージ（Flex Bubble）
 */
function pushReservationConfirm_(uid, r) {
  const shop = getSetting_()['店名'] || '当店';
  const text =
    'ご予約ありがとうございます🌸\n\n' +
    '【' + shop + '】\n' +
    '日時：' + r.date + ' ' + r.time + '〜' + r.endTime + '\n' +
    '人数：' + r.partySize + '名\n' +
    '席　：' + r.seatType + '\n' +
    'コース：' + r.course + '\n' +
    '予約番号：' + r.id + '\n\n' +
    'ご来店をお待ちしております。';
  pushText_(uid, text);
}

function pushReservationCancel_(uid, r) {
  const shop = getSetting_()['店名'] || '当店';
  pushText_(uid,
    '【' + shop + '】\nご予約をキャンセル承りました。\n\n' +
    '日時：' + r.date + ' ' + r.time + '\n' +
    '人数：' + r.partySize + '名\n' +
    '予約番号：' + r.id + '\n\n' +
    'またのご来店をお待ちしております。'
  );
}

function pushOwnerNewReservation_(r) {
  const owner = getPropOptional_(PROP_KEYS.OWNER_LINE_UID);
  if (!owner) return;
  pushText_(owner,
    '🟢 新規予約\n' +
    '日時：' + r.date + ' ' + r.time + '〜' + r.endTime + '\n' +
    '名前：' + (r.displayName || '-') + '\n' +
    '電話：' + r.phone + '\n' +
    '人数：' + r.partySize + '名（' + r.seatType + ' / ' + r.seatId + '）\n' +
    'コース：' + r.course + '\n' +
    '予約番号：' + r.id
  );
}

function pushOwnerCancel_(r) {
  const owner = getPropOptional_(PROP_KEYS.OWNER_LINE_UID);
  if (!owner) return;
  pushText_(owner,
    '🔴 キャンセル\n' +
    '日時：' + r.date + ' ' + r.time + '\n' +
    '名前：' + (r.displayName || '-') + '\n' +
    '電話：' + r.phone + '\n' +
    '人数：' + r.partySize + '名（' + r.seatType + '）\n' +
    '予約番号：' + r.id
  );
}
