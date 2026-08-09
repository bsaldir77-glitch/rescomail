# Resco Mail Kapı — V2 (webmail'e e-posta + SMS OTP ile parolasız giriş)

Hedef (Bülent, 2026-08-09): **e-posta yaz → [Kod Gönder] → telefona 6 haneli kod → giriş.** Parola yok.

## 1. Mimari — kanıta dayalı (2026-08-09 sunucu doğrulamaları)

İlk taslak SOGo'nun `SOGoTrustProxyAuthentication` + Dovecot master-user yolunu öneriyordu. Sunucuda iki şey doğrulanınca **çok daha basit ve güvenli** bir yol açıldı:

1. Plesk posta parolalarını **`sym`** (geri döndürülebilir) saklıyor; `plesk sbin mail_auth_view` (0750 root:root) düz metin verir.
2. `POST /SOGo/connect` doğru kimlikle **200 + `0xHIGHFLYxSOGo` oturum çerezi** döndürüyor (test edildi).

Seçilen akış — **Kapı yalnız giriş anında devrede, veri yolunda DEĞİL:**

```
tarayıcı → Kapı (giris.<domain>)         : e-posta + OTP
Kapı → sudo → parola-koprusu.sh (root)  : parola Kapı'ya HİÇ verilmez
kopru → SOGo /connect (yerel)           : oturum çerezini alır
Kapı → tarayıcı                         : çerezi Domain=.<domain> ile devreder → /SOGo/'ya yönlendirir
tarayıcı ⇄ SOGo                          : bundan sonrası doğrudan (Kapı aradan çıkar)
```

**Kazanç:** `sogo.conf` değişmez, **SOGo restart'ı gerekmez**, trust-başlığı yok (yani header sahteciliğiyle "herkes olarak giriş" riski hiç doğmaz), posta trafiği Node'dan geçmez, kalan domainler hiç etkilenmez.

## 2. Güvenlik hattı

- **Parola Kapı sürecine girmez** — köprü root'tadır, dışarı yalnız oturum çerezi verir.
- Köprü üç kapı: (1) e-posta regex, (2) **hesap `otp_ayarlari.sms_giris_acik=true` olmalı** (yarıçap yalnız gönüllü hesaplar), (3) `.env` yolu root'a ait `/etc/rescomail-kapi.conf`'tan gelir — çağıran süreç seçemez.
- Köprü `root:root 0750`; vhost kullanıcısı yalnız **tek komuta** sudo hakkına sahip (değiştiremez).
- OTP: 6 hane, 5 dk, 5 yanlış deneme = kilit, 60 sn yeniden-gönderim freni, IP başına 8 istek/15 dk. Kodlar SHA-256 hash'li, tek kullanımlık.
- Her olay `kapi_giris_kayitlari`'na yazılır (kod gönderimi, giriş, köprü hatası, kilit).
- **Kimse dışarıda kalmaz:** SMS girişi kapalı hesap "parolamla giriş" bağlantısıyla klasik SOGo'ya düşer.
- **Geri dönüş:** Kapı'yı durdurmak yeterli — webmail adresleri hiç değişmediği için mevcut giriş aynen çalışmaya devam eder.

## 3. Kurulum

- `kapi/` (Node/Express) Plesk alt alan adında Passenger ile çalışır — panelle aynı desen.
- **Pilot: `giris.saldir.tr`** (Bülent Plesk'te açar, Node.js aktif) → `deploy/kapi-kurulum.sh` (idempotent; .env'i panelin DB/kasa bilgilerinden türetir, sudo köprüsünü ve root yapılandırmasını kurar).
- Panel bağı: OTP Ayarları'ndaki telefon + "SMS ile giriş" anahtarı doğrudan bu akışı yönetir (aynı tablo).
- Yayılım: her marka için bir `giris.<domain>` alt alan adı; aynı script alan adı parametresiyle çalışır.

## 4. Doğrulanacak tek risk (pilotun go/no-go testi)

SOGo oturumu, girişin yapıldığı **IP/oturum bağlamına** bağlıysa köprüden alınan çerez tarayıcıda geçersiz olabilir. Bu, canlı testte hemen görülür: kod doğru girildiği hâlde SOGo login ekranına düşülüyorsa bu maddedir → çözüm sırası: (a) SOGo'nun oturum-IP ayarını gevşetmek, (b) ilk taslaktaki trust-proxy yoluna dönmek. Pilot bu yüzden tek domainde.

## 5. Kalan işler

- Kapı'nın kendi girişinde "beni hatırla" (SOGo'nun kendi oturum süresi kullanılıyor — şimdilik ek yok).
- Telefon uygulamaları (IMAP/DAV/EAS) parola ile çalışmaya devam eder — parolasızlık yalnız webmail arayüzü içindir.
