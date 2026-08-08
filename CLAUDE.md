# CLAUDE.md — rescomail (Resco Mail)

**Resco Mail**, SOGo üzerine kurulan white-label webmail markasıdır. Hedef: `webmail.<domain>` adresleri açıldığında kullanıcı SOGo değil **Resco Mail** görür — Yahoo Mail'den ilhamla mor tema, Resco Mail logosu, "Resco Mail" sekme başlığı. SOGo çekirdeğine dokunulmaz; bu repo yalnız **tema + marka katmanı ve onun deploy akışıdır**.

## 1. ASLA YAPMA (rescopos disiplini aynen geçerli)

- **GİT ATLANARAK PROD'A DOSYA KOYMA — MUTLAK YASAK.** Her dosya önce bu repoda → GitHub push → prod'a yalnız git akışıyla iner. Lokal = GitHub = prod DAİMA eşit. SSH ile prod'da elle dosya oluşturma/düzenleme KESİNLİKLE YASAK.
- **SSH yalnız teşhis (salt-okuma).** Erişim yolu rescopos ile aynı sunucu/aynı yöntem (plink, 195.244.34.179:41588; parola Bülent'ten istenir, saklanmaz).
- **`sogo` servisinin restart'ı Claude tarafından ASLA kendiliğinden çalıştırılmaz** — yalnız Bülent onayıyla. Push da AskUserQuestion onayıyla yapılır.
- **Yahoo'nun logosu, adı, marka kimliği KULLANILMAZ.** Yahoo'dan yalnız renk/his alınır; marka = Resco Mail. (Marka taklidi hem hukuki sorun hem "sahte sayfa" algısı.)
- **SOGo paket dosyaları prod'da elle yamalanmaz.** Özelleştirme bu repoda yaşar; prod'a uygulanışı tekrarlanabilir olmalı — paket güncellemesi `WebServerResources`'ı EZER, tema her güncellemeden sonra yeniden uygulanabilir olmalı.
- **rescopos reposuna/koduna bu projeden dokunulmaz.** Aynı sunucu ama ayrı proje.
- Çoktan seçmeli / gereksiz soru yok — tek net soru.

## 2. Prod gerçeği (2026-08-07 salt-okuma keşfi)

- Sunucu: **rescopos prod ile AYNI makine** — Ubuntu 24.04 + Plesk, `server.serviceprovider.com.tr`.
- **SOGo 5.12.9.20260618-1** (nightly paket), servis adı **`sogo`** (LSB init script; `sogod` değil), dinleme: `127.0.0.1:20000`.
- Webmail vhost'ları: `/etc/apache2/plesk.conf.d/webmails/*.conf` — **11 domain'den yalnız 2'si SOGo'ya proxy'li** (`rescopos.com`, `pozitifkurumsal.com.tr`): `ProxyPass /SOGo http://127.0.0.1:20000/SOGo` + caldav/carddav well-known rewrite'ları. Kalan 9 domain Plesk Roundcube'da (`plesk-roundcube 1.6.17` kurulu).
- SOGo'lu conf'lar **elle düzenlenmiş** (`.bak` kopyaları duruyor) → **RİSK: Plesk bu conf'ları yeniden üretirse (webmail ayarı değişimi/repair) elle eklenen SOGo proxy'si silinir.** Kalıcı çözüm araştırılacak (Plesk custom template / panel.ini).
- Tema dosyaları **paket varsayılanında, hiç dokunulmamış** (18 Haziran paket tarihli):
  `/usr/lib/GNUstep/SOGo/WebServerResources/js/theme.js` (2.2K) · `css/theme-default.css` (440K, üretilmiş) · `img/sogo-full.svg`.
- `/etc/sogo/sogo.conf`: IMAP/SMTP/sieve/memcached + SQL `SOGoUserSources` (çok domain, `DomainFieldName`). **Hiçbir UI parametresi tanımlı değil** (`SOGoPageTitle`, `SOGoUIxDebugEnabled`, `SOGoUIAdditionalJSFiles` yok → hepsi default).

## 3. Hedef görünüm

- **Renk (Yahoo ilhamı):** primary mor `#6001d2`, accent mavi `#0f69ff`, açık/beyaz zemin.
- **Logo:** `sogo-full.svg` yerine Resco Mail SVG — **logoyu Bülent verecek**; + favicon.
- **Başlık:** `SOGoPageTitle = "Resco Mail";` (yalnız `SOGoUIxDebugEnabled = NO` iken etkili — SOGo bilinen davranışı).

## 4. Yöntem — SOGo'nun resmî tema yolu (fork yok)

Kaynak: https://www.sogo.nu/support/faq/how-to-change-the-color-theme.html
1. `theme.js` (Angular Material `definePalette` + `primaryPalette/accentPalette`) bu repoda yazılır.
2. `sogo.conf`'a `SOGoUIAdditionalJSFiles = (js/theme.js);` eklenir.
3. CSS üretimi: `SOGoUIxDebugEnabled = YES` geçici açılır → tarayıcı konsolundan tema CSS'i üretilir → `css/theme-default.css` olarak repoya alınır → debug kapatılır.
4. Prod'a uygulama + `sogo` restart (yalnız onayla).
5. Doğrulama: iki SOGo'lu domain'de gözle + `curl` ile tema/logo/başlık kontrolü. "Yapıldı" doğrulanmadan denmez.

**Bilinen sınır — URL öneki:** `/SOGo/so/...` yolu uygulamaya gömülüdür (SOPE uygulama adı); `webmail.domain.com/resco/mail` gibi yeniden adlandırmanın resmî desteği YOK (bilinen SOGo sınırı). Proxy/gövde-yeniden-yazma (mod_substitute) hileleri SOGo'nun JS'te ürettiği URL'lerle kırılır ve her güncellemede bozulma riski taşır → önerimiz kozmetik bu iş için risk alınMAması; kullanıcıya verilen adres daima `webmail.domain.com` (kök zaten SOGo'ya yönlenir), adres çubuğunda `/SOGo` görünmesi kabul edilir.

