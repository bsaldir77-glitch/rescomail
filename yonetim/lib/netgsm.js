// NetGSM gonderici — rescopos api-hub/lib/sms.js'in birebir uyarlamasi (kanitlanmis kod).
// TR cep numarasi 10 haneye indirgenir (5xxxxxxxxx); yurtdisi numaralar ulke koduyla korunur.
// Girdi alanina format dayatilmaz — kisi nasil biliyorsa oyle yazar, normalizasyon burada.
function telefon_tr(ham) {
  if (!ham) return null;
  let p = String(ham).replace(/[^0-9]/g, '');
  if (!p) return null;
  if (p.startsWith('00')) p = p.substring(2);                         // 00 = uluslararasi onek
  if (p.startsWith('90') && p.length === 12) p = p.substring(2);      // +90 → TR
  if (p.startsWith('0') && p.length === 11) p = p.substring(1);       // 0532... → TR
  if (p.length === 10 && p.startsWith('5')) return p;                 // TR cep
  if (p.length >= 10 && p.length <= 15) return p;                     // yurtdisi (ulke kodlu)
  return null;
}

// Ekranda gosterim: yalniz son iki hane acik
const telefon_maske = tel => tel ? '•••• ••• ' + String(tel).slice(-2) : '';

const HATALAR = {
  '20': 'Mesaj basligi sisteme onayli degil',
  '30': 'Kullanici kodu / sifre hatali',
  '40': 'Mesaj basligi sisteme tanimsiz',
  '50': 'IYS filtresine takildi (alici izinli degil)',
  '60': 'IP yetkilendirmesi yok — NetGSM panelinde bu sunucunun IP\'si whitelist\'e eklenmeli',
  '70': 'Hatali sorgu - parametre eksik veya yanlis',
  '80': 'Gonderim limiti asildi',
  '85': 'Mukerrer gonderim'
};

async function sms_gonder(kimlik, telefon, mesaj) {
  const params = new URLSearchParams({
    usercode: kimlik.kullanici,
    password: kimlik.parola,
    gsmno: telefon,
    message: mesaj,
    msgheader: kimlik.baslik,
    encoding: 'TR'
  });
  // ONEMLI: trailing slash YOK — slashli surum HTTP'ye 301 olur (500 hatasi)
  const url = 'https://api.netgsm.com.tr/sms/send/get?' + params.toString();
  let txt = '';
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': 'rescomail/1.0' },
      signal: AbortSignal.timeout(15000)
    });
    txt = (await r.text()).trim();
  } catch (e) {
    return { ok: false, kod: 'NET', hata: 'NetGSM baglanti hatasi: ' + e.message };
  }
  const kod = (txt.split(/\s/)[0] || '').trim();
  if (kod === '00') return { ok: true, jobid: txt.substring(3).trim() };
  return { ok: false, kod, hata: HATALAR[kod] || ('NetGSM: ' + txt) };
}

// Teslim raporu — NetGSM'e "bu mesaj ulasti mi" diye sorar (bulkid = gonderimdeki jobid).
// Yanit satirlari: <jobid> <numara> <durum> ... — durum kodlari asagidaki haritada.
const TESLIM = {
  '0': 'bekliyor', '1': 'iletildi', '2': 'ulasmadi', '3': 'zaman asimi',
  '4': 'hatali numara', '11': 'operator hatasi', '12': 'operator hatasi',
  '13': 'kara listede', '100': 'bekliyor'
};

async function teslim_sorgula(kimlik, jobid) {
  const params = new URLSearchParams({
    usercode: kimlik.kullanici, password: kimlik.parola, bulkid: String(jobid), type: '0', version: '2'
  });
  let txt = '';
  try {
    const r = await fetch('https://api.netgsm.com.tr/sms/report?' + params.toString(), {
      headers: { 'User-Agent': 'rescomail/1.0' }, signal: AbortSignal.timeout(15000)
    });
    txt = (await r.text()).trim();
  } catch (e) {
    return { ok: false, hata: 'Rapor sorgulanamadi: ' + e.message };
  }
  if (!txt) return { ok: false, hata: 'NetGSM bos yanit verdi' };
  // Ilk anlamli satirin durum alanini al; anlasilmazsa ham yaniti geri ver
  const satir = txt.split('\n').map(s => s.trim()).filter(Boolean)[0] || '';
  const parcalar = satir.split(/\s+/);
  const durum = parcalar.length >= 3 ? parcalar[2] : (parcalar[0] || '');
  return { ok: true, teslim: TESLIM[durum] || ('bilinmiyor (' + satir.slice(0, 60) + ')') };
}

module.exports = { telefon_tr, telefon_maske, sms_gonder, teslim_sorgula };
