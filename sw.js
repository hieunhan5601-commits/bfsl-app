// Service worker của bfsl.bloodflame.app: cất game (/choi/) trong máy để mở nhanh và chơi được khi mất mạng. Thiết kế: docs/WEB.md mục 11.4.
// Bản cũ (tới 0.29) lấy bản cũ từ bộ đệm rồi tự nạp lại trang, nên đã bị gỡ. Bản này tránh đúng lỗi đó:
// - Gói dữ liệu index.vNNN.pck mang số bản trong tên, không bao giờ đổi: có trong bộ đệm thì dùng, chưa có thì tải, cất, xoá gói bản cũ.
// - Mọi tệp khác của game (index.html, index.js, index.wasm, version.txt, hình): hỏi mạng trước. Trình duyệt tự hỏi lại bằng ETag,
//   tệp không đổi thì không tải lại. Mất mạng mới lấy bộ đệm. Không bao giờ tự nạp lại trang: nút CẬP NHẬT trong game lo việc đó.
// - Trang web (ngoài /choi/) không đụng tới.
const CACHE = 'bfsl-choi-1';
const PCK_RE = /\/index\.v\d+\.pck$/;
const GAME = new URL('choi/', self.registration.scope).pathname;      // '/choi/' trên bfsl.bloodflame.app; đường dẫn tương đối để chạy thử được ở thư mục con
const CDN = 'https://bfsl-goi.bloodflame.workers.dev';      // kho R2 phát gói dữ liệu (tools/deploy_cdn.sh)

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || req.headers.has('range')) return;
  const u = new URL(req.url);
  if (u.origin === CDN && PCK_RE.test(u.pathname)) { e.respondWith(pack(req, u)); return; }
  if (u.origin !== self.location.origin || !u.pathname.startsWith(GAME)) return;
  e.respondWith(PCK_RE.test(u.pathname) ? pack(req, u) : fresh(req, u));
});

// gói dữ liệu: bộ đệm trước
async function pack(req, u) {
  const c = await caches.open(CACHE);
  const key = u.origin + u.pathname;
  // cùng một gói có thể đã cất từ GitHub (trước khi chuyển sang R2) hoặc từ R2: tên có số bản nên bản nào cũng dùng được
  const name = u.pathname.slice(u.pathname.lastIndexOf('/') + 1);
  const hit = (await c.match(key)) || (await c.match(self.location.origin + GAME + name)) || (await c.match(CDN + '/' + name));
  if (hit) return hit;
  const res = await fetch(req);
  if (res.status === 200) {
    c.put(key, res.clone())
      .then(() => c.keys())
      .then((ks) => Promise.all(ks.filter((k) => PCK_RE.test(new URL(k.url).pathname) && k.url !== key).map((k) => c.delete(k))))
      .catch(() => {});
  }
  return res;
}

// tệp khác: mạng trước; chỉ ghi lại bộ đệm khi tệp thật sự đổi (ETag khác), để máy chạy 40 MB không bị ghi lại mỗi lần mở
async function fresh(req, u) {
  const c = await caches.open(CACHE);
  const key = u.origin + u.pathname;
  try {
    const res = await fetch(req);
    if (res.status === 200) {
      const old = await c.match(key);
      const tag = res.headers.get('etag') || res.headers.get('last-modified') || '';
      if (!old || !tag || (old.headers.get('etag') || old.headers.get('last-modified') || '') !== tag) {
        c.put(key, res.clone()).catch(() => {});
      }
    }
    return res;
  } catch (err) {
    const hit = await c.match(key);
    if (hit) return hit;
    throw err;
  }
}
