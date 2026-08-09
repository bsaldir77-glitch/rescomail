// Resco Mail Yonetim — on yuz. res.ok kontrolsuz yerel degisim YOK (sahte basari dersi).
let hesaplar = [];

const $ = s => document.querySelector(s);
const kacir = t => String(t ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

async function api(yol, govde) {
  const r = await fetch(yol, govde
    ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(govde) }
    : undefined);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.hata || `Sunucu hatasi (${r.status})`);
  return j;
}

// --- giris / kurulum ---
async function baslat() {
  try {
    hesaplar = await api('/api/hesaplar'); // oturum varsa direkt panel
    panel_ac();
  } catch {
    const d = await api('/api/durum').catch(() => ({ kurulum: false }));
    if (d.kurulum) {
      $('#giris-baslik').textContent = 'İlk Kurulum';
      $('#kurulum-not').classList.remove('gizli');
      $('#g-btn').textContent = 'Yönetici Oluştur';
    }
    $('#giris').classList.remove('gizli');
  }
}

let giris_modu = 'ilk'; // otp moduna gecince kod dogrulanir
$('#g-btn').addEventListener('click', async () => {
  $('#g-hata').textContent = '';
  const eposta = $('#g-eposta').value.trim();
  try {
    if ($('#g-btn').textContent === 'Yönetici Oluştur') {
      await api('/api/kurulum', { eposta, parola: $('#g-parola').value });
      await api('/api/giris', { eposta, parola: $('#g-parola').value });
      return location.reload();
    }
    if (giris_modu === 'otp') {
      await api('/api/giris/otp', { eposta, kod: $('#g-kod').value.trim() });
      return location.reload();
    }
    const s = await api('/api/giris', { eposta, parola: $('#g-parola').value });
    if (s.otp_gerekli) {
      giris_modu = 'otp';
      $('#g-parola').classList.add('gizli');
      $('#g-kod').classList.remove('gizli');
      $('#g-btn').textContent = 'Kodu Doğrula';
      $('#g-hata').textContent = s.not || 'Kod telefonuna gönderildi';
      return;
    }
    if (s.parola_gerekli) { $('#g-hata').textContent = 'Parolanı gir'; return; }
    location.reload();
  } catch (e) { $('#g-hata').textContent = e.message; }
});

$('#cikis').addEventListener('click', async e => {
  e.preventDefault();
  await api('/api/cikis', {}).catch(() => {});
  location.reload();
});

function panel_ac() {
  $('#giris').classList.add('gizli');
  $('#panel').classList.remove('gizli');
  $('#kim').textContent = 'yönetici';
  domainleri_doldur();
  hesaplari_ciz();
  otp_ciz();
}

// --- sekmeler ---
document.querySelectorAll('.yanmenu div').forEach(el => el.addEventListener('click', () => {
  document.querySelectorAll('.yanmenu div').forEach(d => d.classList.remove('sec'));
  el.classList.add('sec');
  ['hesaplar', 'otp', 'baglantilar', 'kayitlar'].forEach(s => $('#sekme-' + s).classList.toggle('gizli', s !== el.dataset.sekme));
  if (el.dataset.sekme === 'kayitlar') kayitlari_ciz();
  if (el.dataset.sekme === 'baglantilar') { baglantilari_ciz(); yonetici_ciz(); }
}));

