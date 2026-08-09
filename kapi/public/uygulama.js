// Kapi giris akisi: e-posta → kod → SOGo'ya devir. res.ok kontrolsuz ilerleme YOK.
const $ = s => document.querySelector(s);
const hata_yaz = m => { $('#hata').textContent = m || ''; };

async function api(yol, govde) {
  const r = await fetch(yol, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(govde)
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(j.hata || 'Bir sorun oluştu'); e.ek = j; throw e; }
  return j;
}

$('#kod-btn').addEventListener('click', async () => {
  hata_yaz();
  const eposta = $('#eposta').value.trim();
  if (!eposta) return hata_yaz('E-posta adresinizi girin');
  $('#kod-btn').disabled = true;
  try {
    const s = await api('/api/kod', { eposta });
    $('#maske').textContent = s.maske ? `Kod ${s.maske} numaralı telefona gönderildi.` : '';
    $('#adim-eposta').classList.add('gizli');
    $('#adim-kod').classList.remove('gizli');
    if (s.not) hata_yaz(s.not);
    $('#kod').focus();
  } catch (e) {
    hata_yaz(e.message);
    if (e.ek && e.ek.parola_yolu) {
      const a = $('#parola-yolu');
      a.href = e.ek.parola_yolu;
      a.classList.remove('gizli');
    }
  } finally { $('#kod-btn').disabled = false; }
});

$('#giris-btn').addEventListener('click', async () => {
  hata_yaz();
  const kod = $('#kod').value.trim();
  if (kod.length !== 6) return hata_yaz('6 haneli kodu girin');
  $('#giris-btn').disabled = true;
  try {
    const s = await api('/api/dogrula', { eposta: $('#eposta').value.trim(), kod });
    location.href = s.hedef;
  } catch (e) { hata_yaz(e.message); $('#giris-btn').disabled = false; }
});

$('#geri-btn').addEventListener('click', () => {
  hata_yaz(); $('#kod').value = '';
  $('#adim-kod').classList.add('gizli');
  $('#adim-eposta').classList.remove('gizli');
  $('#eposta').focus();
});

$('#kod').addEventListener('keydown', e => { if (e.key === 'Enter') $('#giris-btn').click(); });
$('#eposta').addEventListener('keydown', e => { if (e.key === 'Enter') $('#kod-btn').click(); });
