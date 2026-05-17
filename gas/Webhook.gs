/**
 * Webhook.gs
 * LINEプラットフォームから飛んでくるイベントを処理する。
 */

function handleLineWebhook_(json) {
  const events = json.events || [];
  events.forEach(function (ev) {
    try {
      if (ev.type === 'message' && ev.message && ev.message.type === 'text') {
        handleTextMessage_(ev);
      } else if (ev.type === 'follow') {
        handleFollow_(ev);
      } else if (ev.type === 'postback') {
        handlePostback_(ev);
      }
    } catch (e) {
      Logger.log(e.stack || e);
    }
  });
  return jsonResponse_({ ok: true });
}

function handleTextMessage_(ev) {
  const text = (ev.message.text || '').trim();
  const replyToken = ev.replyToken;
  const liffUrl = getSetting_()['LIFF_URL'] || '';
  const tel = getSetting_()['電話番号'] || '';

  if (/予約|よやく|reserve/i.test(text)) {
    replyText_(replyToken,
      'ご来店ありがとうございます！\n\n下記のURLからご予約いただけます。\n' + liffUrl +
      '\n\n15名以上の貸切は、お電話（' + tel + '）にてお問い合わせください。'
    );
    return;
  }

  if (/キャンセル|変更/.test(text)) {
    replyText_(replyToken,
      '予約の確認・キャンセルは下記からお願いします。\n' + liffUrl +
      '\n\n来店3日前を過ぎたキャンセルはお電話（' + tel + '）でお願いいたします。'
    );
    return;
  }

  if (/メニュー|menu/i.test(text)) {
    replyText_(replyToken, 'メニューは店内にてご案内しております。お気軽にお問い合わせください。');
    return;
  }

  // デフォルト
  replyText_(replyToken,
    'お問い合わせありがとうございます。\n' +
    '・ご予約 → 「予約」と送信\n' +
    '・予約確認・キャンセル → 「キャンセル」と送信\n' +
    '・お電話：' + tel
  );
}

function handleFollow_(ev) {
  const liffUrl = getSetting_()['LIFF_URL'] || '';
  const shop = getSetting_()['店名'] || '当店';
  replyText_(ev.replyToken,
    'ご登録ありがとうございます！' + shop + '公式LINEです。\n\n' +
    'ご予約はこちらから受け付けています。\n' + liffUrl
  );
}

function handlePostback_(ev) {
  // postback機能は将来拡張用
}
