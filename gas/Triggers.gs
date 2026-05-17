/**
 * Triggers.gs
 * 時間主導トリガで実行する処理。
 *
 * 初期セットアップ：GASエディタ → トリガー →
 *   関数 onReminderTrigger / イベント「時間主導型」/ 日タイマー / 18-19時 を追加。
 */

/**
 * 前日18時に翌日来店分のリマインドを送る
 */
function onReminderTrigger() {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const ymd = formatDate_(tomorrow);

  const sh = getSheet_(SHEET_NAMES.RESERVATION);
  if (sh.getLastRow() < 2) return;
  const rows = sh.getRange(2, 1, sh.getLastRow() - 1, 13).getValues();
  const targets = rows.filter(function (r) {
    if (!r[0] || r[11] !== '確定') return false;
    const d = (r[4] instanceof Date) ? formatDate_(r[4]) : String(r[4]);
    return d === ymd;
  });
  const shop = getSetting_()['店名'] || '当店';
  targets.forEach(function (r) {
    const time = (r[5] instanceof Date) ? Utilities.formatDate(r[5], 'Asia/Tokyo', 'HH:mm') : r[5];
    const text =
      '【' + shop + '】明日のご予約のリマインドです🍶\n\n' +
      '日時：' + ymd + ' ' + time + '\n' +
      '人数：' + r[7] + '名\n' +
      '席　：' + r[8] + '\n' +
      'コース：' + r[10] + '\n' +
      '予約番号：' + r[0] + '\n\n' +
      'お気をつけてお越しください。';
    try { pushText_(r[1], text); } catch (e) { Logger.log(e); }
  });
}
