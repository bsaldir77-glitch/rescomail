# Resco Mail Kapı — SMS ile parolasız webmail girişi (KURULDU, 2026-08-09)

**Tek adres: `webmail.rescopos.com`.** Kullanıcı buraya girer, giriş sayfasında "SMS ile giriş" kutusunu görür:
e-posta → [Kod Gönder] → telefona 6 haneli kod → [Giriş Yap] → posta kutusu. Parola hiç girilmez.
Hangi markanın hesabı olursa olsun (saldir.tr, expresscoffee.com.tr…) hepsi bu adresten girer — tüm
`webmail.*` adresleri zaten aynı sogod'a bağlı ve kullanıcı kaynağı tüm domainleri kapsıyor.

## 1. Mimari — kanıta dayalı (sunucu doğrulamaları, 2026-08-09)

1. Plesk posta parolalarını **`sym`** (geri döndürülebilir) saklıyor; `plesk sbin mail_auth_view` (0750 root:root) düz metin verir.
2. `POST /SOGo/connect` doğru kimlikle **200 + `0xHIGHFLYxSOGo` oturum çerezi** döndürüyor (test edildi).

Bu yüzden ilk taslaktaki `SOGoTrustProxyAuthentication` + Dovecot master-user yolu **terk edildi**.

```
webmail.rescopos.com (SOGo giriş sayfası)
  └─ theme.js içine eklenen kutu (theme/kapi-giris.js)      ← ekran
       ↓ fetch (credentials, CORS)
mailprovider.rescopos.com  /api/kapi/kod · /api/kapi/dogrula ← doğrulama (mevcut panel uygulaması)
       ↓ sudo (tek komut)
deploy/parola-koprusu.sh (root)                              ← parola panele HİÇ verilmez
       ↓ SOGo /connect (yerel)
  oturum çerezi → panel çerezi Domain=.rescopos.com ile yazar → sayfa /SOGo/'ya gider
```

**Kazanç:** yeni alan adı yok, yeni servis yok, `sogo.conf` değişmiyor, **SOGo restart'ı gerekmiyor**
(giriş kutusu statik JS olarak iniyor), trust-başlığı yok, posta trafiği bizim koddan geçmiyor.

## 2. Güvenlik hattı

- Parola panel sürecine girmez — köprü root'tadır, dışarı yalnız oturum çerezi verir.
- Köprü üç kapı: e-posta regex · hesap `otp_ayarlari.sms_giris_acik=true` olmalı · `.env` yolu root'a ait
  `/etc/rescomail-kapi.conf`'tan gelir (çağıran süreç seçemez). Köprü `root:root 0750`, vhost kullanıcısı
  yalnız **tek komuta** sudo hakkına sahip.
- CORS yalnız `https://webmail.rescopos.com` kaynağına açık (`KAPI_KAYNAK` ile genişletilebilir).
- OTP: 6 hane · 5 dk · 5 yanlış = kilit · 60 sn yeniden-gönderim freni · IP başına 8 istek/15 dk · SHA-256 hash, tek kullanımlık.
- Her olay `kapi_giris_kayitlari`'na yazılır. SMS'i açmayan hesaplar parolayla girmeye devam eder.
- **Geri dönüş:** `deploy/apply.sh`'ta birleştirmeyi kaldırıp tekrar çalıştırmak yeterli — giriş kutusu kaybolur, SOGo'nun kendi girişi kalır.

## 3. Kurulum / güncelleme

- Panel + köprü: `deploy/yonetim-kurulum.sh` (sudoers + `/etc/rescomail-kapi.conf` dahil, idempotent).
- Giriş kutusu: `deploy/apply.sh` → `theme/theme.js` + `theme/kapi-giris.js` birleşip SOGo'ya iner.
- Kullanıcı açma: panel → OTP Ayarları → telefon + "SMS ile giriş" anahtarı.

## 4. Kullanılmayan dosyalar

Tek-adres kararından önce yazılan ayrı Kapı uygulaması **kullanılmıyor**: `kapi/` klasörü ve
`deploy/kapi-kurulum.sh`, `deploy/eposta-vhost.conf` (silme onayı bekliyor).

**Ders (2026-08-09):** Pilot için `giris.saldir.tr` alt alan adı **sorulmadan oluşturuldu**; tek-adres
kararıyla gereksiz kaldı ve Bülent'in talimatıyla silindi. Kural: **prod'da yeni alan adı/kaynak
oluşturmadan önce onay alınır** — geri alınabilir olması gerekçe değildir.
