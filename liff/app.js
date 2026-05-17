/* たなかんち2 予約LIFF */
(function () {
  'use strict';

  const cfg = window.APP_CONFIG || {};
  const state = {
    settings: null,
    idToken: null,
    profile: null,
    party: null,
    date: null,
    time: null,
    seatPref: '',
    course: null,
    phone: ''
  };

  // ---- 画面切替 ---------------------------------------------------------
  function show(id) {
    document.querySelectorAll('.screen').forEach(function (el) {
      el.classList.toggle('visible', el.id === id);
    });
    window.scrollTo(0, 0);
  }

  // ---- API --------------------------------------------------------------
  async function api(action, data) {
    const res = await fetch(cfg.GAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: action, idToken: state.idToken, data: data || {} })
    });
    if (!res.ok) throw new Error('通信に失敗しました');
    return await res.json();
  }

  // ---- 初期化 -----------------------------------------------------------
  async function init() {
    try {
      await liff.init({ liffId: cfg.LIFF_ID });
      if (!liff.isLoggedIn()) {
        liff.login();
        return;
      }
      state.idToken = liff.getIDToken();
      state.profile = await liff.getProfile();
      const r = await api('settings');
      if (!r.ok) throw new Error(r.error || '初期化失敗');
      state.settings = r.settings;
      applySettings();
      show('menu');
    } catch (e) {
      console.error(e);
      document.getElementById('loading').innerHTML =
        '<p class="error">初期化に失敗しました：' + (e.message || e) + '</p>';
    }
  }

  function applySettings() {
    const s = state.settings;
    document.getElementById('shopName').textContent = s.shopName || 'たなかんち2';
    const tel = s.phone || '';
    const telDigits = tel.replace(/[^0-9]/g, '');
    [document.getElementById('telLink'), document.getElementById('telFoot')].forEach(function (a) {
      if (!a) return;
      a.textContent = tel || '店舗';
      a.href = telDigits ? 'tel:' + telDigits : '#';
    });
    document.getElementById('coursePrice').textContent = '¥' + (s.coursePrice || 0).toLocaleString();
    buildPartyGrid(s.autoMaxParty || 4, s.groupMinParty || 15);
  }

  // ---- ステップ1: 人数 --------------------------------------------------
  function buildPartyGrid(autoMax, groupMin) {
    const grid = document.getElementById('partyGrid');
    grid.innerHTML = '';
    for (let i = 1; i <= autoMax; i++) {
      const btn = document.createElement('button');
      btn.className = 'btn-tile';
      btn.textContent = i + '名';
      btn.addEventListener('click', function () { onPartySelected(i); });
      grid.appendChild(btn);
    }
    document.getElementById('partyNote').textContent =
      autoMax + '名を超えるご予約・' + groupMin + '名以上の貸切は、お電話にてお願いいたします。';
  }

  function onPartySelected(n) {
    state.party = n;
    buildCalendar();
    show('step-date');
  }

  // ---- ステップ2: 日付 --------------------------------------------------
  function buildCalendar() {
    const wrap = document.getElementById('calendar');
    wrap.innerHTML = '';
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const maxDays = state.settings.maxAcceptDays || 90;

    // 月単位で6か月先まで（受付期間内）
    const months = Math.min(Math.ceil(maxDays / 30) + 1, 6);
    for (let m = 0; m < months; m++) {
      const base = new Date(today.getFullYear(), today.getMonth() + m, 1);
      wrap.appendChild(buildMonth(base, today, maxDays));
    }
  }

  function buildMonth(firstDay, today, maxDays) {
    const wrap = document.createElement('div');
    wrap.className = 'month';
    const head = document.createElement('h3');
    head.textContent = firstDay.getFullYear() + '年' + (firstDay.getMonth() + 1) + '月';
    wrap.appendChild(head);

    const dows = ['日', '月', '火', '水', '木', '金', '土'];
    const dowRow = document.createElement('div');
    dowRow.className = 'cal-row cal-dow';
    dows.forEach(function (d, i) {
      const c = document.createElement('div');
      c.textContent = d;
      if (i === 0) c.classList.add('sun');
      if (i === 6) c.classList.add('sat');
      dowRow.appendChild(c);
    });
    wrap.appendChild(dowRow);

    const lastDay = new Date(firstDay.getFullYear(), firstDay.getMonth() + 1, 0);
    let row = document.createElement('div');
    row.className = 'cal-row';
    // 先頭の空セル
    for (let i = 0; i < firstDay.getDay(); i++) {
      const empty = document.createElement('div');
      empty.className = 'cal-cell empty';
      row.appendChild(empty);
    }
    for (let d = 1; d <= lastDay.getDate(); d++) {
      const cur = new Date(firstDay.getFullYear(), firstDay.getMonth(), d);
      const cell = document.createElement('button');
      cell.className = 'cal-cell';
      cell.textContent = d;
      const dow = cur.getDay();
      const diffDays = Math.floor((cur - today) / (24 * 3600 * 1000));
      const disabled = diffDays < 0 || diffDays > maxDays || dow === 1 || dow === 2;
      if (disabled) cell.disabled = true;
      if (dow === 0) cell.classList.add('sun');
      if (dow === 6) cell.classList.add('sat');
      cell.addEventListener('click', function () { onDateSelected(cur); });
      row.appendChild(cell);
      if (cur.getDay() === 6) {
        wrap.appendChild(row);
        row = document.createElement('div');
        row.className = 'cal-row';
      }
    }
    if (row.children.length) wrap.appendChild(row);
    return wrap;
  }

  async function onDateSelected(d) {
    state.date = formatYmd(d);
    document.getElementById('dateLabel').textContent =
      state.date + '（' + ['日', '月', '火', '水', '木', '金', '土'][d.getDay()] + '）/ ' + state.party + '名';
    const grid = document.getElementById('timeGrid');
    grid.innerHTML = '<p class="muted">空き状況を確認中…</p>';
    show('step-time');
    try {
      const r = await api('availability', {
        date: state.date,
        partySize: state.party,
        preferred: ''
      });
      if (!r.ok) {
        grid.innerHTML = '<p class="error">' + (r.error || '取得に失敗しました') + '</p>';
        return;
      }
      if (r.closed) {
        grid.innerHTML = '<p class="error">この日は休業日です</p>';
        return;
      }
      renderSlots(r.slots);
    } catch (e) {
      grid.innerHTML = '<p class="error">' + e.message + '</p>';
    }
  }

  function renderSlots(slots) {
    const grid = document.getElementById('timeGrid');
    grid.innerHTML = '';
    if (!slots.length) {
      grid.innerHTML = '<p class="muted">予約可能な時間がありません</p>';
      return;
    }
    slots.forEach(function (s) {
      const btn = document.createElement('button');
      btn.className = 'btn-tile';
      btn.textContent = s.time;
      btn.disabled = !s.available;
      if (!s.available) btn.classList.add('full');
      btn.addEventListener('click', function () { onTimeSelected(s.time); });
      grid.appendChild(btn);
    });
  }

  function onTimeSelected(t) {
    state.time = t;
    show('step-seat');
  }

  // ---- ステップ4: 席種 --------------------------------------------------
  document.getElementById('seatGrid').addEventListener('click', function (e) {
    const t = e.target.closest('[data-seat]');
    if (!t) return;
    state.seatPref = t.dataset.seat;
    show('step-course');
  });

  // ---- ステップ5: コース ------------------------------------------------
  document.addEventListener('click', function (e) {
    const t = e.target.closest('[data-course]');
    if (!t) return;
    state.course = t.dataset.course;
    document.getElementById('phone').value = state.phone;
    show('step-contact');
  });

  // ---- ステップ6: 連絡先 ------------------------------------------------
  document.getElementById('toConfirm').addEventListener('click', function () {
    const phone = document.getElementById('phone').value.trim();
    if (!/^[0-9\-+]{8,15}$/.test(phone)) {
      alert('お電話番号をご確認ください');
      return;
    }
    state.phone = phone;
    renderConfirm();
    show('step-confirm');
  });

  function renderConfirm() {
    document.getElementById('confDate').textContent = state.date + ' ' + state.time + '〜';
    document.getElementById('confParty').textContent = state.party + '名';
    document.getElementById('confSeat').textContent = state.seatPref || 'おまかせ';
    document.getElementById('confCourse').textContent = state.course;
    document.getElementById('confPhone').textContent = state.phone;
  }

  // ---- 確定 -------------------------------------------------------------
  document.getElementById('submit').addEventListener('click', async function () {
    const btn = this;
    const err = document.getElementById('submitError');
    err.textContent = '';
    btn.disabled = true;
    try {
      const r = await api('create', {
        date: state.date, time: state.time, partySize: state.party,
        preferred: state.seatPref, course: state.course, phone: state.phone
      });
      if (!r.ok) {
        err.textContent = r.error || '予約に失敗しました';
        btn.disabled = false;
        return;
      }
      renderDone(r.reservation);
      show('step-done');
    } catch (e) {
      err.textContent = e.message;
      btn.disabled = false;
    }
  });

  function renderDone(r) {
    const dl = document.getElementById('doneSummary');
    dl.innerHTML =
      '<dt>予約番号</dt><dd>' + r.id + '</dd>' +
      '<dt>日時</dt><dd>' + r.date + ' ' + r.time + '〜' + r.endTime + '</dd>' +
      '<dt>人数</dt><dd>' + r.partySize + '名</dd>' +
      '<dt>席</dt><dd>' + r.seatType + '</dd>' +
      '<dt>コース</dt><dd>' + r.course + '</dd>';
  }

  // ---- 予約確認・キャンセル --------------------------------------------
  async function loadMyReservations() {
    const wrap = document.getElementById('myList');
    wrap.innerHTML = '<p class="muted">読み込み中…</p>';
    show('my-reservations');
    try {
      const r = await api('mylist');
      if (!r.ok) {
        wrap.innerHTML = '<p class="error">' + (r.error || '取得失敗') + '</p>';
        return;
      }
      if (!r.reservations.length) {
        wrap.innerHTML = '<p class="muted">現在ご予約はありません。</p>';
        return;
      }
      wrap.innerHTML = '';
      r.reservations.forEach(function (rv) {
        const card = document.createElement('div');
        card.className = 'card';
        card.innerHTML =
          '<div class="r-line"><strong>' + rv.date + ' ' + rv.time + '〜</strong></div>' +
          '<div class="r-line muted">' + rv.partySize + '名 / ' + rv.seatType + ' / ' + rv.course + '</div>' +
          '<div class="r-line muted">予約番号：' + rv.id + '</div>';
        const btn = document.createElement('button');
        btn.className = 'btn ghost';
        btn.textContent = 'キャンセル';
        btn.addEventListener('click', function () { confirmCancel(rv.id); });
        card.appendChild(btn);
        wrap.appendChild(card);
      });
    } catch (e) {
      wrap.innerHTML = '<p class="error">' + e.message + '</p>';
    }
  }

  async function confirmCancel(id) {
    if (!confirm('この予約をキャンセルしますか？')) return;
    const r = await api('cancel', { id: id });
    if (!r.ok) { alert(r.error || 'キャンセルに失敗しました'); return; }
    alert('キャンセルを承りました');
    loadMyReservations();
  }

  // ---- グローバル: data-jumpで画面遷移 ---------------------------------
  document.addEventListener('click', function (e) {
    const t = e.target.closest('[data-jump]');
    if (!t) return;
    const target = t.dataset.jump;
    if (target === 'my-reservations') {
      loadMyReservations();
    } else {
      show(target);
    }
  });

  // ---- ヘルパ -----------------------------------------------------------
  function formatYmd(d) {
    const y = d.getFullYear();
    const m = ('0' + (d.getMonth() + 1)).slice(-2);
    const dd = ('0' + d.getDate()).slice(-2);
    return y + '-' + m + '-' + dd;
  }

  init();
})();
