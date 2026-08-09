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
// GERCEK yanit bicimi (2026-08-09 canli olcum): "<numara> <durum> <?> <?> <tarih> <saat> <?><br>"
//   orn: "909874642656 3 0 0 09.08.2026 08:54:59 112<br>"
// NetGSM resmi rapor durum kodlari (netgsm1/sms dokumantasyonu)
const TESLIM = {
  '0': 'bekliyor', '1': 'iletildi', '2': 'zaman asimi', '3': 'reddedildi',
  '4': 'hatali/kisitli numara', '11': 'operator kabul etmedi',
  '12': 'gonderim hatasi', '13': 'mukerrer'
};

async function teslim_sorgula(kimlik, jobid) {
  const params = new URLSearchParams({
    usercode: kimlik.kullanici, password: kimlik.parola, bulkid: String(jobid), type: '0', version: '2'
  });
  let txt = '', durum_kodu = 0;
  try {
    const r = await fetch('https://api.netgsm.com.tr/sms/report?' + params.toString(), {
      headers: { 'User-Agent': 'rescomail/1.0' }, signal: AbortSignal.timeout(15000)
    });
    durum_kodu = r.status;
    txt = (await r.text()).trim();
  } catch (e) {
    return { ok: false, hata: 'Rapor sorgulanamadi: ' + e.message };
  }
  if (durum_kodu === 429) return { ok: false, hata: 'NetGSM sorgu limiti — biraz sonra tekrar dene' };
  if (!txt) return { ok: false, hata: 'NetGSM bos yanit verdi' };

  const satir = txt.replace(/<br\s*\/?>/gi, '\n').split('\n').map(s => s.trim()).filter(Boolean)[0] || '';
  const parcalar = satir.split(/\s+/);
  // Ilk alan numara, ikincisi durum kodu olmali; degilse ham yaniti hata olarak bildir (uydurma yok)
  if (!/^\d{7,15}$/.test(parcalar[0] || '') || !/^\d{1,3}$/.test(parcalar[1] || ''))
    return { ok: false, hata: 'Anlasilmayan rapor: ' + satir.slice(0, 80) };

  return {
    ok: true,
    rapor_no: parcalar[0],                                   // NetGSM'in gercekte gonderdigi numara
    teslim: TESLIM[parcalar[1]] || ('kod ' + parcalar[1])
  };
}

module.exports = { telefon_tr, telefon_maske, sms_gonder, teslim_sorgula };
