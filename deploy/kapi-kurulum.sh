#!/bin/bash
# Resco Mail Kapi kurulumu. Kullanim: kapi-kurulum.sh [kapi-alan-adi]   (varsayilan: giris.saldir.tr)
# Idempotent, sir basmaz. Onkosul: Plesk'te alt alan adi + Node.js destegi acik olmali.
set -euo pipefail

# TEK KAPI: tum markalarin kullanicilari buradan girer (SSL: mevcut *.rescopos.com wildcard).
# SOGo ayni alan adina baglanir (vhost.conf) → giris de posta kutusu da TEK adreste, cerez host'a ozel.
KAPI_ALAN="${1:-eposta.rescopos.com}"
SOGO_HOST="${2:-webmail.rescopos.com}"          # herkesin posta kutusu bu adreste acilir
ANA_ALAN="${KAPI_ALAN#*.}"
# Kapi ile SOGo ayni host'ta ise cerez host'a ozel kalir; degilse ortak ust alan kullanilir
if [ "$SOGO_HOST" = "$KAPI_ALAN" ]; then CEREZ_ALAN=""; else CEREZ_ALAN=".${SOGO_HOST#*.}"; fi
# vhost dizinini Plesk'e sor (CLI ile acilan alt alanlarda 'siteN' olabilir), bulunmazsa varsayilani dene
HEDEF=$(plesk bin subdomain --info "${KAPI_ALAN%%.*}" -domain "$ANA_ALAN" 2>/dev/null \
        | sed -n 's/^--WWW-Root--:[[:space:]]*//p' | head -1)
[ -n "$HEDEF" ] || HEDEF="/var/www/vhosts/$ANA_ALAN/$KAPI_ALAN"
KLON="$HEDEF/rescomail"
ENVD="$KLON/kapi/.env"
PANEL_ENV="/var/www/vhosts/rescopos.com/mailprovider.rescopos.com/rescomail/yonetim/.env"

[ -d "$HEDEF" ] || { echo "HATA: $HEDEF yok — once Plesk'te '$KAPI_ALAN' alt alan adini olustur"; exit 1; }
[ -f "$PANEL_ENV" ] || { echo "HATA: yonetim paneli .env bulunamadi (once panel kurulmali)"; exit 1; }

git config --global --add safe.directory "$KLON" 2>/dev/null || true
if [ ! -d "$KLON/.git" ]; then
  git clone -q https://github.com/bsaldir77-glitch/rescomail "$KLON"
else
  git -C "$KLON" pull -q
fi
echo "[ok] klon $(git -C "$KLON" rev-parse --short HEAD)"

NODE_DIR=$(ls -d /opt/plesk/node/* 2>/dev/null | sort -V | tail -1)
export PATH="$NODE_DIR/bin:$PATH"
(cd "$KLON/kapi" && npm install --omit=dev --no-audit --no-fund >/dev/null)
echo "[ok] bagimliliklar"

# .env — panelin DB/kasa bilgilerini paylasir (ayni veritabani), sirlar yalniz sunucuda
if [ ! -f "$ENVD" ]; then
  umask 077
  { echo "PORT=3100";
    grep -E '^(PG_HOST|PG_USER|PG_PASS|PG_DB|BAGLANTI_KEY)=' "$PANEL_ENV";
    echo "SOGO_HOST=$SOGO_HOST";
    echo "CEREZ_ALAN=$CEREZ_ALAN";
    echo "KOPRU_YOL=/opt/rescomail/deploy/parola-koprusu.sh"; } > "$ENVD"
  echo "[ok] .env yazildi"
else
  echo "[atla] .env mevcut"
fi

# Kopru: root'a ait, vhost kullanicisi yalniz sudo ile CAGIRIR (degistiremez)
KOPRU=/opt/rescomail/deploy/parola-koprusu.sh
chown root:root "$KOPRU"; chmod 750 "$KOPRU"
SAHIP=$(stat -c %U "$HEDEF")
printf 'KAPI_ENV=%s\nSOGO_HOST=%s\n' "$ENVD" "$SOGO_HOST" > /etc/rescomail-kapi.conf
chown root:root /etc/rescomail-kapi.conf; chmod 640 /etc/rescomail-kapi.conf
printf '%s ALL=(root) NOPASSWD: %s\n' "$SAHIP" "$KOPRU" > /etc/sudoers.d/rescomail-kapi
chmod 440 /etc/sudoers.d/rescomail-kapi
visudo -cf /etc/sudoers.d/rescomail-kapi >/dev/null || { rm -f /etc/sudoers.d/rescomail-kapi; echo "HATA: sudoers gecersiz"; exit 1; }
echo "[ok] sudo koprusu ($SAHIP)"

# SOGo'yu ayni alan adina baglama (yalniz SOGO_HOST=KAPI_ALAN secildiginde; varsayilanda gerekmez)
SISTEM="/var/www/vhosts/system/$KAPI_ALAN/conf"
if [ "$SOGO_HOST" = "$KAPI_ALAN" ] && ! cmp -s "$KLON/deploy/eposta-vhost.conf" "$SISTEM/vhost.conf"; then
  mkdir -p "$SISTEM"
  cp "$KLON/deploy/eposta-vhost.conf" "$SISTEM/vhost.conf"
  plesk sbin httpdmng --reconfigure-domain "$KAPI_ALAN" >/dev/null 2>&1 || \
    { echo "HATA: Apache yeniden yapilandirilamadi"; exit 1; }
  echo "[ok] SOGo $KAPI_ALAN/SOGo adresine baglandi"
else
  echo "[bilgi] posta kutusu adresi: https://$SOGO_HOST/SOGo/ (vhost baglama gerekmiyor)"
fi

mkdir -p "$KLON/kapi/tmp" && touch "$KLON/kapi/tmp/restart.txt"
chown -R "$SAHIP:psacln" "$KLON"; chmod 600 "$ENVD"
echo "[ok] sahiplik: $SAHIP"
echo "TAMAM — Plesk'te Node.js ayari: AppRoot=$KLON/kapi · DocRoot=$KLON/kapi/public · Startup=app.js"
