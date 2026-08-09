// Iki baglanti: PG (kendi verimiz) + MySQL (Plesk'in sogo_users_view'i, SALT-OKUMA listeleme)
const { Pool } = require('pg');
const mysql = require('mysql2/promise');

const pg = new Pool({
  host: process.env.PG_HOST || '127.0.0.1',
  user: process.env.PG_USER,
  password: process.env.PG_PASS,
  database: process.env.PG_DB || 'rescomail_db',
  max: 5
});

const my = mysql.createPool({
  host: process.env.MYSQL_HOST || '127.0.0.1',
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASS,
  database: process.env.MYSQL_DB,
  connectionLimit: 3
});

async function sema() {
  await pg.query(`CREATE TABLE IF NOT EXISTS yoneticiler (
    id SERIAL PRIMARY KEY,
    eposta TEXT UNIQUE NOT NULL,
    parola_hash TEXT NOT NULL,
    aktif BOOLEAN NOT NULL DEFAULT true,
    olusturma TIMESTAMPTZ NOT NULL DEFAULT now())`);
  await pg.query(`ALTER TABLE yoneticiler ADD COLUMN IF NOT EXISTS telefon TEXT`);
  await pg.query(`ALTER TABLE yoneticiler ADD COLUMN IF NOT EXISTS sms_giris BOOLEAN NOT NULL DEFAULT false`);
  await pg.query(`CREATE TABLE IF NOT EXISTS giris_kodlari (
    eposta TEXT PRIMARY KEY,
    kod_hash TEXT NOT NULL,
    bitis TIMESTAMPTZ NOT NULL,
    deneme INT NOT NULL DEFAULT 0)`);
  await pg.query(`CREATE TABLE IF NOT EXISTS otp_ayarlari (
    id SERIAL PRIMARY KEY,
    eposta TEXT UNIQUE NOT NULL,
    telefon TEXT,
    sms_giris_acik BOOLEAN NOT NULL DEFAULT false,
    guncelleme TIMESTAMPTZ NOT NULL DEFAULT now())`);
  await pg.query(`CREATE TABLE IF NOT EXISTS baglanti_ayarlari (
    saglayici TEXT PRIMARY KEY,
    veri_sifreli TEXT NOT NULL,
    guncelleme TIMESTAMPTZ NOT NULL DEFAULT now())`);
  await pg.query(`CREATE TABLE IF NOT EXISTS islem_kayitlari (
    id SERIAL PRIMARY KEY,
    yonetici TEXT NOT NULL,
    islem TEXT NOT NULL,
    hedef TEXT,
    detay JSONB,
    ts TIMESTAMPTZ NOT NULL DEFAULT now())`);
}

async function kayit(yonetici, islem, hedef, detay) {
  await pg.query(
    'INSERT INTO islem_kayitlari (yonetici, islem, hedef, detay) VALUES ($1,$2,$3,$4)',
    [yonetici, islem, hedef || null, detay ? JSON.stringify(detay) : null]
  );
}

// sogo_users_view kolon adlari kuruluma gore degisebilir — esnek eslestir
async function hesaplari_listele() {
  const [rows] = await my.query('SELECT * FROM sogo_users_view');
  return rows.map(r => ({
    eposta: r.mail || r.c_uid || r.uid || '',
    ad: r.c_cn || r.cn || '',
    domain: r.domain || (r.mail || r.c_uid || '').split('@')[1] || ''
  })).filter(h => h.eposta);
}

module.exports = { pg, my, sema, kayit, hesaplari_listele };
