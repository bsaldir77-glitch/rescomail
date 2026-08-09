// Resco Mail Yonetim V1 — tasarim: docs/YONETIM_TASARIM.md
require('dotenv').config();
const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('./lib/db');
const plesk = require('./lib/plesk');
const { cerez_uret, oturum_gerekli, hiz_siniri } = require('./lib/oturum');

if (!process.env.OTURUM_SECRET || process.env.OTURUM_SECRET.length < 32)
  throw new Error('OTURUM_SECRET en az 32 karakter olmali');

const app = express();
app.use(express.json());
app.use(express.static(__dirname + '/public'));

const parola_uret = () => crypto.randomBytes(9).toString('base64url') + '!A1';
const telefon_normalize = t => {
  if (!t) return null;
  let r = String(t).replace(/\D/g, '');
  if (r.startsWith('90') && r.length === 12) r = '0' + r.slice(2);
  if (r.length === 10 && r.startsWith('5')) r = '0' + r;
  return r || null;
};
const eposta_gecerli = e => /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(e || '');

// --- kurulum modu: yonetici yoksa ilk kayit serbest, varsa kilitli ---
app.get('/api/durum', async (_req, res) => {
  const { rows } = await db.pg.query('SELECT COUNT(*)::int AS n FROM yoneticiler');
  res.json({ kurulum: rows[0].n === 0 });
});

app.post('/api/kurulum', async (req, res) => {
  const { rows } = await db.pg.query('SELECT COUNT(*)::int AS n FROM yoneticiler');
  if (rows[0].n > 0) return res.status(403).json({ hata: 'Kurulum tamamlanmis' });
  const { eposta, parola } = req.body || {};
  if (!eposta_gecerli(eposta) || !parola || parola.length < 10)
    return res.status(400).json({ hata: 'Gecerli e-posta ve en az 10 karakter parola gerekli' });
  await db.pg.query('INSERT INTO yoneticiler (eposta, parola_hash) VALUES ($1,$2)',
    [eposta.toLowerCase(), await bcrypt.hash(parola, 12)]);
  await db.kayit(eposta, 'kurulum', null, null);
  res.json({ tamam: true });
});

app.post('/api/giris', hiz_siniri, async (req, res) => {
  const { eposta, parola } = req.body || {};
  const { rows } = await db.pg.query(
    'SELECT parola_hash FROM yoneticiler WHERE eposta=$1 AND aktif', [String(eposta || '').toLowerCase()]);
  if (!rows.length || !(await bcrypt.compare(parola || '', rows[0].parola_hash)))
    return res.status(403).json({ hata: 'E-posta veya parola hatali' }); // 403 — 401 logout tuzagi dersi
  res.setHeader('Set-Cookie',
    `rm_oturum=${cerez_uret(eposta.toLowerCase())}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=28800`);
  await db.kayit(eposta.toLowerCase(), 'giris', null, null);
  res.json({ tamam: true });
});

app.post('/api/cikis', oturum_gerekli, (_req, res) => {
  res.setHeader('Set-Cookie', 'rm_oturum=; HttpOnly; Secure; Path=/; Max-Age=0');
  res.json({ tamam: true });
});

// --- hesaplar ---
app.get('/api/hesaplar', oturum_gerekli, async (_req, res) => {
  const [hesaplar, otp] = await Promise.all([
    db.hesaplari_listele(),
    db.pg.query('SELECT eposta, telefon, sms_giris_acik FROM otp_ayarlari')
  ]);
  const eslesme = new Map(otp.rows.map(r => [r.eposta, r]));
  res.json(hesaplar.map(h => ({ ...h, otp: eslesme.get(h.eposta) || null })));
});

app.post('/api/hesaplar', oturum_gerekli, async (req, res) => {
  const { kullanici, domain, parola, telefon } = req.body || {};
  const eposta = `${kullanici}@${domain}`.toLowerCase();
  if (!eposta_gecerli(eposta)) return res.status(400).json({ hata: 'Gecersiz adres' });
  const p = parola || parola_uret();
  await plesk.hesap_ac(eposta, p);
  const tel = telefon_normalize(telefon);
  if (tel) await db.pg.query(
    `INSERT INTO otp_ayarlari (eposta, telefon) VALUES ($1,$2)
     ON CONFLICT (eposta) DO UPDATE SET telefon=$2, guncelleme=now()`, [eposta, tel]);
  await db.kayit(req.yonetici, 'hesap_ac', eposta, { telefon: !!tel });
  res.json({ tamam: true, eposta, parola: p }); // parola BIR KEZ doner, saklanmaz
});

app.post('/api/hesaplar/sifre', oturum_gerekli, async (req, res) => {
  const { eposta } = req.body || {};
  if (!eposta_gecerli(eposta)) return res.status(400).json({ hata: 'Gecersiz adres' });
  const p = parola_uret();
  await plesk.parola_degistir(eposta, p);
  await db.kayit(req.yonetici, 'sifre_sifirla', eposta, null);
  res.json({ tamam: true, parola: p });
});

app.post('/api/hesaplar/durum', oturum_gerekli, async (req, res) => {
  const { eposta, acik } = req.body || {};
  if (!eposta_gecerli(eposta)) return res.status(400).json({ hata: 'Gecersiz adres' });
  if (acik === true || acik === 'true' || acik === '1') await plesk.hesap_ac_durum(eposta);
  else await plesk.hesap_kapat(eposta);
  await db.kayit(req.yonetici, acik ? 'hesap_acik' : 'hesap_kapali', eposta, null);
  res.json({ tamam: true });
});

