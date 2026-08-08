#!/bin/bash
# Resco Mail tema/marka uygulayici — kaynak: bu repo (git'ten gelir), hedef: SOGo kurulumu.
# Idempotent: her hedefin orijinali ILK calistirmada <dosya>.bak_orig olarak saklanir.
# Restart YAPMAZ — restart ayri onayla calistirilir: systemctl restart sogo
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WR=/usr/lib/GNUstep/SOGo/WebServerResources
CONF=/etc/sogo/sogo.conf

keep_orig() { if [ -f "$1" ] && [ ! -f "$1.bak_orig" ]; then cp -p "$1" "$1.bak_orig"; fi; }

# 1) Tema paleti
keep_orig "$WR/js/theme.js"
cp "$REPO/theme/theme.js" "$WR/js/theme.js"
echo "[ok] theme.js"

# 2) Logo (login + ust bar)
keep_orig "$WR/img/sogo-full.svg"
cp "$REPO/branding/resco-mail-logo.svg" "$WR/img/sogo-full.svg"
echo "[ok] sogo-full.svg"

# 3) Uretilmis tema CSS'i (Faz 4'te repoya girer; yoksa atlanir)
if [ -f "$REPO/theme/theme-default.css" ]; then
  keep_orig "$WR/css/theme-default.css"
  cp "$REPO/theme/theme-default.css" "$WR/css/theme-default.css"
  echo "[ok] theme-default.css"
else
  echo "[atla] theme-default.css repo'da yok (Faz 4'te gelecek)"
fi

# 4) sogo.conf satirlari — yalniz yoksa eklenir, varsa dokunulmaz
keep_orig "$CONF"
if ! grep -q 'SOGoPageTitle' "$CONF"; then
  sed -i '0,/{/s//{\n  SOGoPageTitle = "Resco Mail";/' "$CONF"
  echo "[ok] SOGoPageTitle eklendi"
fi
if ! grep -q 'SOGoUIAdditionalJSFiles' "$CONF"; then
  sed -i '0,/{/s//{\n  SOGoUIAdditionalJSFiles = (js\/theme.js);/' "$CONF"
  echo "[ok] SOGoUIAdditionalJSFiles eklendi"
fi

# 5) Varsayilan dil: Turkce (kullanicilarin kendi dil tercihi ezilmez, yalniz varsayilan degisir)
if grep -q 'SOGoLanguage' "$CONF"; then
  sed -i 's/SOGoLanguage *= *[A-Za-z]*;/SOGoLanguage = TurkishTurkey;/' "$CONF"
else
  sed -i '0,/{/s//{\n  SOGoLanguage = TurkishTurkey;/' "$CONF"
fi
echo "[ok] SOGoLanguage = TurkishTurkey"

echo "TAMAM — degisiklikler restart'a kadar gorunmez. Restart ayri onayla."
