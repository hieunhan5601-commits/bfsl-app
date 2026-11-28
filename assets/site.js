// Trang web BFSL: mở mục lục trên điện thoại, phóng to ảnh chụp game, chỉ phát clip khi đang nhìn thấy, ghi số bản game đang chạy,
// và lo việc cài game lên màn hình chính (docs/WEB.md mục 11.4).
(function () {
  // nguồn người chơi (?tu=tiktok, ?tu=fb-nhom…): giữ nguồn đầu tiên, game gửi về máy chủ khi mở (docs/KEO-NGUOI-CHOI.md)
  try {
    var q = new URLSearchParams(location.search), tu = (q.get('tu') || '').toLowerCase();
    if (/^[a-z0-9-]{1,24}$/.test(tu) && !localStorage.getItem('bfsl_tu')) {
      localStorage.setItem('bfsl_tu', JSON.stringify({ tu: tu, ban: Math.max(0, parseInt(q.get('ban') || '0', 10) || 0), at: Date.now() }));
    }
  } catch (e) {}
})();

(function () {
  var root = document.body.getAttribute('data-root') || '';
  var game = document.body.getAttribute('data-game') || root + 'choi/';

  // Cài game. Tệp manifest chỉ gắn cho máy không phải iPhone, iPad: iPhone mà có manifest thì biểu tượng ở màn hình chính
  // lấy start_url trong đó và bỏ mất phần #bfsl= mang tiến trình. Service worker chỉ cất các tệp của game (sw.js).
  var IOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var inst = window.bfslSite = { ios: IOS, prompt: null, installed: false, game: game };
  if (!IOS) {
    var ml = document.createElement('link');
    ml.rel = 'manifest'; ml.href = root + 'manifest.webmanifest';
    document.head.appendChild(ml);
  }
  if ('serviceWorker' in navigator && window.isSecureContext) {
    navigator.serviceWorker.register(root + 'sw.js').catch(function () {});
  }
  function installChanged() { document.dispatchEvent(new Event('bfsl-install')); }
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); inst.prompt = e; installChanged(); });
  window.addEventListener('appinstalled', function () { inst.prompt = null; inst.installed = true; installChanged(); });
  // gọi hộp cài của trình duyệt; trả về lời hứa true nếu người chơi đồng ý, null nếu trình duyệt không cho gọi
  inst.ask = function () {
    var p = inst.prompt;
    if (!p) { return Promise.resolve(null); }
    inst.prompt = null;
    p.prompt();
    return p.userChoice.then(function (c) {
      var ok = !!(c && c.outcome === 'accepted');
      if (ok) { inst.installed = true; }
      installChanged();
      return ok;
    }, function () { installChanged(); return false; });
  };
  // nút [data-install]: có hộp cài thì gọi luôn, không thì sang trang Tải game
  document.querySelectorAll('[data-install]').forEach(function (b) {
    b.addEventListener('click', function (ev) {
      if (!inst.prompt) { return; }
      ev.preventDefault();
      inst.ask();
    });
  });

  var menu = document.querySelector('.sh-menu'), nav = document.getElementById('sh-nav');
  if (menu && nav) {
    menu.addEventListener('click', function () {
      var open = nav.classList.toggle('open');
      menu.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }

  // ảnh chụp game: bấm để xem to
  var lb = document.getElementById('lb'), im = document.getElementById('lbimg');
  if (lb && im) {
    document.querySelectorAll('img.shot').forEach(function (el) {
      el.tabIndex = 0;
      function open() { im.src = el.currentSrc || el.src; im.alt = el.alt; try { lb.showModal(); } catch (e) {} }
      el.addEventListener('click', open);
      el.addEventListener('keydown', function (e) { if (e.key === 'Enter') open(); });
    });
    lb.addEventListener('click', function () { lb.close(); });
  }

  // clip: tự phát (tắt tiếng) khi lướt tới, dừng khi lướt qua, để điện thoại khỏi tải và giải mã mọi clip cùng lúc
  var vids = document.querySelectorAll('video[data-auto]');
  if (vids.length && 'IntersectionObserver' in window) {
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        var v = e.target;
        if (e.isIntersecting && !reduce) {
          if (v.preload !== 'auto') { v.preload = 'auto'; }
          var p = v.play(); if (p && p.catch) { p.catch(function () {}); }
        } else if (!v.paused) { v.pause(); }
      });
    }, { threshold: 0.35 });
    vids.forEach(function (v) { io.observe(v); });
  }
  // nút tiếng trên mỗi clip: bật tiếng clip này thì tắt tiếng mọi clip khác
  var snds = [];
  vids.forEach(function (v) {
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'snd'; b.textContent = 'Bật tiếng'; b.setAttribute('aria-pressed', 'false');
    b.addEventListener('click', function () {
      var on = v.muted;
      snds.forEach(function (s) { s[0].muted = true; s[1].setAttribute('aria-pressed', 'false'); s[1].textContent = 'Bật tiếng'; });
      if (on) {
        v.muted = false; b.setAttribute('aria-pressed', 'true'); b.textContent = 'Tắt tiếng';
        if (v.paused) { var p = v.play(); if (p && p.catch) { p.catch(function () {}); } }
      }
    });
    (v.parentNode.querySelector('figcaption') || v.parentNode).prepend(b);
    snds.push([v, b]);
  });

  // số bản game đang chạy (cùng tệp nút CẬP NHẬT trong game hỏi)
  var spots = document.querySelectorAll('[data-ver]');
  if (spots.length) {
    fetch(game + 'version.txt', { cache: 'no-store' }).then(function (r) { return r.ok ? r.text() : ''; }).then(function (t) {
      t = String(t || '').trim();
      if (/^[0-9.]{1,8}$/.test(t)) { spots.forEach(function (s) { s.textContent = 'bản ' + t + ' (Beta)'; }); }
    }).catch(function () {});
  }
})();
