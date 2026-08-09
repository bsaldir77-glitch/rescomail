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
      $('#g-parola').classList.remove('gizli');   // ilk kurulumda parola belirlenir
    }
    $('#giris').classList.remove('gizli');
  }
}

// Giris akisi: once e-posta → hesapta SMS acikse kod, degilse parola sorulur
let giris_modu = 'eposta';
$('#g-btn').addEventListener('click', async () => {
  $('#g-hata').textContent = '';
  const eposta = $('#g-eposta').value.trim();
  const btn = $('#g-btn');
  try {
    if (btn.textContent === 'Yönetici Oluştur') {
      await api('/api/kurulum', { eposta, parola: $('#g-parola').value });
      await api('/api/giris', { eposta, parola: $('#g-parola').value });
      return location.reload();
    }
    if (giris_modu === 'otp') {
      await api('/api/giris/otp', { eposta, kod: $('#g-kod').value.trim() });
      return location.reload();
    }
    if (giris_modu === 'parola') {
      await api('/api/giris', { eposta, parola: $('#g-parola').value });
      return location.reload();
    }
    if (!eposta) { $('#g-hata').textContent = 'E-posta adresini gir'; return; }
    btn.disabled = true;
    const s = await api('/api/giris', { eposta });      // parola gondermeden sor
    if (s.otp_gerekli) {
      giris_modu = 'otp';
      $('#g-kod').classList.remove('gizli');
      btn.textContent = 'Giriş Yap';
      $('#g-hata').textContent = s.not || 'Kod telefonuna gönderildi';
      $('#g-kod').focus();
    } else {
      giris_modu = 'parola';
      $('#g-parola').classList.remove('gizli');
      btn.textContent = 'Giriş Yap';
      $('#g-parola').focus();
    }
  } catch (e) { $('#g-hata').textContent = e.message; }
  finally { $('#g-btn').disabled = false; }
});
['g-eposta', 'g-parola', 'g-kod'].forEach(function (id) {
  $('#' + id).addEventListener('keydown', function (e) { if (e.key === 'Enter') $('#g-btn').click(); });
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
  ['hesaplar', 'otp', 'baglantilar', 'sms', 'kayitlar'].forEach(s => $('#sekme-' + s).classList.toggle('gizli', s !== el.dataset.sekme));
  if (el.dataset.sekme === 'kayitlar') kayitlari_ciz();
  if (el.dataset.sekme === 'baglantilar') { baglantilari_ciz(); yonetici_ciz(); }
  if (el.dataset.sekme === 'sms') sms_ciz();
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
  const secenekler = '<option value="">Tüm domainler (' + dler.length + ')</option>' +
    dler.map(d => `<option>${kacir(d)} (${hesaplar.filter(h => h.domain === d).length})</option>`).join('');
  // secim korunur (yeniden cizimde kullanicinin filtresi kaybolmasin)
  [['#f-domain', hesaplari_ciz], ['#o-domain', otp_ciz]].forEach(([sec]) => {
    const onceki = $(sec).value;
    $(sec).innerHTML = secenekler;
    if (onceki) $(sec).value = onceki;
  });
}

// Secenek metninde sayac oldugu icin ("alan.com (3)") filtrelemede sayaci ayikla
const secili_domain = sec => ($(sec).value || '').replace(/\s*\(\d+\)\s*$/, '');

function hesaplari_ciz() {
  const dom = secili_domain('#f-domain'), ara = $('#f-ara').value.toLowerCase();
  const satirlar = hesaplar
    .filter(h => (!dom || h.domain === dom) && (!ara || h.eposta.toLowerCase().includes(ara)))
    .map(h => `<tr>
      <td>${kacir(h.eposta)}</td><td>${kacir(h.domain)}</td>
      <td>${h.otp && h.otp.telefon ? kacir(h.otp.telefon) : '<span class="kucuknot">tanımsız</span>'}</td>
      <td class="islem">
        <button class="btn kucuk" data-is="duzenle" data-e="${kacir(h.eposta)}">Düzenle</button>
        <button class="btn kucuk ikincil" data-is="bilgi" data-e="${kacir(h.eposta)}">Bilgi Gönder</button>
        <button class="btn kucuk tehlike" data-is="sil" data-e="${kacir(h.eposta)}">Sil</button>
      </td></tr>`).join('');
  $('#t-hesaplar tbody').innerHTML = satirlar || '<tr><td colspan="4">Kayıt yok</td></tr>';
}
$('#f-domain').addEventListener('change', hesaplari_ciz);
$('#f-ara').addEventListener('input', hesaplari_ciz);
$('#o-domain').addEventListener('change', otp_ciz);
$('#o-ara').addEventListener('input', otp_ciz);

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

$('#yeni-btn').addEventListener('click', async () => {
  // Sunucudaki TUM domainler (hesabi olmayanlar dahil); alinamazsa mevcutlardan turet
  let dler = await api('/api/domainler').catch(() => null);
  if (!Array.isArray(dler) || !dler.length) dler = [...new Set(hesaplar.map(h => h.domain))];
  dler = dler.sort();
  const filtre = secili_domain('#f-domain');   // listede hangi domain sectiysen o gelsin
  modal_ac('Yeni Posta Hesabı', `
    <div class="satir">
      <div><label>Kullanıcı</label><input id="m-kullanici" placeholder="ör. destek"></div>
      <div><label>Domain</label><select id="m-domain">
        <option value="">— domain seçin —</option>
        ${dler.map(d => `<option${d === filtre ? ' selected' : ''}>${kacir(d)}</option>`).join('')}
      </select></div>
    </div>
    <p class="kucuknot">Açılacak adres: <b id="m-onizleme">—</b></p>
    <label>Parola (boş bırak = otomatik güçlü üret)</label><input id="m-parola" placeholder="otomatik">
    <label>OTP doğrulama telefonu (isteğe bağlı)</label><input id="m-telefon" placeholder="kişi bildiği gibi girer">`,
    'Hesabı Aç', async () => {
      const kullanici = $('#m-kullanici').value.trim(), domain = $('#m-domain').value;
      if (!kullanici || !domain) throw new Error('Kullanıcı adı ve domain seçilmeli');
      const s = await api('/api/hesaplar', {
        kullanici, domain,
        parola: $('#m-parola').value || undefined, telefon: $('#m-telefon').value
      });
      parola_goster(`${s.eposta} açıldı`, s.parola, s.eposta);
      await yenile();
    });
  // Yanlis domain'e hesap acilmasin: adres canli gosterilir
  const onizle = () => {
    const k = $('#m-kullanici').value.trim(), d = $('#m-domain').value;
    $('#m-onizleme').textContent = (k && d) ? `${k}@${d}` : '—';
  };
  $('#m-kullanici').addEventListener('input', onizle);
  $('#m-domain').addEventListener('change', onizle);
  onizle();
});

function parola_goster(baslik, parola, eposta) {
  modal_ac(baslik, `
    <p class="kucuknot">Parola YALNIZ ŞİMDİ görünür, kaydedilmez — kopyala ve sahibine ilet:</p>
    <div class="parola-goster">${kacir(parola)}</div>
    <button class="btn ikincil" type="button" id="pg-sms" data-e="${kacir(eposta)}" data-p="${kacir(parola)}"
      style="margin-top:12px">📲 Bilgi sayfası + SMS gönder (parola dahil)</button>
    <span id="pg-sms-durum" class="kucuknot"></span>`, 'Kapat', async () => modal_kapat());
}

document.addEventListener('click', async e => {
  const b = e.target.closest('#pg-sms'); if (!b) return;
  $('#pg-sms-durum').textContent = ' Gönderiliyor...';
  try {
    await api('/api/hesaplar/bilgi', { eposta: b.dataset.e, parola: b.dataset.p });
    $('#pg-sms-durum').textContent = ' SMS gönderildi ✔ (sayfa 1 saat geçerli)';
  } catch (x) { $('#pg-sms-durum').textContent = ' Hata: ' + x.message; }
});

document.addEventListener('click', async e => {
  const b = e.target.closest('button[data-is]'); if (!b) return;
  const eposta = b.dataset.e;
  if (b.dataset.is === 'duzenle') {
    let d;
    try { d = await api('/api/hesaplar/detay?eposta=' + encodeURIComponent(eposta)); }
    catch (x) { return alert(x.message); }
    const kotalar = ['', '-1', '1G', '5G', '10G'];
    const kotaEtiket = { '': 'Değiştirme (' + (d.kota || 'varsayılan') + ')', '-1': 'Sınırsız',
      '1G': '1 GB', '5G': '5 GB', '10G': '10 GB' };
    modal_ac('Hesabı Düzenle — ' + eposta, `
      <label>Görünen ad / açıklama</label>
      <input id="d-aciklama" value="${kacir(d.aciklama || '')}" placeholder="ör. Muhasebe">
      <div class="satir">
        <div><label>Kota</label><select id="d-kota">
          ${kotalar.map(k => `<option value="${k}">${kacir(kotaEtiket[k])}</option>`).join('')}
        </select></div>
        <div><label>Posta kutusu</label><select id="d-kutu">
          <option value="1"${d.kutu ? ' selected' : ''}>Açık</option>
          <option value="0"${d.kutu ? '' : ' selected'}>Kapalı</option>
        </select></div>
      </div>
      <label>Yeni parola <span class="kucuknot">(boş bırakırsan değişmez)</span></label>
      <input id="d-parola" placeholder="değiştirmek için yaz">
      <hr>
      <label>OTP doğrulama telefonu</label>
      <input id="d-telefon" value="${d.otp && d.otp.telefon ? kacir(d.otp.telefon) : ''}" placeholder="kişi bildiği gibi girer">
      <label>SMS ile giriş</label>
      <select id="d-sms">
        <option value="1"${d.otp && d.otp.sms_giris_acik ? ' selected' : ''}>Açık — webmail'e kodla girer</option>
        <option value="0"${d.otp && d.otp.sms_giris_acik ? '' : ' selected'}>Kapalı — webmail'e giremez</option>
      </select>`,
      'Kaydet', async () => {
        const s = await api('/api/hesaplar/duzenle', {
          eposta,
          aciklama: $('#d-aciklama').value,
          kota: $('#d-kota').value || undefined,
          kutu: $('#d-kutu').value === '1',
          parola: $('#d-parola').value || undefined,
          telefon: $('#d-telefon').value,
          sms_giris_acik: $('#d-sms').value === '1'
        });
        if (s.parola) parola_goster('Yeni parola', s.parola, eposta);
        else modal_kapat();
        await yenile();
      });
  }
  if (b.dataset.is === 'sifre') {
    modal_ac('Şifre Sıfırla', `<p><b>${kacir(eposta)}</b> için yeni parola üretilecek. Eski parola geçersiz olur.</p>`,
      'Sıfırla', async () => {
        const s = await api('/api/hesaplar/sifre', { eposta });
        parola_goster('Yeni parola', s.parola, eposta);
      });
  }
  if (b.dataset.is === 'bilgi') {
    modal_ac('Hesap Bilgisi Gönder', `
      <p><b>${kacir(eposta)}</b> için 1 saat geçerli bilgi sayfası oluşturulacak, OTP telefonuna yalnız
      <b>bağlantı</b> SMS'lenecek (SMS'te bilgi yok). Sayfada: webmail adresi, e-posta, doğrulama telefonu.</p>
      <p class="kucuknot">Parola bu sayfaya EKLENMEZ — parola yalnız hesap açma / şifre sıfırlama anında gönderilebilir.</p>`,
      'Gönder', async () => {
        await api('/api/hesaplar/bilgi', { eposta });
        modal_kapat();
      });
  }
  if (b.dataset.is === 'sil') {
    modal_ac('Hesabı SİL', `
      <p><b>${kacir(eposta)}</b> ve TÜM POSTALARI kalıcı silinir. Geri dönüşü yok.</p>
      <label style="display:flex;gap:8px;align-items:center;cursor:pointer">
        <input type="checkbox" id="m-onay" style="width:auto">
        <span>Evet, bu hesabı ve postalarını kalıcı siliyorum</span></label>`,
      'Kalıcı Sil', async () => {
        if (!$('#m-onay').checked) throw new Error('Silmek için onay kutusunu işaretle');
        await api('/api/hesaplar/sil', { eposta, onay: eposta });
        modal_kapat(); await yenile();
      });
  }
});

// --- otp sekmesi ---
function otp_ciz() {
  const dom = secili_domain('#o-domain'), ara = $('#o-ara').value.toLowerCase();
  $('#t-otp tbody').innerHTML = hesaplar
    .filter(h => (!dom || h.domain === dom) && (!ara || h.eposta.toLowerCase().includes(ara)))
    .map(h => `<tr>
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

// --- SMS kayitlari ---
let sms_veri = [];
const SMS_TUR = { webmail_kodu: 'Webmail giriş kodu', giris_kodu: 'Panel giriş kodu',
  hesap_bilgisi: 'Hesap bilgilendirme', test: 'Bağlantı testi' };

async function sms_ciz(yeniden) {
  if (yeniden !== false) sms_veri = await api('/api/sms-kayitlari').catch(() => []);
  const tur = $('#s-tur').value;
  const rozet = (metin, renk) =>
    `<span class="rozet" style="background:${renk[0]};color:${renk[1]}">${kacir(metin)}</span>`;
  const teslim_rozet = k => {
    if (k.sonuc !== 'gonderildi') return '<span class="kucuknot">—</span>';
    if (!k.teslim) return '<span class="kucuknot">sorulmadı</span>';
    if (k.teslim === 'iletildi') return rozet('iletildi ✓', ['#E8F5E9', '#2E7D32']);
    if (k.teslim === 'bekliyor') return rozet('bekliyor', ['#FFF8E1', '#9A6B00']);
    return rozet(k.teslim, ['#FFEBEE', '#C62828']);
  };
  $('#t-sms tbody').innerHTML = sms_veri
    .filter(k => !tur || k.tur === tur)
    .map(k => `<tr>
      <td>${new Date(k.ts).toLocaleString('tr-TR')}</td>
      <td>${kacir(SMS_TUR[k.tur] || k.tur)}</td>
      <td>${kacir(k.telefon)}${k.rapor_no && k.rapor_no !== k.telefon
            ? `<br><span class="kucuknot" title="NetGSM'in gerçekte gönderdiği numara">→ ${kacir(k.rapor_no)}</span>` : ''}</td>
      <td>${kacir(k.eposta || '')}</td>
      <td>${k.sonuc === 'gonderildi'
            ? rozet('gönderildi', ['#E3F2FD', '#0D47A1'])
            : rozet('hata: ' + (k.hata || k.kod || ''), ['#FFEBEE', '#C62828'])}</td>
      <td>${teslim_rozet(k)}</td>
    </tr>`).join('') || '<tr><td colspan="6">Kayıt yok</td></tr>';
}
$('#s-tur').addEventListener('change', () => sms_ciz(false));
$('#s-durum').addEventListener('click', async () => {
  $('#s-durum-not').textContent = ' NetGSM\'e soruluyor...';
  try {
    const s = await api('/api/sms-kayitlari/durum', {});
    $('#s-durum-not').textContent = ` ${s.sorulan} kayıt soruldu, ${s.guncellenen} güncellendi` +
      (s.hata ? ' — ' + s.hata : '');
    await sms_ciz();
  } catch (e) { $('#s-durum-not').textContent = ' Hata: ' + e.message; }
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
