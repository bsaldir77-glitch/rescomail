#!/bin/bash
# Resco Mail Kapi kurulumu. Kullanim: kapi-kurulum.sh [kapi-alan-adi]   (varsayilan: giris.saldir.tr)
# Idempotent, sir basmaz. Onkosul: Plesk'te alt alan adi + Node.js destegi acik olmali.
set -euo pipefail

KAPI_ALAN="${1:-giris.saldir.tr}"
ANA_ALAN="${KAPI_ALAN#*.}"
HEDEF="/var/www/vhosts/$ANA_ALAN/$KAPI_ALAN"
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
    echo "KOPRU_YOL=/opt/rescomail/deploy/parola-koprusu.sh"; } > "$ENVD"
  echo "[ok] .env yazildi"
else
  echo "[atla] .env mevcut"
fi

# Kopru: root'a ait, vhost kullanicisi yalniz sudo ile CAGIRIR (degistiremez)
KOPRU=/opt/rescomail/deploy/parola-koprusu.sh
chown root:root "$KOPRU"; chmod 750 "$KOPRU"
SAHIP=$(stat -c %U "$HEDEF")
printf 'KAPI_ENV=%s\n' "$ENVD" > /etc/rescomail-kapi.conf
chown root:root /etc/rescomail-kapi.conf; chmod 640 /etc/rescomail-kapi.conf
printf '%s ALL=(root) NOPASSWD: %s\n' "$SAHIP" "$KOPRU" > /etc/sudoers.d/rescomail-kapi
chmod 440 /etc/sudoers.d/rescomail-kapi
visudo -cf /etc/sudoers.d/rescomail-kapi >/dev/null || { rm -f /etc/sudoers.d/rescomail-kapi; echo "HATA: sudoers gecersiz"; exit 1; }
echo "[ok] sudo koprusu ($SAHIP)"

mkdir -p "$KLON/kapi/tmp" && touch "$KLON/kapi/tmp/restart.txt"
chown -R "$SAHIP:psacln" "$KLON"; chmod 600 "$ENVD"
echo "[ok] sahiplik: $SAHIP"
echo "TAMAM — Plesk'te Node.js ayari: AppRoot=$KLON/kapi · DocRoot=$KLON/kapi/public · Startup=app.js"
