// Plesk REST API — yalniz posta CLI gecidi kullanilir (tasarim karari: baska Plesk yetkisine dokunulmaz).
// Yerel 8443 self-signed sertifika kullanir; anahtar .env'de (PLESK_API_KEY), repoya girmez.
const https = require('https');

function cli_cagir(params) {
  const govde = JSON.stringify({ params });
  const secenek = {
    host: '127.0.0.1',
    port: 8443,
    path: '/api/v2/cli/mail/call',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(govde),
      'X-API-Key': process.env.PLESK_API_KEY
    },
    rejectUnauthorized: false,
    timeout: 30000
  };
  return new Promise((resolve, reject) => {
    const istek = https.request(secenek, res => {
      let veri = '';
      res.on('data', p => veri += p);
      res.on('end', () => {
        let json;
        try { json = JSON.parse(veri); } catch { json = { stdout: veri }; }
        if (res.statusCode >= 200 && res.statusCode < 300 && (json.code === 0 || json.code === undefined)) {
          resolve(json);
        } else {
          reject(new Error(`Plesk ${res.statusCode} kod=${json.code}: ${json.stderr || json.stdout || veri}`.slice(0, 400)));
        }
      });
    });
    istek.on('error', reject);
    istek.on('timeout', () => istek.destroy(new Error('Plesk API zaman asimi')));
    istek.write(govde);
    istek.end();
  });
}

const hesap_ac = (eposta, parola) =>
  cli_cagir(['--create', eposta, '-passwd', parola, '-mailbox', 'true']);
const parola_degistir = (eposta, parola) =>
  cli_cagir(['--update', eposta, '-passwd', parola]);
const hesap_kapat = eposta => cli_cagir(['--off', eposta]);
const hesap_ac_durum = eposta => cli_cagir(['--on', eposta]);
const hesap_sil = eposta => cli_cagir(['--remove', eposta]);

module.exports = { hesap_ac, parola_degistir, hesap_kapat, hesap_ac_durum, hesap_sil };
