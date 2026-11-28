// Trang Tải game: đưa cách cài của máy đang xem lên đầu, gọi hộp cài của trình duyệt (site.js giữ sự kiện beforeinstallprompt),
// và tải sẵn dữ liệu game: trang tự tải từng tệp của /choi/, service worker (sw.js) cất lại trên đường đi.
function bfslDl() {
  var S = window.bfslSite;
  if (!S) { return; }
  function $(id) { return document.getElementById(id); }
  var kind = S.ios ? 'ios' : (/Android/.test(navigator.userAgent) ? 'android' : 'pc');
  var mine = $('dl-' + kind), ways = $('dl-ways');
  if (mine && ways) { mine.classList.add('here'); ways.insertBefore(mine, ways.firstChild); }
  var app = navigator.standalone === true || (window.matchMedia && (matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: fullscreen)').matches));

  function paint() {
    $('dl-auto').hidden = !S.prompt;
    $('dl-done').hidden = !(S.installed || app);
    // iPhone: biểu tượng trên màn hình chính có bộ nhớ riêng, tải sẵn trong Safari không giúp gì
    $('dl-pre').hidden = S.ios || !('serviceWorker' in navigator) || !window.isSecureContext;
  }
  document.addEventListener('bfsl-install', paint);
  paint();
  $('dl-go').addEventListener('click', function () {
    S.ask().then(function (ok) { if (ok) { pre(); } });
  });

  var busy = false, got = 0, total = 0;
  function mb(n) { return (n / 1048576).toFixed(0); }
  function show(text) {
    $('dl-meter').hidden = false;
    $('dl-fill').style.width = (total ? Math.min(100, 100 * got / total) : 0) + '%';
    $('dl-pre-msg').textContent = text || ('Đã tải ' + mb(got) + (total ? ' / ' + mb(total) : '') + ' MB');
  }
  // chờ service worker nắm trang, để mọi tệp tải về đi qua nó và được cất (lần đầu mở trang có thể phải chờ vài giây)
  function ready() {
    if (navigator.serviceWorker.controller) { return Promise.resolve(true); }
    return new Promise(function (res) {
      var t = setTimeout(function () { res(!!navigator.serviceWorker.controller); }, 8000);
      navigator.serviceWorker.addEventListener('controllerchange', function () { clearTimeout(t); res(true); });
    });
  }
  function size(url) {
    return fetch(url, { method: 'HEAD', cache: 'no-store' }).then(function (r) { return +r.headers.get('content-length') || 0; }, function () { return 0; });
  }
  function grab(url) {
    return fetch(url).then(function (r) {
      if (!r.ok) { throw new Error('http ' + r.status); }
      if (!r.body || !r.body.getReader) { return r.arrayBuffer().then(function (b) { got += b.byteLength; show(); }); }
      var rd = r.body.getReader();
      function step() {
        return rd.read().then(function (x) {
          if (x.done) { return; }
          got += x.value.length;
          show();
          return step();
        });
      }
      return step();
    });
  }
  function pre() {
    if (busy) { return; }
    busy = true; got = 0; total = 0;
    $('dl-pre-go').disabled = true;
    show('Đang hỏi bản mới nhất…');
    var files;
    ready().then(function (ok) {
      if (!ok) { throw new Error('sw'); }
      return fetch(S.game + 'version.txt', { cache: 'no-store' });
    }).then(function (r) { return r.text(); }).then(function (v) {
      v = String(v).trim();
      if (!/^[0-9.]{1,8}$/.test(v)) { throw new Error('ver'); }
      files = [S.game, S.game + 'index.js', S.game + 'index.wasm', S.game + 'index.v' + v.replace(/\./g, '') + '.pck'];
      return Promise.all(files.map(size));
    }).then(function (ns) {
      total = ns.reduce(function (a, b) { return a + b; }, 0);
      show();
      return files.reduce(function (p, url) { return p.then(function () { return grab(url); }); }, Promise.resolve());
    }).then(function () {
      got = total || got;
      show('Xong. Lần sau mở game là vào ngay, kể cả khi mất mạng (chơi với máy).');
    }).catch(function (e) {
      show(e && e.message === 'sw' ? 'Trình duyệt chưa sẵn sàng cất game. Tải lại trang rồi thử lại.' : 'Chưa tải xong (mạng chập chờn?). Bấm lại để thử lại.');
      $('dl-pre-go').disabled = false;
      busy = false;
    });
  }
  $('dl-pre-go').addEventListener('click', pre);
}
// site.js (tạo window.bfslSite) nằm cuối trang, chạy sau tệp này: chờ cả hai chạy xong
if (window.bfslSite) { bfslDl(); } else { document.addEventListener('DOMContentLoaded', bfslDl); }
