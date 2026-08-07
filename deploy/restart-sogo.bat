@echo off
rem Resco Mail — SOGo servis restart (parola sorar, kaydetmez)
"C:\Program Files\PuTTY\plink.exe" -ssh -P 41588 root@195.244.34.179 "systemctl restart sogo && sleep 3 && systemctl is-active sogo"
echo.
echo Yukarida "active" yaziyorsa restart BASARILI.
pause