app.post('/api/hesaplar/sil', oturum_gerekli, async (req, res) => {
  const { eposta, onay } = req.body || {};
  if (!eposta_gecerli(eposta)) return res.status(400).json({ hata: 'Gecersiz adres' });
  if (onay !== eposta) return res.status(400).json({ hata: 'Onay icin adresin kendisi yazilmali' }); // iki adimli
  await plesk.hesap_sil(eposta);
  await db.pg.query('DELETE FROM otp_ayarlari WHERE eposta=$1', [eposta]);
  await db.kayit(req.yonetici, 'hesap_sil', eposta, null);
  res.json({ tamam: true });
});

// --- otp ayarlari ---
app.post('/api/otp', oturum_gerekli, async (req, res) => {
  const { eposta, telefon, sms_giris_acik } = req.body || {};
  if (!eposta_gecerli(eposta)) return res.status(400).json({ hata: 'Gecersiz adres' });
  const acik = sms_giris_acik === true || sms_giris_acik === 'true' || sms_giris_acik === '1';
  await db.pg.query(
    `INSERT INTO otp_ayarlari (eposta, telefon, sms_giris_acik) VALUES ($1,$2,$3)
     ON CONFLICT (eposta) DO UPDATE SET telefon=$2, sms_giris_acik=$3, guncelleme=now()`,
    [eposta.toLowerCase(), telefon_normalize(telefon), acik]);
  await db.kayit(req.yonetici, 'otp_guncelle', eposta, { sms_giris_acik: acik });
  res.json({ tamam: true });
});

// --- baglanti kasasi (sifreli API kimlikleri — NetGSM vb.) ---
const kasa = require('./lib/kasa');

app.get('/api/baglantilar', oturum_gerekli, async (_req, res) => {
  const { rows } = await db.pg.query('SELECT saglayici, veri_sifreli, guncelleme FROM baglanti_ayarlari');
  res.json(rows.map(r => {
    let alanlar = {};
    try {
      const acik = kasa.coz(r.veri_sifreli) || {};
      for (const [k, v] of Object.entries(acik)) alanlar[k] = kasa.maskele(v);
    } catch { alanlar = { hata: 'cozulemedi' }; }
    return { saglayici: r.saglayici, alanlar, guncelleme: r.guncelleme };
  }));
});

app.post('/api/baglantilar', oturum_gerekli, async (req, res) => {
  const { saglayici, alanlar } = req.body || {};
  if (!saglayici || typeof alanlar !== 'object')
    return res.status(400).json({ hata: 'saglayici ve alanlar gerekli' });
  // maskeli ("***" ile biten) degerler eski degeri korur — yalniz degisen alan guncellenir
  const { rows } = await db.pg.query('SELECT veri_sifreli FROM baglanti_ayarlari WHERE saglayici=$1', [saglayici]);
  let eski = {};
  if (rows.length) { try { eski = kasa.coz(rows[0].veri_sifreli) || {}; } catch { eski = {}; } }
  const yeni = { ...eski };
  for (const [k, v] of Object.entries(alanlar)) {
    if (typeof v === 'string' && v.endsWith('***')) continue;
    if (v === '' || v === null) delete yeni[k]; else yeni[k] = v;
  }
  await db.pg.query(
    `INSERT INTO baglanti_ayarlari (saglayici, veri_sifreli) VALUES ($1,$2)
     ON CONFLICT (saglayici) DO UPDATE SET veri_sifreli=$2, guncelleme=now()`,
    [saglayici, kasa.sifrele(yeni)]);
  await db.kayit(req.yonetici, 'baglanti_guncelle', saglayici, { alanlar: Object.keys(yeni) }); // degerler ASLA loglanmaz
  res.json({ tamam: true });
});

app.post('/api/baglantilar/test', oturum_gerekli, async (req, res) => {
  const netgsm = require('./lib/netgsm');
  const tel = netgsm.telefon_tr((req.body || {}).telefon);
  if (!tel) return res.status(400).json({ hata: 'Gecerli bir cep telefonu gir' });
  const { rows } = await db.pg.query("SELECT veri_sifreli FROM baglanti_ayarlari WHERE saglayici='netgsm'");
  if (!rows.length) return res.status(400).json({ hata: 'Once NetGSM bilgilerini kaydet' });
  const kimlik = kasa.coz(rows[0].veri_sifreli);
  if (!kimlik || !kimlik.kullanici || !kimlik.parola || !kimlik.baslik)
    return res.status(400).json({ hata: 'NetGSM alanlari eksik (kullanici/parola/baslik)' });
  const sonuc = await netgsm.sms_gonder(kimlik, tel, 'Resco Mail baglanti testi basarili.');
  await db.kayit(req.yonetici, 'baglanti_test', 'netgsm', { telefon: tel, ok: sonuc.ok, kod: sonuc.kod || '00' });
  if (!sonuc.ok) return res.status(502).json({ hata: sonuc.hata, kod: sonuc.kod });
  res.json({ tamam: true, jobid: sonuc.jobid });
});

// --- islem kaydi ---
app.get('/api/kayitlar', oturum_gerekli, async (_req, res) => {
  const { rows } = await db.pg.query(
    'SELECT yonetici, islem, hedef, detay, ts FROM islem_kayitlari ORDER BY id DESC LIMIT 200');
  res.json(rows);
});

app.use((err, _req, res, _next) => {
  console.error('[yonetim]', err.message);
  res.status(500).json({ hata: err.message });
});

const PORT = process.env.PORT || 3000;
db.sema().then(() => {
  app.listen(PORT, () => console.log(`Resco Mail Yonetim ${PORT} portunda`));
}).catch(e => { console.error('Sema kurulamadi:', e.message); process.exit(1); });
