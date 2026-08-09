# Resco Mail Kapı — V2 Tasarım (webmail'e e-posta + OTP girişi) — ONAY BEKLİYOR

Hedef UX (Bülent, 2026-08-09): `webmail.<domain>` → Resco Mail giriş ekranı → **e-posta yaz → [Kod Gönder] → telefona 6 haneli OTP → giriş.** Parola yok, "şifre hiç çalınmaz."

## 1. Mimari

Yeni küçük Node süreci **`kapi/`** (Resco temalı giriş UI + doğrulayan ters-proxy). Zincir:

```
tarayıcı → Apache (webmail.<domain>) → Kapı (127.0.0.1:3100) → sogod (127.0.0.1:20000)
```

Akış:
1. Oturumsuz istek → Kapı, Resco Mail giriş sayfasını gösterir (e-posta alanı + Kod Gönder).
2. `/kapi/kod`: e-posta → `otp_ayarlari`'ndan telefon (**`sms_giris_acik=true` olan hesaplar**) → NetGSM ile kod. Panel akışıyla AYNI kurallar: 5 dk geçerli, 5 deneme, 60 sn yeniden-gönderim freni.
3. `/kapi/dogrula`: kod doğru → imzalı httpOnly çerez (ayrı `KAPI_SECRET` ile).
4. Çerezli istek → Kapı, sogod'a iletirken `x-webobjects-remote-user: <eposta>` + master-auth başlıklarını ekler (mailcow WebAuth deseni). SOGo `SOGoTrustProxyAuthentication = YES` ile kabul eder.
5. IMAP: Dovecot **master user** (Plesk Dovecot'una `auth_master` passdb) — kutu, kullanıcının parolası olmadan master kimlikle açılır; master parola YALNIZ sunucuda.

**Kademeli geçiş / kilitlenme emniyeti:** `sms_giris_acik=false` hesaplar Kapı ekranından "parola ile giriş" bağlantısıyla klasik SOGo login'e düşer — kimse dışarıda kalmaz; hesap hesap geçilir.

## 2. Güvenlik hattı (bu iş bunun için tasarım onayı ister)

- Kapı, istemciden gelen `x-webobjects-*` ve `Authorization` başlıklarını **koşulsuz siler** (header sahteciliği imkânsız).
- sogod zaten 127.0.0.1'de; trust başlığı yalnız Kapı üretebilir.
- Çerez HMAC'i panelinkinden AYRI secret'la; kod hash'leri SHA-256, tek kullanımlık.
- Telefon mail uygulamaları (IMAP/DAV/EAS) bu fazın DIŞINDA — parola ile çalışmaya devam eder (spike'ta doğrulanır).
- **Acil geri dönüş:** Apache'de Kapı'yı devreden çıkarıp eski doğrudan-SOGo proxy'sine dönen hazır satır (tek onaylı değişiklik).

## 3. Fazlar

1. **Spike — yalnız `webmail.saldir.tr`:** Dovecot master user + `SOGoTrustProxyAuthentication` canlı doğrulama (sogo restart'ları Bülent onaylı), Kapı prototipi tek domain'de. Bülent kendi hesabıyla test eder.
2. Kapı UI cilası + panel entegrasyonu (OTP Ayarları'ndaki anahtar artık webmail girişini de yönetir) + `kapi_giris_kayitlari` izleme tablosu.
3. Kalan 10 domain'e yayılım (Apache ayarı Plesk "Additional directives" üzerinden, şablonla).

## 4. Spike'ta netleşecek açık noktalar

- Plesk Dovecot'unda master user'ın güncellemeye dayanıklı yeri (`/etc/dovecot/conf.d/` özel include).
- `SOGoTrustProxyAuthentication` global bir ayar — Kapı'sız vhost'larda trust başlığı hiç üretilmediği için parola akışının bozulmadığının teyidi.
- Kapı'nın DAV/ActiveSync yollarını dokunmadan geçirmesi.

Kaynak desenler: mailcow WebAuth (auth_request + master parola başlıkları), SOGo kurulum kılavuzu.
