/**
 * Code.gs
 * Web Appのエンドポイント。LIFFからのAPI呼び出しを受ける doPost と
 * LINEプラットフォームからのWebhookを受ける doPost を兼ねる。
 *
 * デプロイ：
 *   公開 → 新しいデプロイ → 種類「ウェブアプリ」
 *   実行ユーザー：自分 / アクセス：全員
 *   発行されたURLを LINE Messaging API のWebhook URLに登録する
 */

function doGet(e) {
  return jsonResponse_({ ok: true, message: 'tanakanchi-yoyaku web app' });
}

function doPost(e) {
  try {
    const body = e.postData ? e.postData.contents : '';

    // LINEプラットフォームからのWebhookか、LIFFからのAPIか判別
    // LINEはX-Line-Signatureヘッダを送るが、GASでは取得困難なので payload内容で判別する
    const json = JSON.parse(body);

    if (json.events && Array.isArray(json.events)) {
      // LINE Webhook
      return handleLineWebhook_(json);
    }

    if (json.action) {
      // LIFFからのAPI
      return handleLiffApi_(json);
    }

    return jsonResponse_({ ok: false, error: 'unknown payload' });
  } catch (err) {
    Logger.log(err.stack || err.message);
    return jsonResponse_({ ok: false, error: String(err.message || err) });
  }
}

/**
 * LIFF からのAPI呼び出しをディスパッチ
 * 期待payload: { action, idToken, data }
 */
function handleLiffApi_(json) {
  const idToken = json.idToken;
  if (!idToken) return jsonResponse_({ ok: false, error: 'idTokenが必要です' });
  const profile = verifyLineIdToken_(idToken);
  if (!profile) return jsonResponse_({ ok: false, error: '認証に失敗しました' });

  const data = json.data || {};
  let result;
  switch (json.action) {
    case 'availability':
      result = getAvailability(data);
      break;
    case 'create':
      result = createReservation(data, profile);
      break;
    case 'mylist':
      result = listMyReservations(data, profile);
      break;
    case 'cancel':
      result = cancelReservation(data, profile);
      break;
    case 'settings':
      result = getPublicSettings_();
      break;
    default:
      result = { ok: false, error: '未知のaction: ' + json.action };
  }
  return jsonResponse_(result);
}

/**
 * 公開してOKな設定値だけ返す
 */
function getPublicSettings_() {
  const s = getSetting_();
  return {
    ok: true,
    settings: {
      shopName: s['店名'] || '',
      phone: s['電話番号'] || '',
      coursePrice: parseInt(s['飲み放題価格'], 10) || 0,
      maxAcceptDays: parseInt(s['受付可能日数'], 10) || 90,
      cancelLimitDays: parseInt(s['キャンセル受付期限日数'], 10) || 3,
      autoMaxParty: parseInt(s['自動受付上限人数'], 10) || 4,
      groupMinParty: parseInt(s['貸切人数下限'], 10) || 15
    }
  };
}

/**
 * LIFFのIDトークンを検証して、userIdと表示名を返す
 * https://developers.line.biz/ja/docs/line-login/verify-id-token/
 */
function verifyLineIdToken_(idToken) {
  const channelId = getProp_(PROP_KEYS.LIFF_CHANNEL_ID);
  const res = UrlFetchApp.fetch('https://api.line.me/oauth2/v2.1/verify', {
    method: 'post',
    contentType: 'application/x-www-form-urlencoded',
    payload: { id_token: idToken, client_id: channelId },
    muteHttpExceptions: true
  });
  if (res.getResponseCode() !== 200) {
    Logger.log('verify failed: ' + res.getContentText());
    return null;
  }
  const data = JSON.parse(res.getContentText());
  return { userId: data.sub, displayName: data.name || '' };
}
