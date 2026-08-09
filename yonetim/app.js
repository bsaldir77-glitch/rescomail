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

function oturum_ver(res, eposta) {
  res.setHeader('Set-Cookie',
    `rm_oturum=${cerez_uret(eposta)}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=28800`);
}

async function netgsm_kimlik() {
  const kasa = require('./lib/kasa');
  const { rows } = await db.pg.query("SELECT veri_sifreli FROM baglanti_ayarlari WHERE saglayici='netgsm'");
  if (!rows.length) return null;
  const k = kasa.coz(rows[0].veri_sifreli);
  return (k && k.kullanici && k.parola && k.baslik) ? k : null;
}

// Giris: SMS acizsa parolasiz tek-kod akisi (Bulent karari: "tek sifre"); degilse klasik parola
app.post('/api/giris', hiz_siniri, async (req, res) => {
  const { eposta, parola } = req.body || {};
  const e = String(eposta || '').toLowerCase();
  const { rows } = await db.pg.query(
    'SELECT parola_hash, telefon, sms_giris FROM yoneticiler WHERE eposta=$1 AND aktif', [e]);
  if (!rows.length) return res.status(403).json({ hata: 'E-posta veya parola hatali' }); // 403 — 401 logout tuzagi
  const y = rows[0];

  if (y.sms_giris && y.telefon) {
    // parolasiz akis — SMS bombalamaya karsi: gecerli kod varsa ve 60 sn gecmediyse yeniden gonderme
    const eski = await db.pg.query('SELECT bitis FROM giris_kodlari WHERE eposta=$1', [e]);
    if (eski.rows.length && new Date(eski.rows[0].bitis).getTime() - Date.now() > 4 * 60 * 1000)
      return res.json({ otp_gerekli: true, not: 'Kod zaten gonderildi — SMS\'i bekle' });
    const kimlik = await netgsm_kimlik();
    if (!kimlik) return res.status(502).json({ hata: 'NetGSM tanimli degil — SMS girisi calisamaz' });
    const kod = String(crypto.randomInt(100000, 1000000));
    const kod_hash = crypto.createHash('sha256').update(kod).digest('hex');
    await db.pg.query(
      `INSERT INTO giris_kodlari (eposta, kod_hash, bitis, deneme) VALUES ($1,$2,now()+interval '5 minutes',0)
       ON CONFLICT (eposta) DO UPDATE SET kod_hash=$2, bitis=now()+interval '5 minutes', deneme=0`,
      [e, kod_hash]);
    const netgsm = require('./lib/netgsm');
    const sonuc = await netgsm.sms_gonder(kimlik, y.telefon, `Resco Mail giris kodu: ${kod}`);
    if (!sonuc.ok) return res.status(502).json({ hata: 'SMS gonderilemedi: ' + sonuc.hata });
    await db.kayit(e, 'giris_kod_gonderildi', null, null);
    return res.json({ otp_gerekli: true });
  }

  if (!parola) return res.json({ parola_gerekli: true });
  if (!(await bcrypt.compare(parola, y.parola_hash)))
    return res.status(403).json({ hata: 'E-posta veya parola hatali' });
  oturum_ver(res, e);
  await db.kayit(e, 'giris', null, null);
  res.json({ tamam: true });
});

app.post('/api/giris/otp', hiz_siniri, async (req, res) => {
  const { eposta, kod } = req.body || {};
  const e = String(eposta || '').toLowerCase();
  const { rows } = await db.pg.query('SELECT kod_hash, bitis, deneme FROM giris_kodlari WHERE eposta=$1', [e]);
  if (!rows.length || new Date(rows[0].bitis).getTime() < Date.now())
    return res.status(403).json({ hata: 'Kod suresi doldu — yeniden giris yap' });
  if (rows[0].deneme >= 5) {
    await db.pg.query('DELETE FROM giris_kodlari WHERE eposta=$1', [e]);
    return res.status(403).json({ hata: 'Cok fazla yanlis deneme — yeniden giris yap' });
  }
  const hash = crypto.createHash('sha256').update(String(kod || '')).digest('hex');
  if (hash !== rows[0].kod_hash) {
    await db.pg.query('UPDATE giris_kodlari SET deneme=deneme+1 WHERE eposta=$1', [e]);
    return res.status(403).json({ hata: 'Kod hatali' });
  }
  await db.pg.query('DELETE FROM giris_kodlari WHERE eposta=$1', [e]);
  oturum_ver(res, e);
  await db.kayit(e, 'giris_otp', null, null);
  res.json({ tamam: true });
});

