// NetGSM gonderici — rescopos api-hub/lib/sms.js'in birebir uyarlamasi (kanitlanmis kod).
function telefon_tr(ham) {
  if (!ham) return null;
  let p = String(ham).replace(/[^0-9]/g, '');
  if (p.startsWith('90') && p.length === 12) p = p.substring(2);
  if (p.startsWith('0') && p.length === 11) p = p.substring(1);
  if (p.length !== 10 || !p.startsWith('5')) return null;
  return p;
}

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

module.exports = { telefon_tr, sms_gonder };
