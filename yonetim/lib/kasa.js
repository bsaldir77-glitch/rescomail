// Sifreli baglanti kasasi — AES-256-GCM, anahtar .env BAGLANTI_KEY (64 hex). api-hub deseni.
const crypto = require('crypto');

function anahtar() {
  const k = process.env.BAGLANTI_KEY || '';
  if (k.length !== 64) throw new Error('BAGLANTI_KEY eksik/gecersiz (.env, 64 hex)');
  return Buffer.from(k, 'hex');
}

function sifrele(nesne) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', anahtar(), iv);
  const govde = Buffer.concat([c.update(JSON.stringify(nesne), 'utf8'), c.final()]);
  return `${iv.toString('hex')}.${c.getAuthTag().toString('hex')}.${govde.toString('hex')}`;
}

function coz(metin) {
  if (!metin) return null;
  const [iv, tag, veri] = metin.split('.');
  const d = crypto.createDecipheriv('aes-256-gcm', anahtar(), Buffer.from(iv, 'hex'));
  d.setAuthTag(Buffer.from(tag, 'hex'));
  return JSON.parse(Buffer.concat([d.update(Buffer.from(veri, 'hex')), d.final()]).toString('utf8'));
}

const maskele = deger => {
  const s = String(deger || '');
  return s.length <= 3 ? '***' : s.slice(0, 2) + '***';
};

module.exports = { sifrele, coz, maskele };