// Yonetici giris ayarlari (telefon + SMS'li giris anahtari)
app.get('/api/yonetici', oturum_gerekli, async (req, res) => {
  const { rows } = await db.pg.query('SELECT eposta, telefon, sms_giris FROM yoneticiler WHERE eposta=$1', [req.yonetici]);
  res.json(rows[0] || {});
});

app.post('/api/yonetici', oturum_gerekli, async (req, res) => {
  const { telefon, sms_giris } = req.body || {};
  const netgsm = require('./lib/netgsm');
  const tel = netgsm.telefon_tr(telefon);
  const acik = sms_giris === true || sms_giris === 'true' || sms_giris === '1';
  if (acik) {
    if (!tel) return res.status(400).json({ hata: 'SMS girisi icin gecerli telefon sart' });
    if (!(await netgsm_kimlik())) return res.status(400).json({ hata: 'Once NetGSM bilgilerini kaydet ve test et' });
  }
  await db.pg.query('UPDATE yoneticiler SET telefon=$1, sms_giris=$2 WHERE eposta=$3',
    [tel, acik, req.yonetici]);
  await db.kayit(req.yonetici, 'yonetici_giris_ayari', null, { sms_giris: acik });
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

// --- hesap bilgi paketi: SMS'te bilgi YOK, yalniz yonlendirme; bilgi 1 saat yasayan sifreli sayfada ---
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function bilgi_sayfasi(baslik, govde) {
  return `<!DOCTYPE html><html lang="tr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">
<title>${esc(baslik)}</title>
<style>body{margin:0;font-family:"Segoe UI",sans-serif;background:linear-gradient(160deg,#2C3E50,#1E88E5);
min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
.kart{background:#fff;max-width:420px;width:100%;border-radius:14px;padding:32px;color:#33424F}
.kart img{width:170px;display:block;margin:0 auto 10px}h2{font-size:18px;text-align:center;margin:6px 0 18px}
.satir{margin:12px 0}.satir b{display:block;font-size:12.5px;color:#5b6b78;text-transform:uppercase;letter-spacing:.4px}
.satir span,.satir a{font-size:16px;word-break:break-all}.parola{font-family:Consolas,monospace;background:#F4F7FA;
border:1px dashed #DDE6EE;padding:10px;border-radius:8px;text-align:center;font-size:17px;-webkit-user-select:all;user-select:all}
.not{font-size:12.5px;color:#5b6b78;margin-top:18px;text-align:center}</style></head>
<body><div class="kart"><img src="/logo.svg" alt="Resco Mail"><h2>${esc(baslik)}</h2>${govde}</div></body></html>`;
}

app.post('/api/hesaplar/bilgi', oturum_gerekli, async (req, res) => {
  const netgsm = require('./lib/netgsm');
  const { eposta, parola } = req.body || {};
  if (!eposta_gecerli(eposta)) return res.status(400).json({ hata: 'Gecersiz adres' });
  const { rows } = await db.pg.query('SELECT telefon FROM otp_ayarlari WHERE eposta=$1', [eposta.toLowerCase()]);
  const tel = rows.length ? netgsm.telefon_tr(rows[0].telefon) : null;
  if (!tel) return res.status(400).json({ hata: 'Bu hesabin OTP telefonu tanimli degil — once OTP Ayarlari\'ndan ekle' });
  const kimlik = await netgsm_kimlik();
  if (!kimlik) return res.status(400).json({ hata: 'Once NetGSM bilgilerini kaydet' });
  await db.pg.query('DELETE FROM bilgi_paketleri WHERE bitis < now()'); // suresi gecenleri temizle
  const token = crypto.randomBytes(16).toString('hex');
  const icerik = { eposta: eposta.toLowerCase(), webmail: `https://webmail.${eposta.split('@')[1]}/`, telefon: '0' + tel };
  if (parola) icerik.parola = parola;
  await db.pg.query(
    `INSERT INTO bilgi_paketleri (token, eposta, icerik_sifreli, bitis) VALUES ($1,$2,$3, now()+interval '1 hour')`,
    [token, eposta.toLowerCase(), kasa.sifrele(icerik)]);
  const link = `https://mailprovider.rescopos.com/bilgi/${token}`;
  const sonuc = await netgsm.sms_gonder(kimlik, tel, `Resco Mail hesap bilgilendirmeniz: ${link} (baglanti 1 saat gecerlidir)`);
  if (!sonuc.ok) return res.status(502).json({ hata: 'SMS gonderilemedi: ' + sonuc.hata });
  await db.kayit(req.yonetici, 'bilgi_gonder', eposta.toLowerCase(), { parola_dahil: !!parola });
  res.json({ tamam: true });
});

app.get('/bilgi/:token', async (req, res) => {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('Cache-Control', 'no-store');
  const dolmus = () => res.status(410).send(bilgi_sayfasi('Bağlantının süresi doldu',
    '<p style="text-align:center">Bu bilgilendirme sayfası artık geçerli değil.<br>Yöneticinizden yenisini isteyin.</p>'));
  const { rows } = await db.pg.query(
    'SELECT icerik_sifreli, bitis FROM bilgi_paketleri WHERE token=$1 AND bitis > now()', [req.params.token]);
  if (!rows.length) return dolmus();
  let ic; try { ic = kasa.coz(rows[0].icerik_sifreli); } catch { return dolmus(); }
  const bitis = new Date(rows[0].bitis).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul' });
  let govde = `
    <div class="satir"><b>Webmail adresiniz</b><a href="${esc(ic.webmail)}">${esc(ic.webmail)}</a></div>
    <div class="satir"><b>E-posta adresiniz</b><span>${esc(ic.eposta)}</span></div>
    <div class="satir"><b>Doğrulama telefonunuz</b><span>${esc(ic.telefon)}</span></div>`;
  if (ic.parola) govde += `
    <div class="satir"><b>Geçici parolanız</b><div class="parola">${esc(ic.parola)}</div></div>
    <p class="not">İlk girişten sonra parolanızı değiştirmenizi öneririz.</p>`;
  govde += `<p class="not">Bu sayfa saat ${esc(bitis)}'e kadar görüntülenebilir, sonra kendini imha eder.</p>`;
  res.send(bilgi_sayfasi('Resco Mail hesabınız', govde));
});

// ============ KAPI: webmail.rescopos.com giris sayfasindan SMS ile giris ============
// Giris ekrani SOGo sayfasina JS ile eklenir (theme/kapi-giris.js); dogrulama burada yapilir.
// Ayni ust alan (rescopos.com) oldugu icin oturum cerezi .rescopos.com'a yazilabilir.
const { execFile } = require('child_process');
const KAPI_KAYNAKLAR = (process.env.KAPI_KAYNAK || 'https://webmail.rescopos.com').split(',');
const KOPRU_YOL = process.env.KOPRU_YOL || '/opt/rescomail/deploy/parola-koprusu.sh';

app.use('/api/kapi', (req, res, next) => {
  const kaynak = req.headers.origin;
  if (kaynak && KAPI_KAYNAKLAR.includes(kaynak)) {
    res.setHeader('Access-Control-Allow-Origin', kaynak);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Vary', 'Origin');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

const kapi_denemeler = new Map();
function kapi_hiz(req, res, next) {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const simdi = Date.now(), d = kapi_denemeler.get(ip);
  if (d && simdi - d.ilk < 15 * 60 * 1000 && d.sayi >= 8)
    return res.status(429).json({ hata: 'Çok fazla deneme — 15 dakika sonra tekrar deneyin' });
  if (!d || simdi - d.ilk >= 15 * 60 * 1000) kapi_denemeler.set(ip, { sayi: 1, ilk: simdi });
  else d.sayi++;
  next();
}
const kapi_kayit = (eposta, olay, ip) =>
  db.pg.query('INSERT INTO kapi_giris_kayitlari (eposta, olay, ip) VALUES ($1,$2,$3)', [eposta, olay, ip || null]);

app.post('/api/kapi/kod', kapi_hiz, async (req, res) => {
  const netgsm = require('./lib/netgsm');
  const eposta = String((req.body || {}).eposta || '').trim().toLowerCase();
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  if (!eposta_gecerli(eposta)) return res.status(400).json({ hata: 'Geçerli bir e-posta adresi girin' });
  const { rows } = await db.pg.query('SELECT telefon, sms_giris_acik FROM otp_ayarlari WHERE eposta=$1', [eposta]);
  const tel = rows.length && rows[0].sms_giris_acik ? netgsm.telefon_tr(rows[0].telefon) : null;
  if (!tel) {
    await kapi_kayit(eposta, 'sms_kapali', ip);
    return res.status(400).json({ hata: 'Bu hesapta SMS ile giriş açık değil — yöneticinize başvurun' });
  }
  const eski = await db.pg.query('SELECT bitis FROM kapi_kodlari WHERE eposta=$1', [eposta]);
  if (eski.rows.length && new Date(eski.rows[0].bitis).getTime() - Date.now() > 4 * 60 * 1000)
    return res.json({ tamam: true, maske: '0*** *** ' + tel.slice(-2) });
  const kimlik = await netgsm_kimlik();
  if (!kimlik) return res.status(502).json({ hata: 'SMS servisi tanımlı değil' });
  const kod = String(crypto.randomInt(100000, 1000000));
  await db.pg.query(
    `INSERT INTO kapi_kodlari (eposta, kod_hash, bitis, deneme) VALUES ($1,$2, now()+interval '5 minutes',0)
     ON CONFLICT (eposta) DO UPDATE SET kod_hash=$2, bitis=now()+interval '5 minutes', deneme=0`,
    [eposta, crypto.createHash('sha256').update(kod).digest('hex')]);
  const sonuc = await netgsm.sms_gonder(kimlik, tel, `Resco Mail giris kodunuz: ${kod}`);
  if (!sonuc.ok) return res.status(502).json({ hata: 'SMS gönderilemedi' });
  await kapi_kayit(eposta, 'kod_gonderildi', ip);
  res.json({ tamam: true, maske: '0*** *** ' + tel.slice(-2) });
});

app.post('/api/kapi/dogrula', kapi_hiz, async (req, res) => {
  const { eposta: ham, kod } = req.body || {};
  const eposta = String(ham || '').trim().toLowerCase();
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  if (!eposta_gecerli(eposta)) return res.status(400).json({ hata: 'Geçersiz adres' });
  const { rows } = await db.pg.query('SELECT kod_hash, bitis, deneme FROM kapi_kodlari WHERE eposta=$1', [eposta]);
  if (!rows.length || new Date(rows[0].bitis).getTime() < Date.now())
    return res.status(403).json({ hata: 'Kodun süresi doldu — yeniden kod isteyin' });
  if (rows[0].deneme >= 5) {
    await db.pg.query('DELETE FROM kapi_kodlari WHERE eposta=$1', [eposta]);
    await kapi_kayit(eposta, 'kod_kilitlendi', ip);
    return res.status(403).json({ hata: 'Çok fazla yanlış deneme — yeniden kod isteyin' });
  }
  if (crypto.createHash('sha256').update(String(kod || '')).digest('hex') !== rows[0].kod_hash) {
    await db.pg.query('UPDATE kapi_kodlari SET deneme=deneme+1 WHERE eposta=$1', [eposta]);
    return res.status(403).json({ hata: 'Kod hatalı' });
  }
  await db.pg.query('DELETE FROM kapi_kodlari WHERE eposta=$1', [eposta]);

  const kopru = await new Promise(resolve =>
    execFile('sudo', ['-n', KOPRU_YOL, eposta], { timeout: 25000 }, (err, out) => {
      if (err && !out) return resolve({ hata: 'kopru_calismadi' });
      try { resolve(JSON.parse(String(out).trim().split('\n').pop())); }
      catch { resolve({ hata: 'kopru_yaniti_okunamadi' }); }
    }));
  if (kopru.hata || !kopru.cerezler) {
    await kapi_kayit(eposta, 'kopru_hata:' + (kopru.hata || 'bos'), ip);
    return res.status(502).json({ hata: 'Posta kutusu açılamadı — yöneticinize başvurun' });
  }
  const alan = process.env.KAPI_CEREZ_ALAN || '.rescopos.com';
  res.setHeader('Set-Cookie', kopru.cerezler.map(c =>
    `${c.split(';')[0].trim()}; Domain=${alan}; Path=/; Secure; SameSite=Lax${/httponly/i.test(c) ? '; HttpOnly' : ''}`));
  await kapi_kayit(eposta, 'giris', ip);
  res.json({ tamam: true, hedef: kopru.hedef });
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