// --- baglantilar (sifreli kasa) ---
async function baglantilari_ciz() {
  const liste = await api('/api/baglantilar').catch(() => []);
  const n = liste.find(b => b.saglayici === 'netgsm');
  $('#b-kullanici').value = n && n.alanlar.kullanici ? n.alanlar.kullanici : '';
  $('#b-parola').value = n && n.alanlar.parola ? n.alanlar.parola : '';
  $('#b-baslik').value = n && n.alanlar.baslik ? n.alanlar.baslik : '';
  $('#b-durum').textContent = n ? ' Kayıtlı (maskeli gösteriliyor)' : ' Henüz kayıt yok';
}
$('#b-kaydet').addEventListener('click', async () => {
  try {
    await api('/api/baglantilar', { saglayici: 'netgsm', alanlar: {
      kullanici: $('#b-kullanici').value, parola: $('#b-parola').value, baslik: $('#b-baslik').value } });
    $('#b-durum').textContent = ' Kaydedildi ✔';
    await baglantilari_ciz();
  } catch (e) { $('#b-durum').textContent = ' Hata: ' + e.message; }
});
async function yonetici_ciz() {
  const y = await api('/api/yonetici').catch(() => ({}));
  $('#y-telefon').value = y.telefon || '';
  $('#y-anahtar').classList.toggle('acik', !!y.sms_giris);
  $('#y-anahtar').setAttribute('aria-checked', String(!!y.sms_giris));
}
$('#y-anahtar').addEventListener('click', () => {
  const a = $('#y-anahtar');
  a.classList.toggle('acik');
  a.setAttribute('aria-checked', String(a.classList.contains('acik')));
});
$('#y-kaydet').addEventListener('click', async () => {
  try {
    await api('/api/yonetici', {
      telefon: $('#y-telefon').value,
      sms_giris: $('#y-anahtar').classList.contains('acik')
    });
    $('#y-durum').textContent = ' Kaydedildi ✔' +
      ($('#y-anahtar').classList.contains('acik') ? ' — bir sonraki girişte yalnız SMS kodu sorulur' : '');
  } catch (e) { $('#y-durum').textContent = ' Hata: ' + e.message; }
});

$('#b-test').addEventListener('click', async () => {
  $('#b-test-durum').textContent = ' Gönderiliyor...';
  try {
    await api('/api/baglantilar/test', { telefon: $('#b-test-tel').value });
    $('#b-test-durum').textContent = ' SMS gönderildi ✔ — telefonu kontrol et';
  } catch (e) { $('#b-test-durum').textContent = ' Hata: ' + e.message; }
});

// --- hesaplar ---
function domainleri_doldur() {
  const dler = [...new Set(hesaplar.map(h => h.domain))].sort();
  $('#f-domain').innerHTML = '<option value="">Tüm domainler (' + dler.length + ')</option>' +
    dler.map(d => `<option>${kacir(d)}</option>`).join('');
}

function hesaplari_ciz() {
  const dom = $('#f-domain').value, ara = $('#f-ara').value.toLowerCase();
  const satirlar = hesaplar
    .filter(h => (!dom || h.domain === dom) && (!ara || h.eposta.toLowerCase().includes(ara)))
    .map(h => `<tr>
      <td>${kacir(h.eposta)}</td><td>${kacir(h.domain)}</td>
      <td>${h.otp && h.otp.telefon ? kacir(h.otp.telefon) : '<span class="kucuknot">tanımsız</span>'}</td>
      <td class="islem">
        <button class="btn kucuk ikincil" data-is="sifre" data-e="${kacir(h.eposta)}">Şifre Sıfırla</button>
        <button class="btn kucuk tehlike" data-is="sil" data-e="${kacir(h.eposta)}">Sil</button>
      </td></tr>`).join('');
  $('#t-hesaplar tbody').innerHTML = satirlar || '<tr><td colspan="4">Kayıt yok</td></tr>';
}
$('#f-domain').addEventListener('change', hesaplari_ciz);
$('#f-ara').addEventListener('input', hesaplari_ciz);

async function yenile() {
  hesaplar = await api('/api/hesaplar');
  domainleri_doldur(); hesaplari_ciz(); otp_ciz();
}

// --- modal altyapisi ---
let modal_tamam = null;
function modal_ac(baslik, govdeHtml, tamamMetni, tamamFn) {
  $('#m-baslik').textContent = baslik;
  $('#m-govde').innerHTML = govdeHtml;
  $('#m-tamam').textContent = tamamMetni;
  $('#m-tamam').classList.remove('gizli');
  modal_tamam = tamamFn;
  $('#modal-zemin').classList.remove('gizli');
}
function modal_kapat() { $('#modal-zemin').classList.add('gizli'); modal_tamam = null; }
$('#m-vazgec').addEventListener('click', modal_kapat);
$('#m-tamam').addEventListener('click', async () => {
  if (!modal_tamam) return modal_kapat();
  try { await modal_tamam(); } catch (e) { alert(e.message); }
});

