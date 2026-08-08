# Resco Mail Yönetim — V1 Tasarım (onay bekliyor)

Görsel sunum: [yonetim-sunum.html](yonetim-sunum.html) (Bülent gördü, hedef adres kararı verildi).
**Yayın adresi: `mailprovider.rescopos.com`** (Plesk subdomain — Bülent tanımlar; SSL: mevcut Sectigo wildcard `*.rescopos.com`).

## 1. Ne yapar (V1 kapsamı)

| Ekran | İşlev | Kaynak |
|---|---|---|
| Giriş | Tek yönetici, e-posta+parola (bcrypt) + oturum çerezi; hatalı girişte hız sınırı | kendi DB |
| Hesaplar | 11 domain'in posta kutuları: listele/ara/filtrele; **aç, şifre sıfırla, kapat/aç, sil (iki adımlı onay)** | Plesk API |
| Yeni Hesap | kullanıcı+domain, otomatik güçlü parola, kota, isteğe bağlı OTP telefonu (format dayatılmaz) | Plesk API + kendi DB |
| OTP Ayarları | hesap başına telefon + "SMS ile giriş" anahtarı (V1'de yalnız kayıt; V2 Kapı okur) | kendi DB |
| İşlem Kaydı | her yönetim işlemi: kim, ne, ne zaman, hedef hesap | kendi DB |

V1'de OLMAYAN: SMS gönderimi/girişi (V2 Kapı), çoklu yönetici, domain ekleme (Plesk'te yapılır).

## 2. Mimari

- **Tek Node/Express uygulaması** — repo: `rescomail/yonetim/`. Frontend: statik HTML+CSS+vanilla JS
  (mockup'taki Resco teması birebir; build adımı YOK — dist derdi olmasın).
- **Barınma:** Plesk Node.js (Passenger) — `mailprovider.rescopos.com` document root'u repo klonunun
  `yonetim/` klasörüne bağlanır. Deploy = `git pull` (rescopos disiplini: lokal=GitHub=prod).
- **Hesap işlemleri → Plesk REST API** (`https://127.0.0.1:8443/api/v2/`), `X-API-Key` ile.
  Posta uçları REST'te sınırlı olduğundan CLI geçidi kullanılır: `POST /api/v2/cli/mail/call`
  (örn. `--create destek@rescopos.com -passwd ... -mailbox true`). API anahtarı kurulumda bir kez
  üretilir, yalnız sunucudaki `.env`'de durur — repoya ASLA girmez.
- **Kendi verisi → PostgreSQL** (sunucudaki mevcut PG): yeni DB `rescomail_db`, yeni kullanıcı.
  - `otp_ayarlari(id, eposta UNIQUE, telefon, sms_giris_acik BOOL DEFAULT false, guncelleme)`
    — telefon sunucuda normalize edilir (girdi alanına format dayatılmaz).
  - `islem_kayitlari(id, yonetici, islem, hedef, detay JSONB, ts)` — silme/sıfırlama dahil her şey.
  - `yoneticiler(id, eposta UNIQUE, parola_hash, aktif)` — V1'de tek kayıt (Bülent).
- **Oturum:** imzalı httpOnly çerez; CSRF token; login hız sınırı (5 deneme/15 dk).

## 3. Güvenlik hattı

- Panel yalnız HTTPS (wildcard sertifika). Plesk API anahtarı ve DB parolası `.env`'de (gitignore).
- Silme iki adımlı onay + işlem kaydı. Parola sıfırlama yeni parolayı EKRANDA BİR KEZ gösterir, saklamaz.
- Uygulama Plesk'e yalnız posta CLI'ı ile dokunur — başka Plesk yetkisi kullanılmaz.
- 401/403 ayrımı: yanlış parola 403 döner (rescopos'taki 401→logout tuzağı dersi).

## 4. Kurulum sırası (kod onayından sonra)

1. Bülent: Plesk'te `mailprovider.rescopos.com` subdomain'i + Node.js desteği açar; wildcard SSL'i seçer.
2. Claude: `yonetim/` iskeleti (app.js, api, statik arayüz) → commit → push → prod'da `/opt/rescomail` pull.
3. Bülent onayıyla: PG DB oluşturma + Plesk API anahtarı üretimi + `.env` yerleştirme (tek seferlik komutlar hazırlanır, onaylı çalıştırılır).
4. Passenger başlatma + uçtan uca test: hesap aç → SOGo'da giriş yap → sil → işlem kaydında gör.

## 5. V2 — Kapı (ayrı tasarım dokümanı gerekir, BAŞLANMAZ)

SMS-OTP parolasız webmail girişi: OTP portalı (NetGSM) + `SOGoTrustProxyAuthentication` + Dovecot
master-user. `otp_ayarlari` tablosu V1'den hazır olacak. Güvenlik tasarımı onaylanmadan tek satır kod yok.
