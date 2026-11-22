/*
 * 아침 건강달리기 체크 화면 — 오프라인 도우미 (서비스 워커)
 * 한 번 인터넷으로 열어 두면, 운동장처럼 와이파이가 없는 곳에서도 화면이 다시 열린다.
 * 체크 화면을 고쳐서 다시 올릴 때는 아래 VERSION 숫자를 지금보다 하나 올린다 (예: nb-v9 → nb-v10).
 */
var VERSION = 'nb-v86';
var PRECACHE = [
  './',
  './index.html',
  './html5-qrcode.min.js',
  './qrcode.min.js',
  'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js',
  'https://fonts.googleapis.com/css2?family=Black+Han+Sans&family=Noto+Sans+KR:wght@400;500;700;900&display=swap'
];
var NET_WAIT_MS = 4000;   // 와이파이가 약할 때 이 시간 안에 답이 없으면 저장해 둔 화면을 보여 준다

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(VERSION).then(function (cache) {
      // 하나가 실패해도 나머지는 저장되도록 하나씩 넣는다
      return Promise.all(PRECACHE.map(function (url) {
        return cache.add(new Request(url, { cache: 'reload' })).catch(function () {});
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== VERSION; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

function fromCache(req, isPage) {
  return caches.match(req, { ignoreSearch: true }).then(function (hit) {
    if (hit || !isPage) return hit;
    return caches.match('./index.html').then(function (h) { return h || caches.match('./'); });
  });
}

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;                       // 기록 저장(POST)은 건드리지 않는다
  var url = new URL(req.url);
  if (url.hostname.indexOf('script.google') >= 0) return;  // 구글 시트 통신도 건드리지 않는다
  if (url.hostname.indexOf('open-meteo') >= 0) return;     // 날씨는 늘 새로 받아야 하니 저장하지 않는다

  // 체크 화면과 같은 폴더 파일: 인터넷이 빠르면 새것, 느리거나 없으면 저장해 둔 것
  if (req.mode === 'navigate' || url.origin === self.location.origin) {
    var isPage = req.mode === 'navigate';
    event.respondWith(new Promise(function (resolve) {
      var settled = false;
      var finish = function (res) { if (!settled && res) { settled = true; resolve(res); } };
      var net = fetch(req).then(function (res) {
        if (res && res.ok) {
          var copy = res.clone();
          caches.open(VERSION).then(function (c) { c.put(req, copy); });
        }
        return res;
      });
      net.then(finish, function () {
        fromCache(req, isPage).then(function (hit) { finish(hit || Response.error()); });
      });
      setTimeout(function () {
        fromCache(req, isPage).then(function (hit) { if (hit) finish(hit); });
      }, NET_WAIT_MS);
    }));
    return;
  }

  // QR 프로그램·글꼴(바깥 서버): 저장해 둔 것을 먼저, 없으면 받아서 저장
  event.respondWith(
    caches.match(req).then(function (hit) {
      if (hit) return hit;
      return fetch(req).then(function (res) {
        if (res && (res.ok || res.type === 'opaque')) {
          var copy = res.clone();
          caches.open(VERSION).then(function (c) { c.put(req, copy); });
        }
        return res;
      });
    })
  );
});
