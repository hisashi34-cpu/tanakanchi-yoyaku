/**
 * Config.gs
 * スクリプトプロパティから値を読む薄いラッパー。
 * 初回セットアップでは setupProperties() を一度だけ手動実行する。
 */

const PROP_KEYS = {
  SHEET_ID: 'SHEET_ID',
  LINE_CHANNEL_ACCESS_TOKEN: 'LINE_CHANNEL_ACCESS_TOKEN',
  LINE_CHANNEL_SECRET: 'LINE_CHANNEL_SECRET',
  LIFF_CHANNEL_ID: 'LIFF_CHANNEL_ID',
  OWNER_LINE_UID: 'OWNER_LINE_UID'
};

const SHEET_NAMES = {
  RESERVATION: '予約',
  SEAT: '席マスタ',
  CUSTOMER: '顧客',
  HOLIDAY: '営業日例外',
  SETTING: '設定'
};

function getProp_(key) {
  const v = PropertiesService.getScriptProperties().getProperty(key);
  if (!v) throw new Error('スクリプトプロパティ ' + key + ' が未設定です');
  return v;
}

function getPropOptional_(key) {
  return PropertiesService.getScriptProperties().getProperty(key) || '';
}

/**
 * 設定シートの値をオブジェクトで取得（キャッシュ付き）
 */
let _settingCache = null;
function getSetting_() {
  if (_settingCache) return _settingCache;
  const sh = getSheet_(SHEET_NAMES.SETTING);
  const values = sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues();
  const obj = {};
  values.forEach(function (row) {
    if (row[0]) obj[String(row[0]).trim()] = row[1];
  });
  _settingCache = obj;
  return obj;
}

/**
 * セットアップ用：一度だけ実行
 * GASエディタ右上の関数ドロップダウンから setupProperties を選んで実行
 */
function setupProperties() {
  const props = PropertiesService.getScriptProperties();
  props.setProperties({
    SHEET_ID: 'ここにスプレッドシートIDを貼り付け',
    LINE_CHANNEL_ACCESS_TOKEN: 'ここにMessaging APIのチャネルアクセストークンを貼り付け',
    LINE_CHANNEL_SECRET: 'ここにMessaging APIのチャネルシークレットを貼り付け',
    LIFF_CHANNEL_ID: 'ここにLIFFアプリのチャネルID（LIFFのID Token検証用）を貼り付け',
    OWNER_LINE_UID: '店主のLINE userIdを貼り付け（後で取得可）'
  });
  Logger.log('プロパティのプレースホルダを登録しました。各値を実値で上書きしてください。');
}
