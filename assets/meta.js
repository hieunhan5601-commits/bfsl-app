// Trang Meta: hỏi máy chủ (op meta của bfsl-tuhung) đã gom bao nhiêu ván; đủ 300 ván thì vẽ bảng hệ nghề theo bậc.
// Máy chủ tự gom và giữ đệm 10 phút, trang chỉ đọc. Luật tính ở server/bfsl-tuhung/index.ts, mục op meta.
(function () {
  var API = 'https://zotxsgmxepnetdywfdzr.supabase.co/functions/v1/bfsl-tuhung';
  // tên hệ và số người cần cho từng bậc, chép từ proto3/scripts/data.gd (TRAITS)
  var TRAIT = {
    banh_xe: ['Bánh Xe', [2, 3]], hang_rong: ['Hàng Rong', [2, 3]], lo_ta: ['Lò Tạ', [2, 3]], tay_nghe: ['Tay Nghề', [2, 3]],
    quan_xa: ['Quán Xá', [2]], ngoi_sao: ['Ngôi Sao', [1]], doi_truong: ['Đội Trưởng', [1, 2, 3]], giang_ho: ['Giang Hồ', [2, 4]]
  };
  function $(id) { return document.getElementById(id); }
  function pct(x) { return Math.round(Number(x) * 100) + '%'; }
  function cell(tr, text, num) {
    var td = document.createElement('td');
    td.textContent = text;
    if (num) { td.className = 'n'; }
    tr.appendChild(td);
  }
  var state = $('m-state');
  fetch(API, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ op: 'meta' }) })
    .then(function (r) { return r.json(); })
    .then(function (r) {
      if (!r || !r.ok) { throw new Error('meta'); }
      var n = Number(r.n) || 0, need = Number(r.need) || 300;
      var rows = (r.traits || []).filter(function (t) { return TRAIT[t.trait]; });
      $('m-meter').hidden = false;
      $('m-fill').style.width = Math.min(100, Math.round(100 * n / need)) + '%';
      if (n < need || !rows.length) {
        state.textContent = 'Đã gom ' + n + ' / ' + need + ' ván trong ' + r.days + ' ngày gần nhất. Chưa đủ để lên bảng.';
        return;
      }
      state.textContent = 'Đã gom ' + n + ' ván trong ' + r.days + ' ngày gần nhất' + (r.ver ? ', mới nhất từ bản ' + r.ver : '') + '.';
      var body = $('m-rows');
      rows.forEach(function (t) {
        var d = TRAIT[t.trait], tier = Number(t.tier) || 1;
        var tr = document.createElement('tr');
        cell(tr, d[0]);
        cell(tr, tier + ' (' + (d[1][tier - 1] || '?') + ' người)');
        cell(tr, String(t.n), true);
        cell(tr, Number(t.avg_place).toFixed(2).replace('.', ','), true);
        cell(tr, pct(t.win), true);
        cell(tr, pct(t.top2), true);
        body.appendChild(tr);
      });
      var when = new Date((Number(r.at) || Date.now() / 1000) * 1000);      // máy chủ trả giây
      $('m-cap').textContent = 'Xếp theo hạng trung bình, tốt nhất lên đầu. Máy chủ tính lúc ' + when.toLocaleString('vi-VN') + '.';
      $('m-out').hidden = false;
    })
    .catch(function () { state.textContent = 'Chưa hỏi được máy chủ. Tải lại trang sau ít phút.'; });
})();
