#!/bin/bash
# Resco Mail Yonetim kurulumu — mailprovider.rescopos.com. Idempotent; SIR BASMAZ (parolalar yalniz .env'e yazilir).
set -euo pipefail

HEDEF=/var/www/vhosts/rescopos.com/mailprovider.rescopos.com
KLON="$HEDEF/rescomail"
ENVD="$KLON/yonetim/.env"

# 1) uygulama klonu (git-first: her sey GitHub'dan iner)
if [ ! -d "$KLON/.git" ]; then
  git clone -q https://github.com/bsaldir77-glitch/rescomail "$KLON"
else
  git -C "$KLON" pull -q
fi
echo "[ok] klon $(git -C "$KLON" rev-parse --short HEAD)"

# 2) bagimliliklar (Plesk node'u ile)
NODE_DIR=$(ls -d /opt/plesk/node/* 2>/dev/null | sort -V | tail -1)
export PATH="$NODE_DIR/bin:$PATH"
(cd "$KLON/yonetim" && npm install --omit=dev --no-audit --no-fund >/dev/null)
echo "[ok] bagimliliklar (node $(node -v))"

# 3-6) sirlar ve .env — YALNIZ .env yoksa uretilir; varsa hicbir sey degistirilmez
if [ -f "$ENVD" ]; then
  echo "[atla] .env mevcut — sir uretimi ve DB adimlari atlandi"
else
  PGPW=$(openssl rand -hex 16)
  sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='rescomail'" | grep -q 1 || \
    sudo -u postgres psql -qc "CREATE ROLE rescomail LOGIN"
  sudo -u postgres psql -qc "ALTER ROLE rescomail LOGIN PASSWORD '$PGPW'"
  sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='rescomail_db'" | grep -q 1 || \
    sudo -u postgres createdb -O rescomail rescomail_db
  echo "[ok] postgres (rescomail_db)"

  MYDB=$(grep -oE 'mysql://[^"]+' /etc/sogo/sogo.conf | sed -E 's#.*/([^/]+)/[^/]+$#\1#' | head -1)
  [ -n "$MYDB" ] || { echo "HATA: sogo.conf viewURL'den MySQL DB adi cikarilamadi"; exit 1; }
  MYPW=$(openssl rand -hex 16)
  plesk db "CREATE USER IF NOT EXISTS 'rescomail_ro'@'localhost' IDENTIFIED BY '$MYPW'" >/dev/null
  plesk db "ALTER USER 'rescomail_ro'@'localhost' IDENTIFIED BY '$MYPW'" >/dev/null
  plesk db "GRANT SELECT ON \`$MYDB\`.sogo_users_view TO 'rescomail_ro'@'localhost'" >/dev/null
  plesk db "FLUSH PRIVILEGES" >/dev/null
  echo "[ok] mysql salt-okuma ($MYDB)"

  APIKEY=$(plesk bin secret_key --create -ip-address 127.0.0.1 -description rescomail-yonetim | tail -1 | awk '{print $NF}')
  [ -n "$APIKEY" ] || { echo "HATA: Plesk API anahtari uretilemedi"; exit 1; }
  echo "[ok] plesk api anahtari uretildi"

  cat > "$ENVD" <<EOF
PORT=3000
OTURUM_SECRET=$(openssl rand -hex 32)
PG_HOST=127.0.0.1
PG_USER=rescomail
PG_PASS=$PGPW
PG_DB=rescomail_db
MYSQL_HOST=127.0.0.1
MYSQL_USER=rescomail_ro
MYSQL_PASS=$MYPW
MYSQL_DB=$MYDB
PLESK_API_KEY=$APIKEY
EOF
  echo "[ok] .env yazildi (sirlar YALNIZ sunucuda, repoya girmez)"
fi

# 7) sahiplik + izin
SAHIP=$(stat -c %U /var/www/vhosts/rescopos.com)
chown -R "$SAHIP:psacln" "$KLON"
chmod 600 "$ENVD"
echo "[ok] sahiplik: $SAHIP"

echo "TAMAM — simdi Plesk panelde Node.js ayari yapilacak (README'deki 3 tiklama), uygulama oyle baslar."
