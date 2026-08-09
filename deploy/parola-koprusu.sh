#!/bin/bash
# Resco Mail Kapi — parola koprusu (ROOT). Kapi surecine PAROLA VERMEZ; yalniz SOGo oturum cerezini doner.
# Cagri: sudo /opt/rescomail/deploy/parola-koprusu.sh <eposta>   (sudoers ile tek komuta izin verilir)
# Guvenlik: (1) eposta regex dogrulanir  (2) hesap DB'de sms_giris_acik OLMALI  (3) cikti yalniz cerez.
set -euo pipefail
umask 077

EPOSTA="${1:-}"
hata() { echo "{\"hata\":\"$1\"}"; exit 1; }

# .env yolu ROOT'a ait yapilandirmadan gelir — cagiran surec belirleyemez
[ -f /etc/rescomail-kapi.conf ] || hata "kopru yapilandirmasi yok"
# shellcheck disable=SC1091
. /etc/rescomail-kapi.conf
ENVD="${KAPI_ENV:-}"

[[ "$EPOSTA" =~ ^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$ ]] || hata "gecersiz adres"
[ -n "$ENVD" ] && [ -f "$ENVD" ] || hata "kapi .env bulunamadi"
# shellcheck disable=SC1090
set -a; . "$ENVD"; set +a

IZIN=$(PGPASSWORD="$PG_PASS" psql -h "${PG_HOST:-127.0.0.1}" -U "$PG_USER" -d "$PG_DB" -tAc \
  "SELECT 1 FROM otp_ayarlari WHERE eposta='$EPOSTA' AND sms_giris_acik" 2>/dev/null || true)
[ "$IZIN" = "1" ] || hata "bu hesapta SMS girisi acik degil"

PAROLA=$(plesk sbin mail_auth_view 2>/dev/null | awk -F'|' -v e="$EPOSTA" '
  { gsub(/^[ \t]+|[ \t]+$/, "", $2); gsub(/^[ \t]+|[ \t]+$/, "", $4);
    if ($2 == e) { print $4; exit } }')
[ -n "$PAROLA" ] || hata "hesap bulunamadi"

DOMAIN="${EPOSTA#*@}"
GOVDE=$(EP="$EPOSTA" PW="$PAROLA" python3 -c \
  'import json,os; print(json.dumps({"userName":os.environ["EP"],"password":os.environ["PW"]}))')

YANIT=$(curl -sk -i -m 20 -X POST -H 'Content-Type: application/json' \
  --data-binary "$GOVDE" "https://webmail.$DOMAIN/SOGo/connect" || true)

echo "$YANIT" | grep -qi '^HTTP/[0-9.]* 200' || hata "SOGo girisi reddetti"
CEREZLER=$(echo "$YANIT" | grep -i '^set-cookie:' | sed -E 's/^[Ss]et-[Cc]ookie:[[:space:]]*//' | tr -d '\r')
[ -n "$CEREZLER" ] || hata "SOGo cerez dondurmedi"

CEREZLER="$CEREZLER" DOMAIN="$DOMAIN" python3 -c '
import json, os
print(json.dumps({
  "cerezler": [c for c in os.environ["CEREZLER"].split("\n") if c.strip()],
  "hedef": "https://webmail.%s/SOGo/" % os.environ["DOMAIN"]
}))'
