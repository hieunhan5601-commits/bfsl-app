// Trang Góp mặt: hỏi máy chủ đợt đang mở (suất nào còn), nén ảnh ngay trên máy rồi gửi hồ sơ, tra hay rút hồ sơ bằng mã.
// Máy chủ là hàm bfsl-tuhung (op gop_so, gop, gop_tra, gop_rut); trần và thời hạn giữ ảnh ở server/bfsl-tuhung/index.ts.
(function () {
  var API = 'https://zotxsgmxepnetdywfdzr.supabase.co/functions/v1/bfsl-tuhung';
  var MAX_BYTES = 210000;      // máy chủ nhận tới 220 KB
  var CODE_RE = /^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/;
  var ERR = {
    closed: 'Đợt này đã đủ người hoặc đang tạm đóng. Theo dõi Nhật ký để biết đợt sau.',
    queue_full: 'Đang có nhiều hồ sơ chờ duyệt. Bạn quay lại sau vài ngày nhé.',
    too_many: 'Máy này đã gửi 2 hồ sơ trong hôm nay. Mai gửi tiếp được.',
    bad_photo: 'Ảnh không hợp lệ. Thử chọn ảnh khác.',
    too_big: 'Ảnh vẫn còn nặng quá. Thử chọn ảnh khác.',
    need_name_job: 'Cần tên (ít nhất 2 chữ) và nghề.',
    need_consent: 'Cần đánh dấu đủ ba ô đồng ý.',
    bad_form: 'Không gửi được hồ sơ này.',
    bad_code: 'Mã hồ sơ có dạng XXXX-XXXX.',
    net: 'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.'
  };
  var STATUS = {
    cho: 'Đang chờ duyệt', nhan: 'Được nhận, đang vẽ', ve_lai: 'Được nhận: vẽ lại nhân vật đang có', xong: 'Đã vào game',
    co: 'Bạn đã có trong game', chua: 'Chưa nhận ở đợt này', rut: 'Đã rút'
  };
  function $(id) { return document.getElementById(id); }
  function get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function put(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  // mã máy ngẫu nhiên, cùng khoá với game (cùng địa chỉ trang): máy chủ dùng để giới hạn số hồ sơ mỗi máy mỗi ngày
  function dev() {
    var d = get('bfsl_may') || '';
    if (!/^[a-z0-9]{8}$/.test(d)) { d = (Math.random().toString(36).slice(2) + '00000000').slice(0, 8); put('bfsl_may', d); }
    return d;
  }
  function call(body) {
    return fetch(API, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json(); }, function () { return { ok: false, error: 'net' }; })
      .catch(function () { return { ok: false, error: 'net' }; });
  }
  function say(el, kind, text) {
    el.hidden = !text; el.className = 'msg' + (kind ? ' ' + kind : ''); el.textContent = text || '';
  }
  function slotName(id) {
    var b = document.querySelector('[data-slot="' + id + '"] b');
    return b ? b.textContent : id;
  }

  // đợt đang mở
  var so = $('g-so'), form = $('g-form'), msg = $('g-msg'), send = $('g-send'), want = $('g-want');
  var open = true;
  document.querySelectorAll('#g-slots [data-slot]').forEach(function (li) {
    var o = document.createElement('option');
    o.value = li.getAttribute('data-slot');
    o.textContent = slotName(o.value) + ' (' + li.querySelector('span').textContent + ')';
    want.appendChild(o);
  });
  call({ op: 'gop_so' }).then(function (r) {
    if (!r.ok) { so.textContent = 'Chưa hỏi được máy chủ số suất còn lại. Bạn vẫn gửi thử được.'; return; }
    var taken = {};
    (r.taken || []).forEach(function (x) { taken[x] = true; });
    document.querySelectorAll('#g-slots [data-slot]').forEach(function (li) {
      var id = li.getAttribute('data-slot');
      if (taken[id]) { li.classList.add('taken'); li.querySelector('em').textContent = 'Đã có người'; }
    });
    Array.prototype.forEach.call(want.options, function (o) { if (taken[o.value]) { o.disabled = true; } });
    var full = r.pending >= r.pending_cap;
    open = r.open && !full;
    so.classList.toggle('off', !open);
    if (!r.open) {
      so.textContent = 'Đợt ' + r.dot + ' đã đủ người. Cảm ơn mọi người đã gửi!';
    } else if (full) {
      so.textContent = 'Đợt ' + r.dot + ' còn ' + r.left + ' trên ' + r.slots.length + ' suất, nhưng đang đủ hồ sơ chờ duyệt. Quay lại sau vài ngày nhé.';
    } else {
      so.textContent = 'Đợt ' + r.dot + ' · còn ' + r.left + ' trên ' + r.slots.length + ' suất · ' + r.pending + ' hồ sơ đang chờ duyệt';
    }
    if (!open) { send.disabled = true; say(msg, 'err', r.open ? ERR.queue_full : ERR.closed); }
  });

  // ảnh: thu nhỏ cạnh dài về 900 điểm ảnh, nén JPEG tới khi dưới MAX_BYTES
  var photo = null, file = $('g-anh'), xem = $('g-xem'), dropT = $('g-drop-t');
  function shrink(f) {
    return new Promise(function (ok, bad) {
      var url = URL.createObjectURL(f), img = new Image();
      img.onload = function () {
        URL.revokeObjectURL(url);
        var w = img.naturalWidth, h = img.naturalHeight, side = 900, q = 0.86;
        if (Math.min(w, h) < 300) { bad('small'); return; }
        for (;;) {
          var k = Math.min(1, side / Math.max(w, h)), cw = Math.round(w * k), ch = Math.round(h * k);
          var c = document.createElement('canvas');
          c.width = cw; c.height = ch;
          var g = c.getContext('2d');
          g.fillStyle = '#fff'; g.fillRect(0, 0, cw, ch); g.drawImage(img, 0, 0, cw, ch);
          var data = c.toDataURL('image/jpeg', q), bytes = Math.floor((data.length - 23) * 3 / 4);
          if (bytes <= MAX_BYTES || side < 500) { ok({ data: data, bytes: bytes }); return; }
          if (q > 0.62) { q -= 0.08; } else { side = Math.round(side * 0.85); }
        }
      };
      img.onerror = function () { URL.revokeObjectURL(url); bad('read'); };
      img.src = url;
    });
  }
  file.addEventListener('change', function () {
    var f = file.files && file.files[0];
    photo = null; xem.hidden = true;
    if (!f) { dropT.textContent = 'Bấm để chọn hoặc chụp ảnh'; return; }
    dropT.textContent = 'Đang thu nhỏ ảnh…';
    shrink(f).then(function (p) {
      photo = p; xem.src = p.data; xem.hidden = false;
      dropT.textContent = 'Ảnh sẽ gửi (' + Math.round(p.bytes / 1024) + ' KB). Bấm để đổi ảnh khác.';
      say(msg, '', '');
    }, function (why) {
      dropT.textContent = 'Bấm để chọn hoặc chụp ảnh';
      say(msg, 'err', why === 'small' ? 'Ảnh nhỏ quá, cần cạnh ngắn ít nhất 300 điểm ảnh.' : 'Máy không đọc được ảnh này. Thử chụp màn hình ảnh đó rồi gửi ảnh chụp.');
    });
  });

  function val(id) { return $(id).value.trim(); }
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (!photo) { say(msg, 'err', 'Chọn một tấm ảnh chân dung trước đã.'); return; }
    if (val('g-ten').length < 2 || val('g-nghe').length < 2) { say(msg, 'err', ERR.need_name_job); return; }
    if (!$('g-ok1').checked || !$('g-ok2').checked || !$('g-ok3').checked) { say(msg, 'err', ERR.need_consent); return; }
    send.disabled = true;
    say(msg, '', 'Đang gửi…');
    call({
      op: 'gop', dev: dev(), photo: photo.data, name: val('g-ten'), job: val('g-nghe'), nick: val('g-nick'), pos: $('g-pos').value,
      foot: $('g-foot').value, want: want.value, ingame: val('g-ingame'), quote: val('g-quote'), hp: $('g-web').value,
      ok1: true, ok2: true, ok3: true
    }).then(function (r) {
      send.disabled = !open;
      if (!r.ok) { say(msg, 'err', ERR[r.error] || 'Máy chủ đang bận, thử lại sau ít phút.'); return; }
      remember(r.code, val('g-ten'));
      say(msg, '', '');
      form.hidden = true;
      $('g-code').textContent = r.code;
      $('g-done').hidden = false;
      $('g-done').focus();
    });
  });
  $('g-copy').addEventListener('click', function () {
    var b = this, t = $('g-code').textContent;
    if (navigator.clipboard) { navigator.clipboard.writeText(t).then(function () { b.textContent = 'Đã chép'; }, function () {}); }
  });
  $('g-again').addEventListener('click', function () {
    $('g-done').hidden = true; form.hidden = false; form.reset(); photo = null; xem.hidden = true;
    dropT.textContent = 'Bấm để chọn hoặc chụp ảnh'; $('g-copy').textContent = 'Chép mã';
  });

  // mã hồ sơ đã gửi từ trình duyệt này (chỉ để tra cho nhanh; máy chủ không cần)
  function mine() { try { return JSON.parse(get('bfsl_gop') || '[]').filter(function (x) { return CODE_RE.test(x.c); }); } catch (e) { return []; } }
  function remember(code, name) {
    var l = mine().filter(function (x) { return x.c !== code; });
    l.unshift({ c: code, n: name });
    put('bfsl_gop', JSON.stringify(l.slice(0, 6)));
    showMine();
  }
  function showMine() {
    var box = $('g-mine'), l = mine();
    box.innerHTML = '';
    box.hidden = !l.length;
    l.forEach(function (x) {
      var b = document.createElement('button');
      b.type = 'button'; b.textContent = x.c + ' · ' + x.n;
      b.addEventListener('click', function () { $('g-ma').value = x.c; look(x.c); });
      box.appendChild(b);
    });
  }
  showMine();

  // tra, rút
  var res = $('g-res');
  function line(tag, cls, text) { var el = document.createElement(tag); if (cls) { el.className = cls; } el.textContent = text; return el; }
  function show(r) {
    res.hidden = false; res.className = 'msg'; res.innerHTML = '';
    if (!r.ok) { res.className = 'msg err'; res.textContent = ERR[r.error] || 'Máy chủ đang bận, thử lại sau ít phút.'; return; }
    if (!r.found) { res.className = 'msg err'; res.textContent = 'Không có hồ sơ nào mang mã này. Hồ sơ không được nhận hay đã rút sẽ bị xoá sau 30 ngày.'; return; }
    var st = STATUS[r.status] || r.status;
    if ((r.status === 'nhan' || r.status === 'xong') && /^g\d\d$/.test(r.slot)) { st += ' · suất của ' + slotName(r.slot); }
    res.appendChild(line('p', 'st', st));
    res.appendChild(line('p', '', r.name + ' · ' + r.job));
    if (r.note) { res.appendChild(line('p', '', 'Lời nhắn: ' + r.note)); }
    res.appendChild(line('p', 'small', 'Gửi ngày ' + new Date(r.at * 1000).toLocaleDateString('vi-VN') + (r.decided_at ? ' · cập nhật ngày ' + new Date(r.decided_at * 1000).toLocaleDateString('vi-VN') : '')));
    if (r.status !== 'rut') {
      var b = line('button', 'btn btn-ghost', 'Rút hồ sơ này');
      b.type = 'button';
      b.addEventListener('click', function () {
        if (!window.confirm('Rút hồ sơ ' + r.code + '? Ảnh bị xoá ngay và không lấy lại được.')) { return; }
        b.disabled = true;
        call({ op: 'gop_rut', gcode: r.code }).then(show);
      });
      var p = document.createElement('p'); p.appendChild(b); res.appendChild(p);
    }
  }
  function look(code) {
    code = String(code || '').trim().toUpperCase().replace(/\s+/g, '');
    if (/^[A-Z2-9]{8}$/.test(code)) { code = code.slice(0, 4) + '-' + code.slice(4); }
    if (!CODE_RE.test(code)) { show({ ok: false, error: 'bad_code' }); return; }
    say(res, '', 'Đang tra…');
    call({ op: 'gop_tra', gcode: code }).then(show);
  }
  $('g-look').addEventListener('submit', function (e) { e.preventDefault(); look($('g-ma').value); });
})();
