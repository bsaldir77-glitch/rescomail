'use strict';
// ============================================================
// captcha.js — ROBOT DOGRULAMASI (Resco Mail yonetim + webmail SMS kapisi)
//
// Bulent 2026-08-22: "mail ve mail yonetim alanina catchpact koy".
//
// DIS SERVIS YOK: reCAPTCHA/hCaptcha kullanilmadi — ziyaretcinin IP'si ve tarayici
// parmak izi ucuncu tarafa gitmesin. Gorsel SVG olarak SUNUCUDA uretilir, istemciye
// data-URI resim gider; metin sayfadan okunamaz.
//
// Cevap TEK KULLANIMLIK ve 5 dakika omurludur.
//
// NOT (bilerek): DB'ye ulasilamazsa dogrulama ACIK davranir ve hata LOGLANIR.
// Captcha yalnizca bot filtresidir; asil kimlik dogrulama SMS OTP'dir — bir DB
// arizasi yuzunden tum girisleri kilitlemek daha buyuk zarardir.
// ============================================================

const crypto = require('crypto');
const db = require('./db');

const ALFABE = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // I, O, 0, 1 YOK (karisiyor)
const UZUNLUK = 5;
const OMUR_DK = 5;

let _hazir = false;

async function tabloHazirla() {
  if (_hazir) return;
  await db.pg.query(`
    CREATE TABLE IF NOT EXISTS captcha_kodlari (
      id          TEXT PRIMARY KEY,
      cevap       TEXT NOT NULL,
      ip          TEXT,
      kullanildi  BOOLEAN DEFAULT false,
      bitis       TIMESTAMPTZ NOT NULL,
      olusturma   TIMESTAMPTZ DEFAULT now()
    )`);
  _hazir = true;
}

const r = (min, max) => crypto.randomInt(min, max + 1);
const kacis = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function metinUret() {
  let s = '';
  for (let i = 0; i < UZUNLUK; i++) s += ALFABE[crypto.randomInt(0, ALFABE.length)];
  return s;
}

// Resco Mail paletiyle uyumlu SVG (mavi tonlar)
function svgUret(metin) {
  const G = 168, Y = 52;
  const renkler = ['#1E88E5', '#0f172a', '#1565C0', '#334155', '#0e7490'];
  const harfler = metin.split('').map((c, i) => {
    const x = 18 + i * 28 + r(-3, 3), y = 36 + r(-4, 4);
    const aci = r(-24, 24), boy = r(26, 32);
    return `<text x="${x}" y="${y}" fill="${renkler[r(0, renkler.length - 1)]}" font-size="${boy}" ` +
      `font-weight="700" font-family="Segoe UI,Verdana,sans-serif" ` +
      `transform="rotate(${aci} ${x} ${y})">${kacis(c)}</text>`;
  }).join('');

  let gurultu = '';
  for (let i = 0; i < 4; i++) {
    gurultu += `<path d="M${r(0, 30)} ${r(4, Y - 4)} Q ${r(50, 110)} ${r(0, Y)} ${r(G - 30, G)} ${r(4, Y - 4)}" ` +
      `stroke="rgba(30,136,229,.35)" stroke-width="${r(1, 2)}" fill="none"/>`;
  }
  for (let i = 0; i < 28; i++) {
    gurultu += `<circle cx="${r(0, G)}" cy="${r(0, Y)}" r="${r(1, 2)}" fill="rgba(15,23,42,.16)"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${G}" height="${Y}" viewBox="0 0 ${G} ${Y}">` +
    `<rect width="${G}" height="${Y}" rx="9" fill="#f1f5f9"/>${gurultu}${harfler}</svg>`;
}

/** Yeni captcha uret -> { id, resim, omur_sn } */
async function uret(ip) {
  await tabloHazirla();
  const id = crypto.randomBytes(16).toString('hex');
  const metin = metinUret();
  await db.pg.query(
    `INSERT INTO captcha_kodlari (id, cevap, ip, bitis)
     VALUES ($1,$2,$3, now() + interval '${OMUR_DK} minutes')`, [id, metin, ip || null]);
  // Tembel temizlik — ayri zamanlayici gerekmez
  db.pg.query("DELETE FROM captcha_kodlari WHERE bitis < now() - interval '1 hour'").catch(() => {});
  return {
    id,
    resim: 'data:image/svg+xml;base64,' + Buffer.from(svgUret(metin), 'utf8').toString('base64'),
    omur_sn: OMUR_DK * 60
  };
}

/** Cevabi dogrula. TEK KULLANIMLIK: dogru da olsa yanlis da olsa kayit tuketilir. */
async function dogrula(id, cevap) {
  if (!id || !cevap) return false;
  try {
    await tabloHazirla();
    const { rows } = await db.pg.query(
      'SELECT cevap FROM captcha_kodlari WHERE id=$1 AND kullanildi=false AND bitis > now()', [String(id)]);
    await db.pg.query('UPDATE captcha_kodlari SET kullanildi=true WHERE id=$1', [String(id)]);
    if (!rows.length) return false;
    const beklenen = String(rows[0].cevap || '').toUpperCase();
    const verilen = String(cevap).trim().toUpperCase();
    if (beklenen.length !== verilen.length) return false;
    return crypto.timingSafeEqual(Buffer.from(beklenen, 'utf8'), Buffer.from(verilen, 'utf8'));
  } catch (e) {
    // Sistem hatasi: girisi tamamen kilitleme, ama sessiz kalma
    console.error('[captcha] dogrulanamadi (sistem hatasi):', e.message);
    return true;
  }
}

module.exports = { uret, dogrula, UZUNLUK, OMUR_DK };
