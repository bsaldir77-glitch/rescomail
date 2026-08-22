// Imzali httpOnly cerez oturumu + giris hiz siniri. Ek bagimlilik yok, tek yonetici icin yeterli.
const crypto = require('crypto');

const SURE_MS = 8 * 60 * 60 * 1000; // 8 saat
const denemeler = new Map(); // ip -> {sayi, ilk}

function imzala(veri) {
  return crypto.createHmac('sha256', process.env.OTURUM_SECRET).update(veri).digest('base64url');
}

function cerez_uret(eposta) {
  const govde = Buffer.from(JSON.stringify({ e: eposta, x: Date.now() + SURE_MS })).toString('base64url');
  return `${govde}.${imzala(govde)}`;
}

function cerez_coz(deger) {
  if (!deger) return null;
  const [govde, imza] = deger.split('.');
  if (!govde || !imza) return null;
  if (!crypto.timingSafeEqual(Buffer.from(imzala(govde)), Buffer.from(imza))) return null;
  try {
    const j = JSON.parse(Buffer.from(govde, 'base64url').toString());
    if (j.x < Date.now()) return null;
    return j.e;
  } catch { return null; }
}

function oturum_gerekli(req, res, next) {
  const ham = (req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith('rm_oturum='));
  const eposta = cerez_coz(ham ? ham.slice('rm_oturum='.length) : null);
  if (!eposta) return res.status(403).json({ hata: 'Oturum yok' }); // 401 degil — logout tuzagi dersi
  req.yonetici = eposta;
  next();
}

const SINIR = 12;                 // 15 dk penceresinde IP basina istek
const PENCERE = 15 * 60 * 1000;

function hiz_siniri(req, res, next) {
  const ip = req.headers['x-real-ip'] || req.socket.remoteAddress;
  const simdi = Date.now();
  const d = denemeler.get(ip);

  if (d && simdi - d.ilk < PENCERE && d.sayi >= SINIR)
    return res.status(429).json({ hata: 'Cok fazla deneme — 15 dk sonra tekrar' });

  if (!d || simdi - d.ilk >= PENCERE) denemeler.set(ip, { sayi: 1, ilk: simdi });
  else d.sayi++;

  // BASARILI istek kotayi YAKMASIN: kod gonderildi / giris oldu gibi 2xx yanitlarda
  // sayaci geri al. Kota yalnizca gercek basarisiz denemeleri saysin — yoksa SMS
  // gecikince iki kez deneyen kullanici kendi kendini kilitliyor.
  res.on('finish', () => {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      const k = denemeler.get(ip);
      if (k && k.sayi > 0) k.sayi--;
    }
  });

  next();
}

// Yonetici destegi icin: bir IP'nin kotasini elle sifirlar (kilit kalirsa)
function hiz_sifirla(ip) { if (ip) denemeler.delete(ip); else denemeler.clear(); }

module.exports = { cerez_uret, oturum_gerekli, hiz_siniri, hiz_sifirla };
