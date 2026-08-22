#!/bin/bash
# ============================================================
# Tema onbellek kuralini Apache'ye kurar (Plesk'e dokunmadan).
# Kaynak: deploy/sogo-tema-onbellek.conf  ->  /etc/apache2/conf-available/
#
# RESTART/RELOAD YAPMAZ. Sonunda calistirilacak komutu basar; reload
# ayrica ve ONAYLA calistirilir (Bulent kurali).
#
# Root ile:  bash deploy/tema-onbellek-kurulum.sh
# ============================================================
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
KAYNAK="$REPO/deploy/sogo-tema-onbellek.conf"
AD="zzz-resco-mail-tema-onbellek.conf"
HEDEF="/etc/apache2/conf-available/$AD"

[ -f "$KAYNAK" ] || { echo "HATA: $KAYNAK yok"; exit 1; }

cp "$KAYNAK" "$HEDEF"
echo "[ok] $HEDEF yazildi"

if [ ! -L "/etc/apache2/conf-enabled/$AD" ]; then
  ln -s "../conf-available/$AD" "/etc/apache2/conf-enabled/$AD"
  echo "[ok] etkinlestirildi (conf-enabled)"
else
  echo "[atla] zaten etkin"
fi

echo "-- yapilandirma sinamasi --"
apache2ctl configtest

echo
echo "Kurulum hazir. Devreye almak icin (ONAYLA calistirilir):"
echo "    systemctl reload apache2"
echo
echo "Sonra dogrulama:"
echo "    curl -sI https://webmail.rescotelecom.com/SOGo.woa/WebServerResources/js/theme.js | grep -i cache-control"
