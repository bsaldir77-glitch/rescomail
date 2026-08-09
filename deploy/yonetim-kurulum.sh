#!/bin/bash
# Resco Mail Yonetim kurulumu — mailprovider.rescopos.com. Idempotent; SIR BASMAZ (parolalar yalniz .env'e yazilir).
set -euo pipefail

HEDEF=/var/www/vhosts/rescopos.com/mailprovider.rescopos.com
KLON="$HEDEF/rescomail"
ENVD="$KLON/yonetim/.env"

# 0) klon vhost kullanicisina chown'lu — root'un git'i icin guvenli dizin istisnasi
git config --global --add safe.directory "$KLON" 2>/dev/null || true

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
  # PG erisimi Plesk uzerinden (bu sunucuda postgres peer-auth kapali; Plesk PG'yi yonetiyor)
  PGPW=$(openssl rand -hex 16)
  plesk bin database --create rescomail_db -domain rescopos.com -type postgresql -server localhost:5432 >/dev/null 2>&1 || true
  plesk bin database --create-dbuser rescomail -passwd "$PGPW" -database rescomail_db -domain rescopos.com -type postgresql -server localhost:5432 >/dev/null 2>&1 || \
    plesk bin database --update-dbuser rescomail -passwd "$PGPW" -database rescomail_db -domain rescopos.com -type postgresql -server localhost:5432 >/dev/null
  PGPASSWORD="$PGPW" psql -h 127.0.0.1 -U rescomail -d rescomail_db -tAc 'SELECT 1' | grep -q 1 || { echo "HATA: PG baglanti dogrulamasi basarisiz"; exit 1; }
  echo "[ok] postgres (rescomail_db, Plesk uzerinden)"

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

# 6b) baglanti kasasi anahtari — .env'e yoksa ekle (mevcut kuruluma sonradan eklendi)
grep -q '^BAGLANTI_KEY=' "$ENVD" 2>/dev/null || \
  { echo "BAGLANTI_KEY=$(openssl rand -hex 32)" >> "$ENVD"; echo "[ok] BAGLANTI_KEY eklendi"; }

# 6c) Passenger oto-yenileme (Bulent onayi 2026-08-09): kod guncellendi, bir sonraki istekte taze baslar
mkdir -p "$KLON/yonetim/tmp"
touch "$KLON/yonetim/tmp/restart.txt"
echo "[ok] uygulama yenileme bayragi birakildi"

# 6d) Kapi parola koprusu — panel surecine parola VERMEZ, yalniz SOGo oturum cerezi doner
KOPRU=/opt/rescomail/deploy/parola-koprusu.sh
if [ -f "$KOPRU" ]; then
  chown root:root "$KOPRU"; chmod 750 "$KOPRU"
  printf 'KAPI_ENV=%s\nSOGO_HOST=%s\n' "$ENVD" "${SOGO_HOST:-webmail.rescopos.com}" > /etc/rescomail-kapi.conf
  chown root:root /etc/rescomail-kapi.conf; chmod 640 /etc/rescomail-kapi.conf
  PANEL_SAHIP=$(stat -c %U "$HEDEF")
  printf '%s ALL=(root) NOPASSWD: %s\n' "$PANEL_SAHIP" "$KOPRU" > /etc/sudoers.d/rescomail-kapi
  chmod 440 /etc/sudoers.d/rescomail-kapi
  visudo -cf /etc/sudoers.d/rescomail-kapi >/dev/null || { rm -f /etc/sudoers.d/rescomail-kapi; echo "HATA: sudoers gecersiz"; exit 1; }
  echo "[ok] kapi koprusu ($PANEL_SAHIP)"
fi

# 7) sahiplik + izin
SAHIP=$(stat -c %U /var/www/vhosts/rescopos.com)
chown -R "$SAHIP:psacln" "$KLON"
chmod 600 "$ENVD"
echo "[ok] sahiplik: $SAHIP"

echo "TAMAM — simdi Plesk panelde Node.js ayari yapilacak (README'deki 3 tiklama), uygulama oyle baslar."
