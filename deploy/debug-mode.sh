#!/bin/bash
# SOGoUIxDebugEnabled ac/kapa — CSS uretimi (Faz 3-4) icin gecici kullanilir.
# Kullanim: debug-mode.sh YES | NO   (restart ayri onayla)
set -euo pipefail
CONF=/etc/sogo/sogo.conf
MODE="${1:?Kullanim: debug-mode.sh YES|NO}"
if grep -q 'SOGoUIxDebugEnabled' "$CONF"; then
  sed -i "s/SOGoUIxDebugEnabled *= *[A-Za-z]*/SOGoUIxDebugEnabled = $MODE/" "$CONF"
else
  sed -i "0,/{/s//{\n  SOGoUIxDebugEnabled = $MODE;/" "$CONF"
fi
grep 'SOGoUIxDebugEnabled' "$CONF"