## 5. Kararlar ve açık sorular

- **KARAR + YAPILDI (2026-08-07): TÜM domainler SOGo/Resco Mail kullanıyor.** Geçişi Bülent kendisi yaptı; canlı test (curl, aynı gün): **11/11 domain `webmail.*` → `/SOGo/` 200 dönüyor.** DİKKAT: conf'lar elle yönetiliyor → **Plesk yeniden-üretme riski artık 11 domain'in tamamı için geçerli** — kalıcılık çözümü (şablon + tekrar-uygula script'i) hâlâ açık iş.
- **Prod'a iniş yolu:** bu repo prod'da nereye klonlanacak; uygulama (`deploy/apply.sh`: dosyaları yerine kopyalar) elle onaylı mı, rescopos'taki gibi Actions ile mi?
- Plesk conf ezme riskine kalıcı çözüm (custom template vs her seferinde yeniden uygulama).
- **Faz önerisi — SMS-OTP parolasız giriş (Bülent vizyonu, 2026-08-09):** e-posta adresi + telefona 6 haneli kod, şifre hiç girilmez/dolaşmaz. SOGo'da yerleşik YOK (yerleşik olan yalnız TOTP-uygulama 2FA). Kurulabilir yol: önde OTP portalı (NetGSM, rescopos api-hub deseni) + `SOGoTrustProxyAuthentication` + IMAP master-user — ciddi güvenlik mühendisliği ister (trust başlığı sızarsa tüm kutular açılır); tasarım dokümanı yazılıp onaylanmadan BAŞLANMAZ.
- memcached kurulu değil (SOGo onsuz çalışıyor, log hata spam'ı + performans kaybı) — kurulum Bülent'in (prod güncelleme politikası); kurulunca `SOGoMemcachedHost` conf'ta hazır.

## 6. Depo düzeni (öneri — onaylanınca oluşturulur)

```
theme/theme.js              # Yahoo-mor palet (elle yazılır)
theme/theme-default.css     # üretilmiş CSS (adım 4.3 çıktısı)
branding/sogo-full.svg      # Resco Mail logosu (Bülent'ten)
branding/favicon.ico
conf/sogo.conf.md           # sogo.conf'a eklenecek satırlar (dokümante; sogo.conf'un kendisi GİZLİ — repoya girmez, creds içerir)
deploy/apply.sh             # repo → /usr/lib/GNUstep/SOGo/... kopyalama (idempotent)
```

## 7. Konvansiyon

- Commit: `tip(kapsam): açıklama` Türkçe (`feat(theme):`, `docs(proje):`) — rescopos ile aynı.
- Gizli veri (sogo.conf kopyası, parola, `.pem`) repoya ASLA girmez.