$('#yeni-btn').addEventListener('click', () => {
  const dler = [...new Set(hesaplar.map(h => h.domain))].sort();
  modal_ac('Yeni Posta Hesabı', `
    <div class="satir">
      <div><label>Kullanıcı</label><input id="m-kullanici" placeholder="ör. destek"></div>
      <div><label>Domain</label><select id="m-domain">${dler.map(d => `<option>${kacir(d)}</option>`).join('')}</select></div>
    </div>
    <label>Parola (boş bırak = otomatik güçlü üret)</label><input id="m-parola" placeholder="otomatik">
    <label>OTP doğrulama telefonu (isteğe bağlı)</label><input id="m-telefon" placeholder="kişi bildiği gibi girer">`,
    'Hesabı Aç', async () => {
      const s = await api('/api/hesaplar', {
        kullanici: $('#m-kullanici').value.trim(), domain: $('#m-domain').value,
        parola: $('#m-parola').value || undefined, telefon: $('#m-telefon').value
      });
      parola_goster(`${s.eposta} açıldı`, s.parola);
      await yenile();
    });
});

function parola_goster(baslik, parola) {
  modal_ac(baslik, `
    <p class="kucuknot">Parola YALNIZ ŞİMDİ görünür, kaydedilmez — kopyala ve sahibine ilet:</p>
    <div class="parola-goster">${kacir(parola)}</div>`, 'Kapat', async () => modal_kapat());
}

document.addEventListener('click', async e => {
  const b = e.target.closest('button[data-is]'); if (!b) return;
  const eposta = b.dataset.e;
  if (b.dataset.is === 'sifre') {
    modal_ac('Şifre Sıfırla', `<p><b>${kacir(eposta)}</b> için yeni parola üretilecek. Eski parola geçersiz olur.</p>`,
      'Sıfırla', async () => {
        const s = await api('/api/hesaplar/sifre', { eposta });
        parola_goster('Yeni parola', s.parola);
      });
  }
  if (b.dataset.is === 'sil') {
    modal_ac('Hesabı SİL', `
      <p><b>${kacir(eposta)}</b> ve TÜM POSTALARI kalıcı silinir. Geri dönüşü yok.</p>
      <label>Onay için adresi aynen yaz:</label><input id="m-onay" placeholder="${kacir(eposta)}">`,
      'Kalıcı Sil', async () => {
        await api('/api/hesaplar/sil', { eposta, onay: $('#m-onay').value.trim() });
        modal_kapat(); await yenile();
      });
  }
});

// --- otp sekmesi ---
function otp_ciz() {
  $('#t-otp tbody').innerHTML = hesaplar.map(h => `<tr>
    <td>${kacir(h.eposta)}</td>
    <td><input class="tablo-ici" data-tel="${kacir(h.eposta)}" value="${h.otp && h.otp.telefon ? kacir(h.otp.telefon) : ''}" placeholder="telefon">
        <button class="btn kucuk ikincil" data-kaydet="${kacir(h.eposta)}">Kaydet</button></td>
    <td><span class="anahtar ${h.otp && h.otp.sms_giris_acik ? 'acik' : ''}" data-anahtar="${kacir(h.eposta)}"></span></td>
  </tr>`).join('') || '<tr><td colspan="3">Kayıt yok</td></tr>';
}

document.addEventListener('click', async e => {
  const k = e.target.closest('button[data-kaydet]');
  if (k) {
    const eposta = k.dataset.kaydet;
    const h = hesaplar.find(x => x.eposta === eposta);
    await api('/api/otp', { eposta, telefon: document.querySelector(`input[data-tel="${CSS.escape(eposta)}"]`).value,
      sms_giris_acik: !!(h.otp && h.otp.sms_giris_acik) }).catch(x => alert(x.message));
    await yenile();
  }
  const a = e.target.closest('.anahtar[data-anahtar]');
  if (a) {
    const eposta = a.dataset.anahtar;
    const h = hesaplar.find(x => x.eposta === eposta);
    const yeni = !(h.otp && h.otp.sms_giris_acik);
    await api('/api/otp', { eposta, telefon: h.otp ? h.otp.telefon : null, sms_giris_acik: yeni })
      .catch(x => alert(x.message));
    await yenile();
  }
});

// --- kayitlar ---
async function kayitlari_ciz() {
  const veri = await api('/api/kayitlar');
  $('#t-kayitlar tbody').innerHTML = veri.map(k => `<tr>
    <td>${new Date(k.ts).toLocaleString('tr-TR')}</td><td>${kacir(k.yonetici)}</td>
    <td>${kacir(k.islem)}</td><td>${kacir(k.hedef || '')}</td></tr>`).join('') ||
    '<tr><td colspan="4">Kayıt yok</td></tr>';
}

baslat();
