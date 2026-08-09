/* Resco Mail — SOGo giris sayfasina SMS ile giris (Kapi) eklentisi.
   Tema dosyasinin sonuna eklenerek dagitilir (apply.sh birlestirir) → SOGo restart'i GEREKMEZ.
   Dogrulama ucu: yonetim paneli (ayni ust alan: rescopos.com) → cerez .rescopos.com'a yazilir. */
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
        api('/api/kapi/kod', { eposta: adres }).then(function (s) {
          asama = 'kod';
          kod.style.display = 'block';
          btn.textContent = 'Giriş Yap';
          durum.style.color = '#2E7D32';
          durum.textContent = s.maske ? 'Kod ' + s.maske + ' numarasına gönderildi' : 'Kod gönderildi';
          kod.focus();
        }).catch(function (e) { durum.textContent = e.message; })
          .then(function () { btn.disabled = false; });
      } else {
        api('/api/kapi/dogrula', { eposta: adres, kod: (kod.value || '').trim() }).then(function () {
          durum.style.color = '#2E7D32';
          durum.textContent = 'Giriş yapılıyor...';
          location.href = '/SOGo/';
        }).catch(function (e) { durum.textContent = e.message; btn.disabled = false; });
      }
    });
    [eposta, kod].forEach(function (g) {
      g.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') { ev.preventDefault(); btn.click(); } });
    });

    [baslik, alt, eposta, kod, btn, durum].forEach(function (c) { kutu.appendChild(c); });

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
