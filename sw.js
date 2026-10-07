// ============================================================
// Service Worker — PWA app shell cache
// ------------------------------------------------------------
// นโยบายแบบปลอดภัย:
//  - แคชเฉพาะ "เปลือกแอป" (ไฟล์ static ใน origin เดียวกัน) เท่านั้น
//  - คำขอข้ามโดเมน (เช่น Google Apps Script API, Google Drive, CDN,
//    Google Fonts) จะ "ไม่ยุ่ง" — ปล่อยให้วิ่งผ่านเน็ตเวิร์กตามปกติเสมอ
//    เพื่อไม่ให้ข้อมูลเอกสาร/ลูกหนี้ค้างเป็นของเก่า
//  - หน้า HTML: network-first (ได้เวอร์ชันใหม่เสมอ ออฟไลน์ค่อยใช้แคช)
//  - ไฟล์ static (css/รูป/ไอคอน): ตอบจากแคชทันที แล้วอัปเดตเบื้องหลัง (เร็วมาก)
// ============================================================
// ─── OneSignal Web Push — รวมไว้ใน SW ตัวเดียว ไม่ต้องมี worker ซ้อนกัน ───
// ถ้ายังไม่เปิดใช้ OneSignal บรรทัดนี้จะเงียบๆ (โหลด SDK มารอ push แต่ไม่มีอะไรเกิดจนกว่าจะ subscribe)
// ถ้าโหลดไม่ได้ (เช่นออฟไลน์) ก็ข้ามไป ไม่กระทบการแคชเปลือกแอปด้านล่าง
try { importScripts('https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js'); } catch (e) {}

// ⚠️ เปลี่ยนเลขเวอร์ชันทุกครั้งที่แก้ไฟล์นี้ เพื่อล้างแคชเก่าในเครื่องผู้ใช้
const CACHE_NAME = 'finance-doc-tracker-v2';
const APP_SHELL = [
  './',
  './index.html',
  './tailwind-mini.css?v=1',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// เก็บลงแคชเฉพาะคำตอบที่สำเร็จจริง (กันแคชหน้า 404/error ไว้)
function putInCache(req, res) {
  if (!res || !res.ok || res.type !== 'basic') return;
  const copy = res.clone();
  caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)).catch(() => {});
}

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // จัดการเฉพาะ GET และเฉพาะไฟล์ใน origin เดียวกัน (เปลือกแอป)
  // ที่เหลือ (API/CDN/ข้ามโดเมน) ปล่อยผ่านโดยไม่แตะ
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) {
    return;
  }

  const isPage = req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html');

  if (isPage) {
    // หน้า HTML: network-first — ดึงของใหม่ก่อน ถ้าออฟไลน์ค่อยใช้แคช
    event.respondWith(
      fetch(req)
        .then((res) => { putInCache(req, res); return res; })
        .catch(() => caches.match(req).then((cached) => cached || caches.match('./index.html')))
    );
    return;
  }

  // ไฟล์ static: stale-while-revalidate — ตอบจากแคชทันที แล้วอัปเดตแคชเบื้องหลัง
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => { putInCache(req, res); return res; })
        .catch(() => cached);
      return cached || network;
    })
  );
});
