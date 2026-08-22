/* Resco Mail — SOGo giris sayfasina SMS ile giris (Kapi) eklentisi.
   Tema dosyasinin sonuna eklenerek dagitilir (apply.sh birlestirir) → SOGo restart'i GEREKMEZ.
   Dogrulama ucu: yonetim paneli. Ayni ust alandaysa cerezi sunucu yazar; farkli
   ust alandaysa (webmail.rescotelecom.com) sunucu cerezi yanitta doner, burada
   KENDI alanimizda yazariz — bir sunucu baska ust alana cerez yazamaz. */
(function () {
  'use strict';
  var API = 'https://mailprovider.rescopos.com';
  var MAVI = '#1E88E5', KENAR = '#DDE6EE';

  function el(tag, stil, ozellik) {
    var e = document.createElement(tag);
    if (stil) e.setAttribute('style', stil);
    Object.keys(ozellik || {}).forEach(function (k) { e[k] = ozellik[k]; });
    return e;
  }

  // --- Robot dogrulamasi: gorsel sunucuda uretilir, cevap tek kullanimliktir ---
  var capId = '', capResim = null, capKutu = null;
  function captchaYenile() {
    if (capKutu) capKutu.value = '';
    fetch(API + '/api/kapi/captcha', { credentials: 'include' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        if (!j) { capId = ''; if (capResim) capResim.style.display = 'none'; return; }
        capId = j.id || '';
        if (capResim) { capResim.src = j.resim || ''; capResim.style.display = 'block'; }
      })
      .catch(function () { capId = ''; if (capResim) capResim.style.display = 'none'; });
  }

  function api(yol, govde) {
    return fetch(API + yol, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(govde)
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) throw new Error(j.hata || 'Bir sorun oluştu');
        return j;
      });
    });
  }

  // Giris formu: parola alani + kullanici adi alani birlikte olan form (posta kutusundaki
  // "parola degistir" penceresinde kullanici adi alani yoktur → oraya kutu eklenmez).
  function girisFormu() {
    var formlar = Array.prototype.slice.call(document.querySelectorAll('form'));
    for (var i = 0; i < formlar.length; i++) {
      var f = formlar[i];
      if (f.querySelector('input[type="password"]') &&
          f.querySelector('input[type="text"], input[type="email"], input:not([type])')) return f;
    }
    return null;
  }

  function kur() {
    if (document.getElementById('resco-kapi')) return true;
    var form = girisFormu();
    if (!form) return false;

    var kutu = el('div', 'margin:0 0 18px;padding:16px;border:1px solid ' + KENAR +
      ';border-radius:10px;background:#fff;font-family:"Segoe UI",sans-serif;text-align:left');
    kutu.id = 'resco-kapi';

    var baslik = el('div', 'font-size:15px;font-weight:600;color:#33424F;margin-bottom:4px');
    baslik.textContent = 'Resco Mail girişi';
    var alt = el('div', 'font-size:12.5px;color:#5b6b78;margin-bottom:12px');
    alt.textContent = 'E-posta adresinizi yazın, telefonunuza gelen kodla girin.';

    var gStil = 'width:100%;padding:11px 12px;border:1px solid ' + KENAR +
      ';border-radius:8px;font-size:14px;margin-bottom:10px;box-sizing:border-box';
    var eposta = el('input', gStil, { type: 'email', placeholder: 'E-posta adresiniz', autocomplete: 'username' });
    var kod = el('input', gStil + ';letter-spacing:.4em;text-align:center;display:none',
      { type: 'text', inputMode: 'numeric', maxLength: 6, placeholder: '••••••', autocomplete: 'one-time-code' });

    var bStil = 'width:100%;padding:11px;border:0;border-radius:8px;background:' + MAVI +
      ';color:#fff;font-size:14px;font-weight:600;cursor:pointer';
    var btn = el('button', bStil, { type: 'button', textContent: 'Kod Gönder' });
    var durum = el('div', 'font-size:12.5px;color:#C62828;min-height:18px;margin-top:8px');

    var asama = 'eposta';
    btn.addEventListener('click', function () {
      durum.style.color = '#C62828'; durum.textContent = '';
      var adres = (eposta.value || '').trim();
      if (!adres) { durum.textContent = 'E-posta adresinizi girin'; return; }
      btn.disabled = true;
      if (asama === 'eposta') {
        api('/api/kapi/kod', { eposta: adres, captcha: { id: capId, cevap: (capKutu && capKutu.value || '').trim() } }).then(function (s) {
          asama = 'kod';
          kod.style.display = 'block';
          capSatir.style.display = 'none';        // dogrulama gecildi, kutu gerekmiyor
          btn.textContent = 'Giriş Yap';
          durum.style.color = '#2E7D32';
          durum.textContent = s.maske ? 'Kod ' + s.maske + ' numarasına gönderildi' : 'Kod gönderildi';
          kod.focus();
        }).catch(function (e) {
          durum.textContent = e.message === 'captcha_gecersiz'
            ? 'Doğrulama kodu hatalı — yeni kodu yazın' : e.message;
          captchaYenile();                        // cevap tek kullanimlik, yenile
        }).then(function () { btn.disabled = false; });
      } else {
        api('/api/kapi/dogrula', { eposta: adres, kod: (kod.value || '').trim() }).then(function (s) {
          // Farkli ust alan: cerezi sunucu yazamaz, burada yaziyoruz.
          (s && s.cerezler || []).forEach(function (c) {
            document.cookie = c + '; Path=/; Secure; SameSite=Lax';
          });
          durum.style.color = '#2E7D32';
          durum.textContent = 'Giriş yapılıyor...';
          location.href = (s && s.hedef) || '/SOGo/';
        }).catch(function (e) { durum.textContent = e.message; btn.disabled = false; });
      }
    });
    [eposta, kod].forEach(function (g) {
      g.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') { ev.preventDefault(); btn.click(); } });
    });

    // Robot dogrulamasi: gorsel + kutu (kod adimina gecince gizlenir)
    var capSatir = el('div', 'display:flex;gap:9px;align-items:stretch;margin:2px 0 6px');
    capResim = el('img', 'flex:none;width:150px;height:46px;border-radius:8px;background:#f1f5f9;display:none');
    capResim.alt = 'Doğrulama kodu';
    var capSag = el('div', 'flex:1;min-width:0;display:flex;flex-direction:column;gap:4px');
    capKutu = el('input', 'width:100%;padding:9px 11px;border:1.5px solid ' + KENAR +
      ';border-radius:8px;font-size:14px;letter-spacing:.14em;text-transform:uppercase',
      { placeholder: 'Gördüğünüz kod', autocomplete: 'off', spellcheck: false, maxLength: 6 });
    var capYenile = el('button', 'align-self:flex-start;background:none;border:0;padding:0;color:' + MAVI +
      ';font-size:12px;font-weight:600;cursor:pointer;text-decoration:underline', { textContent: 'Yenile', type: 'button' });
    capYenile.addEventListener('click', function (e) { e.preventDefault(); captchaYenile(); });
    capSag.appendChild(capKutu); capSag.appendChild(capYenile);
    capSatir.appendChild(capResim); capSatir.appendChild(capSag);

    [baslik, alt, eposta, capSatir, kod, btn, durum].forEach(function (c) { kutu.appendChild(c); });
    captchaYenile();

    // Bulent karari (2026-08-09): webmail girisi YALNIZ SMS ile. Klasik giris (kullanici adi +
    // parola + dil secici) sayfadan tamamen kaldirilir; hesabi acmak yoneticinin elindedir.
    form.parentNode.insertBefore(kutu, form);
    form.style.display = 'none';
    var secici = document.querySelector('md-select, select');
    if (secici && !form.contains(secici)) {
      var kap = secici.closest('div') || secici;
      (kap.contains(form) ? secici : kap).style.display = 'none';
    }
    return true;
  }

  // SOGo tek sayfalik uygulama: cikista/oturum bitiminde giris ekrani YENIDEN cizilir ve
  // kutumuz DOM'dan silinir. Bu yuzden surekli izleyip her belirdiginde tekrar ekliyoruz.
  function izle() {
    kur();
    var bekleyen = null;
    new MutationObserver(function () {
      if (bekleyen) return;
      bekleyen = setTimeout(function () { bekleyen = null; kur(); }, 120);
    }).observe(document.documentElement, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', izle);
  else izle();
})();
