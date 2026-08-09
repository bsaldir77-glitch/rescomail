// Resco Mail Kapi — webmail'e e-posta + SMS OTP ile parolasiz giris.
// Tasarim: docs/KAPI_TASARIM.md. Kapi VERI YOLUNDA DEGIL: yalniz giris aninda calisir,
// SOGo oturum cerezini tarayiciya devreder, sonrasinda tarayici dogrudan SOGo ile konusur.
require('dotenv').config();
const express = require('express');
const crypto = require('crypto');
const { execFile } = require('child_process');
const { Pool } = require('pg');
const netgsm = require('../yonetim/lib/netgsm');
const kasa = require('../yonetim/lib/kasa');

const KOPRU = process.env.KOPRU_YOL || '/opt/rescomail/deploy/parola-koprusu.sh';
const pg = new Pool({
  host: process.env.PG_HOST || '127.0.0.1',
  user: process.env.PG_USER,
  password: process.env.PG_PASS,
  database: process.env.PG_DB || 'rescomail_db',
  max: 5
});

const app = express();
app.use(express.json());
app.use(express.static(__dirname + '/public'));

const denemeler = new Map(); // ip -> {sayi, ilk}
function hiz_siniri(req, res, next) {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const simdi = Date.now(), d = denemeler.get(ip);
  if (d && simdi - d.ilk < 15 * 60 * 1000 && d.sayi >= 8)
    return res.status(429).json({ hata: 'Çok fazla deneme — 15 dakika sonra tekrar deneyin' });
  if (!d || simdi - d.ilk >= 15 * 60 * 1000) denemeler.set(ip, { sayi: 1, ilk: simdi });
  else d.sayi++;
  next();
}

const eposta_gecerli = e => /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(e || '');

async function sema() {
  await pg.query(`CREATE TABLE IF NOT EXISTS kapi_kodlari (
    eposta TEXT PRIMARY KEY,
    kod_hash TEXT NOT NULL,
    bitis TIMESTAMPTZ NOT NULL,
    deneme INT NOT NULL DEFAULT 0)`);
  await pg.query(`CREATE TABLE IF NOT EXISTS kapi_giris_kayitlari (
    id SERIAL PRIMARY KEY,
    eposta TEXT NOT NULL,
    olay TEXT NOT NULL,
    ip TEXT,
    ts TIMESTAMPTZ NOT NULL DEFAULT now())`);
}

const kayit = (eposta, olay, ip) =>
  pg.query('INSERT INTO kapi_giris_kayitlari (eposta, olay, ip) VALUES ($1,$2,$3)', [eposta, olay, ip || null]);

async function netgsm_kimlik() {
  const { rows } = await pg.query("SELECT veri_sifreli FROM baglanti_ayarlari WHERE saglayici='netgsm'");
  if (!rows.length) return null;
  const k = kasa.coz(rows[0].veri_sifreli);
  return (k && k.kullanici && k.parola && k.baslik) ? k : null;
}

// 1) Kod gonder — hesap SMS girisine acik degilse parola akisina yonlendirilir
app.post('/api/kod', hiz_siniri, async (req, res) => {
  const eposta = String((req.body || {}).eposta || '').trim().toLowerCase();
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  if (!eposta_gecerli(eposta)) return res.status(400).json({ hata: 'Geçerli bir e-posta adresi girin' });
  const { rows } = await pg.query(
    'SELECT telefon, sms_giris_acik FROM otp_ayarlari WHERE eposta=$1', [eposta]);
  const tel = rows.length && rows[0].sms_giris_acik ? netgsm.telefon_tr(rows[0].telefon) : null;
  if (!tel) {
    await kayit(eposta, 'sms_kapali', ip);
    return res.status(400).json({ hata: 'Bu adres için SMS ile giriş tanımlı değil — parolanızla giriş yapın',
      parola_yolu: `https://${process.env.SOGO_HOST || 'webmail.rescopos.com'}/SOGo/` });
  }
  const eski = await pg.query('SELECT bitis FROM kapi_kodlari WHERE eposta=$1', [eposta]);
  if (eski.rows.length && new Date(eski.rows[0].bitis).getTime() - Date.now() > 4 * 60 * 1000)
    return res.json({ tamam: true, not: 'Kod zaten gönderildi — SMS\'i bekleyin' });
  const kimlik = await netgsm_kimlik();
  if (!kimlik) return res.status(502).json({ hata: 'SMS servisi tanımlı değil — yöneticinize başvurun' });
  const kod = String(crypto.randomInt(100000, 1000000));
  await pg.query(
    `INSERT INTO kapi_kodlari (eposta, kod_hash, bitis, deneme) VALUES ($1,$2, now()+interval '5 minutes',0)
     ON CONFLICT (eposta) DO UPDATE SET kod_hash=$2, bitis=now()+interval '5 minutes', deneme=0`,
    [eposta, crypto.createHash('sha256').update(kod).digest('hex')]);
  const sonuc = await netgsm.sms_gonder(kimlik, tel, `Resco Mail giris kodunuz: ${kod}`);
  if (!sonuc.ok) return res.status(502).json({ hata: 'SMS gönderilemedi — yöneticinize başvurun' });
  await kayit(eposta, 'kod_gonderildi', ip);
  res.json({ tamam: true, maske: '0*** *** ' + tel.slice(-2) });
});

