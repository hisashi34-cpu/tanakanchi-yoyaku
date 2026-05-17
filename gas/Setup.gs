/**
 * Setup.gs
 * スプレッドシートの初期化ヘルパ。
 * setupProperties() で SHEET_ID を設定したあと、setupSheets() を一度だけ実行する。
 * 既存シートを上書きしないので、何度実行しても安全。
 */

function setupSheets() {
  const ss = getSpreadsheet_();

  ensureSheet_(ss, SHEET_NAMES.RESERVATION, [
    '予約ID', 'LINE_UID', '表示名', '電話番号', '来店日', '開始時刻', '終了時刻',
    '人数', '席種', '席ID', 'コース', 'ステータス', '作成日時'
  ]);

  const seatSh = ensureSheet_(ss, SHEET_NAMES.SEAT, ['席ID', '種別', '定員']);
  if (seatSh.getLastRow() === 1) {
    seatSh.getRange(2, 1, 10, 3).setValues([
      ['C1', 'カウンター', 1],
      ['C2', 'カウンター', 1],
      ['C3', 'カウンター', 1],
      ['C4', 'カウンター', 1],
      ['C5', 'カウンター', 1],
      ['C6', 'カウンター', 1],
      ['T1', 'テーブル', 4],
      ['T2', 'テーブル', 4],
      ['T3', 'テーブル', 4],
      ['P1', '個室', 4]
    ]);
  }

  ensureSheet_(ss, SHEET_NAMES.CUSTOMER,
    ['LINE_UID', '表示名', '電話番号', '来店回数', '最終来店日']);

  ensureSheet_(ss, SHEET_NAMES.HOLIDAY, ['日付', '区分', '開店', '閉店']);

  const setSh = ensureSheet_(ss, SHEET_NAMES.SETTING, ['キー', '値']);
  if (setSh.getLastRow() === 1) {
    setSh.getRange(2, 1, 14, 2).setValues([
      ['店名', 'たなかんち2'],
      ['電話番号', '03-xxxx-xxxx'],
      ['通常開店', '17:00'],
      ['通常閉店', '23:00'],
      ['ラストオーダー', '22:00'],
      ['滞在時間分', 120],
      ['最終予約開始', '20:00'],
      ['飲み放題価格', 6000],
      ['受付可能日数', 90],
      ['キャンセル受付期限日数', 3],
      ['自動受付上限人数', 4],
      ['貸切人数下限', 15],
      ['LIFF_URL', ''],
      ['OWNER_LINE_UID', '']
    ]);
  }

  SpreadsheetApp.flush();
  Logger.log('シートを初期化しました。設定シートで電話番号などを更新してください。');
}

function ensureSheet_(ss, name, headers) {
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
  }
  // 既存ヘッダがあれば触らない
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}