// 2) Kodu dogrula → SOGo oturumunu tarayiciya devret
app.post('/api/dogrula', hiz_siniri, async (req, res) => {
  const { eposta: ham, kod } = req.body || {};
  const eposta = String(ham || '').trim().toLowerCase();
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  if (!eposta_gecerli(eposta)) return res.status(400).json({ hata: 'Geçersiz adres' });
  const { rows } = await pg.query('SELECT kod_hash, bitis, deneme FROM kapi_kodlari WHERE eposta=$1', [eposta]);
  if (!rows.length || new Date(rows[0].bitis).getTime() < Date.now())
    return res.status(403).json({ hata: 'Kodun süresi doldu — yeniden kod isteyin' });
  if (rows[0].deneme >= 5) {
    await pg.query('DELETE FROM kapi_kodlari WHERE eposta=$1', [eposta]);
    await kayit(eposta, 'kod_kilitlendi', ip);
    return res.status(403).json({ hata: 'Çok fazla yanlış deneme — yeniden kod isteyin' });
  }
  const hash = crypto.createHash('sha256').update(String(kod || '')).digest('hex');
  if (hash !== rows[0].kod_hash) {
    await pg.query('UPDATE kapi_kodlari SET deneme=deneme+1 WHERE eposta=$1', [eposta]);
    return res.status(403).json({ hata: 'Kod hatalı' });
  }
  await pg.query('DELETE FROM kapi_kodlari WHERE eposta=$1', [eposta]);

  const kopru = await new Promise(resolve =>
    execFile('sudo', ['-n', KOPRU, eposta], { timeout: 25000 }, (err, out) => {
      if (err && !out) return resolve({ hata: 'kopru_calismadi' });
      try { resolve(JSON.parse(String(out).trim().split('\n').pop())); }
      catch { resolve({ hata: 'kopru_yaniti_okunamadi' }); }
    }));
  if (kopru.hata || !kopru.cerezler) {
    await kayit(eposta, 'kopru_hata:' + (kopru.hata || 'bos'), ip);
    return res.status(502).json({ hata: 'Posta kutusu açılamadı — yöneticinize başvurun' });
  }

  // TEK KAPI: SOGo ayni alan adinda (eposta.rescopos.com/SOGo) → cerez host'a ozel kalir (en guvenlisi).
  // Farkli bir SOGo adresi kullanilacaksa CEREZ_ALAN ile ust alan verilir.
  const alan = process.env.CEREZ_ALAN ? `; Domain=${process.env.CEREZ_ALAN}` : '';
  const cerezler = kopru.cerezler.map(c => {
    const ad_deger = c.split(';')[0].trim();
    const httponly = /httponly/i.test(c) ? '; HttpOnly' : '';
    return `${ad_deger}${alan}; Path=/; Secure; SameSite=Lax${httponly}`;
  });
  res.setHeader('Set-Cookie', cerezler);
  await kayit(eposta, 'giris', ip);
  res.json({ tamam: true, hedef: kopru.hedef });
});

app.use((err, _req, res, _next) => {
  console.error('[kapi]', err.message);
  res.status(500).json({ hata: 'Beklenmeyen hata' });
});

const PORT = process.env.PORT || 3100;
sema().then(() => app.listen(PORT, () => console.log(`Resco Mail Kapi ${PORT} portunda`)))
  .catch(e => { console.error('Sema kurulamadi:', e.message); process.exit(1); });
