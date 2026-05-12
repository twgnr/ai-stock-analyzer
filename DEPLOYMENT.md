# Deployment-Leitfaden

Dieses Dokument beschreibt, wie du AI Stock Analyzer auf einem eigenen Server mit HTTPS/TLS betreiben kannst.

## Voraussetzungen

- Linux-Server (Ubuntu 22.04+ empfohlen)
- Öffentliche Domain (z.B. `stock.example.de`), die auf die Server-IP zeigt
- Ports 80 und 443 erreichbar
- Node.js 20+ und MongoDB 6+ installiert
- Ein SMTP-Account für Mail-Versand (Gmail, SendGrid, Resend, Postmark, o.Ä.)

## 1. App bauen und als Service laufen lassen

Zwei gleichwertige Varianten: **systemd** (Ubuntu-Standard, kein Extra-Tool nötig) oder **PM2** (Node-Ökosystem, bequem wenn auf dem Server sowieso schon andere Node-Apps laufen).

### Option A: systemd

```bash
cd /opt/ai-stock-analyzer
npm ci
npm run build

# /etc/systemd/system/ai-stock-analyzer.service
[Unit]
Description=AI Stock Analyzer Next.js App
After=network.target mongodb.service

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/ai-stock-analyzer
Environment=NODE_ENV=production
EnvironmentFile=/opt/ai-stock-analyzer/.env.local
# Port wird aus der PORT-Umgebungsvariable in .env.local übernommen.
# Alternativ hart verdrahten: ExecStart=/usr/bin/npm start -- -p 3100
ExecStart=/usr/bin/npm start
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now ai-stock-analyzer
```

Die App läuft dann standardmäßig auf `http://127.0.0.1:3000` — nicht direkt aus dem Internet erreichbar. TLS übernimmt der Reverse-Proxy davor.

### Option B: PM2

Wenn du auf dem Server schon PM2 für andere Node-Apps nutzt, ist das die bequemere Variante.

```bash
# PM2 global installieren (falls noch nicht vorhanden)
sudo npm install -g pm2

# App bauen (einmal pro Update)
cd /opt/ai-stock-analyzer
npm ci
npm run build

# Die Config-Datei ecosystem.config.js liegt bereits im Repo.
# Sie startet `npm start`, setzt NODE_ENV=production und liest .env.local
# beim Next-Boot selbst ein.

pm2 start ecosystem.config.js
pm2 save                    # aktuellen Prozess-Status persistieren
pm2 startup                 # gibt einen Befehl aus — den ausführen, damit
                            # PM2 nach Reboot von systemd gestartet wird
```

**Bedienung:**

```bash
pm2 status                      # läuft die App?
pm2 logs ai-stock-analyzer         # Live-Logs
pm2 logs ai-stock-analyzer --lines 200
pm2 reload ai-stock-analyzer       # Zero-Downtime-Reload (nach Code-Update)
pm2 restart ai-stock-analyzer      # Hard-Restart (bei Env-Änderungen)
pm2 stop ai-stock-analyzer
pm2 delete ai-stock-analyzer       # aus PM2 entfernen
```

**User**: PM2 sollte nicht als `root` laufen. Leg einen dedizierten User an (z.B. `www-data` oder `nodeapp`), und führe `pm2 start`, `pm2 save`, `pm2 startup` als dieser User aus. `pm2 startup` gibt dann einen `sudo env PATH=...` aus, den du einmalig als root ausführst.

**Update-Flow mit PM2**:

```bash
cd /opt/ai-stock-analyzer
git pull
npm ci
npm run build
pm2 reload ai-stock-analyzer       # zero-downtime
```

### Anderen Port verwenden (z.B. wenn 3000 belegt ist)

**Wichtig — Next-Eigenart:** `PORT` **muss als echte Prozess-Umgebungsvariable** gesetzt werden. Next.js liest den Port beim CLI-Boot (bevor `.env.local` geladen wird), deshalb reicht ein Eintrag in `.env.local` **nicht** aus — der HTTP-Listener versucht sich trotzdem auf 3000 zu binden. Alle anderen Werte (`MONGODB_URI`, `JWT_SECRET`, `APP_SECRET_KEY`, `SMTP_*`, `APP_URL`) können in `.env.local` bleiben.

**Systemd**: in der Unit-Datei eine `Environment=PORT=3100`-Zeile ergänzen und `systemctl daemon-reload && systemctl restart ai-stock-analyzer`.

**PM2**: in `ecosystem.config.js` im `env`-Block `PORT: "3100"` eintragen (ist als Default bereits drin). Dann zwingend mit `--update-env` neu laden, sonst nutzt PM2 die gecachte alte ENV:

```bash
pm2 reload ai-stock-analyzer --update-env
```

**Reverse-Proxy** (Nginx/Caddy) muss auf denselben Port zeigen:

```nginx
proxy_pass http://127.0.0.1:3100;
```

```
reverse_proxy 127.0.0.1:3100
```

**Kontrolle**, dass der richtige Port läuft:

```bash
ss -tlnp | grep 3100
pm2 logs ai-stock-analyzer --lines 20   # muss "http://localhost:3100" zeigen
```

## 2. `.env.local` für Produktion

```bash
# === Datenbank ===
MONGODB_URI=mongodb://127.0.0.1:27017/ai-stock-analyzer

# === Session-Signatur ===
# MUSS gesetzt sein — ohne diesen Wert startet die App in Production nicht.
# Min. 32 Zeichen zufällig:
#   openssl rand -hex 32
JWT_SECRET=<langer-zufallsstring>

# === Verschlüsselung der API-Keys at rest ===
# Zwingend in Production. User- und Admin-KI-Keys (Claude, Gemini, OpenAI,
# Finnhub) werden damit AES-256-GCM verschlüsselt in MongoDB abgelegt.
# Wird dieser Wert später geändert, sind alle gespeicherten Keys unbrauchbar
# und müssen von den Usern neu hinterlegt werden.
#   openssl rand -hex 32
APP_SECRET_KEY=<langer-zufallsstring-32-byte-hex>

# === Öffentliche URL der App ===
# Wird in Reset-Mails, Verify-Mails und Notification-Mails verwendet.
APP_URL=https://stock.example.de

# === SMTP für Registrierungs-/Reset-/Digest-Mails ===
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=deine-adresse@gmail.com
SMTP_PASS=app-password-16-stellig
SMTP_FROM=deine-adresse@gmail.com

# === Node-Runtime ===
NODE_ENV=production

# === Port (optional) ===
# Standard ist 3000. Setzen, falls auf dem Server bereits ein anderer Dienst
# auf 3000 läuft. Der Reverse-Proxy muss dann auf denselben Port zeigen.
# PORT=3100
```

**Wichtig:**
- `JWT_SECRET` und `APP_SECRET_KEY` werden beide geprüft — Production-Boot bricht ab, wenn sie fehlen.
- Beide Werte an einem sicheren Ort (Password-Manager, Vault) aufbewahren. Ein Backup der DB ohne `APP_SECRET_KEY` ist für KI-Key-Recovery wertlos.
- KI-Konfiguration (Provider, Modell, Keys) wird nicht mehr über ENV gesteuert, sondern pro User unter `/settings` bzw. pro Installation unter `/admin`.

## 3. TLS / HTTPS — Option A: Caddy (empfohlen, automatisches Let's Encrypt)

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy
```

`/etc/caddy/Caddyfile`:

```
stock.example.de {
    encode gzip
    reverse_proxy 127.0.0.1:3000

    # Die App setzt eigene Security-Header in der Next-Proxy-Datei —
    # doppelte Header per Reverse-Proxy vermeiden, nur HSTS hier
    # (Caddy kann es über TLS-Kontext sinnvoller setzen):
    header {
        Strict-Transport-Security "max-age=63072000; includeSubDomains; preload"
    }
}
```

```bash
sudo systemctl reload caddy
```

Caddy holt sich automatisch ein Let's-Encrypt-Zertifikat und erneuert es alle 60 Tage. **Keine weitere Konfiguration nötig.**

## 4. TLS / HTTPS — Option B: Nginx + certbot

```bash
sudo apt install -y nginx certbot python3-certbot-nginx
```

`/etc/nginx/sites-available/ai-stock-analyzer`:

```nginx
server {
    listen 80;
    server_name stock.example.de;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name stock.example.de;

    # certbot fügt die ssl_certificate-Zeilen automatisch ein
    # ssl_certificate /etc/letsencrypt/live/stock.example.de/fullchain.pem;
    # ssl_certificate_key /etc/letsencrypt/live/stock.example.de/privkey.pem;

    # HSTS wird hier gesetzt, alle anderen Security-Header (CSP,
    # X-Frame-Options, X-Content-Type-Options, Referrer-Policy, COOP,
    # Permissions-Policy) setzt die Next-Proxy-Datei selbst.
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;

    gzip on;
    gzip_types text/css application/javascript application/json;

    # Magazin-PDFs können bis 32 MB groß werden; die KI-Analyse braucht
    # 30-120 s. Defaults (1M / 60s) führen zu 413 bzw. 504.
    client_max_body_size 35M;
    proxy_read_timeout 180s;
    proxy_send_timeout 180s;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/ai-stock-analyzer /etc/nginx/sites-enabled/
sudo certbot --nginx -d stock.example.de
sudo systemctl reload nginx
```

Certbot trägt die SSL-Zertifikate automatisch ein und richtet Cron-Renewal ein.

## 5. MongoDB absichern

Standardmäßig lauscht MongoDB nur auf `127.0.0.1`. Gut so — die App läuft auf demselben Host. Für Multi-Host-Setups `bindIp` und Auth aktivieren:

```yaml
# /etc/mongod.conf
security:
  authorization: enabled
net:
  bindIp: 127.0.0.1
```

Dann einen Admin-User anlegen:

```bash
mongosh
> use admin
> db.createUser({ user: "admin", pwd: "...", roles: ["root"] })
> use ai-stock-analyzer
> db.createUser({ user: "stockapp", pwd: "...", roles: [{ role: "readWrite", db: "ai-stock-analyzer" }] })
```

`.env.local` anpassen:

```
MONGODB_URI=mongodb://stockapp:PASSWORT@127.0.0.1:27017/ai-stock-analyzer?authSource=ai-stock-analyzer
```

## 6. Backup

MongoDB-Dumps täglich via Cron:

```bash
# /etc/cron.daily/ai-stock-analyzer-backup
#!/bin/sh
BACKUP_DIR=/var/backups/ai-stock-analyzer
mkdir -p "$BACKUP_DIR"
DATE=$(date +%Y-%m-%d)
mongodump --uri "mongodb://stockapp:PASSWORT@127.0.0.1:27017/ai-stock-analyzer" --archive="$BACKUP_DIR/db-$DATE.gz" --gzip
find "$BACKUP_DIR" -name "db-*.gz" -mtime +30 -delete
```

`chmod +x` nicht vergessen. Für externe Kopien: rsync-Upload nach S3/Backblaze/NAS.

**Achtung zu KI-API-Keys im Backup:**
User-Keys und Admin-Shared-Keys liegen AES-GCM-verschlüsselt in der DB. Ohne den zugehörigen `APP_SECRET_KEY` lassen sie sich aus einem Backup nicht wiederherstellen. Sichere `APP_SECRET_KEY` daher separat vom DB-Backup (z.B. Password-Manager, nicht im gleichen S3-Bucket).

## 7. Erste Schritte nach Deployment

1. **Browser**: `https://stock.example.de/register`
2. **Registrieren** mit Admin-Adresse — **erster registrierter User wird automatisch Admin**. Passwort-Policy: min. 10 Zeichen, mindestens zwei Zeichenarten.
3. **Bestätigungs-Mail** sollte direkt eintreffen (wenn SMTP korrekt konfiguriert ist). Ohne Bestätigung ist kein Passwort-Reset möglich.
4. **Login**, dann **/settings**:
   - Optional 2FA (TOTP) aktivieren — `/settings → Sicherheit`
   - Eigenen Claude-/Gemini-/OpenAI-Key hinterlegen, falls du nicht den Admin-Shared-Key nutzen willst
5. **Admin-Seite** (oben rechts im Menü):
   - **Test-Mail senden** — SMTP-Verifikation
   - **KI-Einstellungen (global)** — optional Shared-Key für User ohne eigenen Key + Tages-/Monats-Limit in USD
   - **Kurs-Provider-Kaskade** — Reihenfolge (Yahoo → Finnhub → Stooq), Finnhub-Key hinterlegen falls gewünscht
   - **Yahoo-Finance-Tageslimit** — Empfohlener Startwert 5000, pausiert alle Yahoo-Requests nach Überschreitung bis Mitternacht UTC
   - **Top 10 / Flop 10 — Auto-Scan** — optional aktivieren (alle 30 Min, nur während Börsenzeiten, nur wenn User online)
   - **Login-Hinweis** — optional Text fürs Login-Formular (Wartung, Willkommen, etc.)
   - **Neue User müssen genehmigt werden** — falls du den Zugriff kontrollieren willst

## 8. Was automatisch geschützt ist

- **JWT-Sessions**: HttpOnly, SameSite=Lax, Secure in Production, 30 Tage Lifetime
- **Passwörter**: bcrypt (10 rounds), min. 10 Zeichen, mind. 2 Zeichenarten, Blacklist gängiger Passwörter, kein Name/E-Mail-Anteil erlaubt
- **2FA (TOTP)**: optional pro User. Login blockt bei aktivem 2FA ohne gültigen Code. 5 Versuche / 15 Min pro User für den Disable-Flow (Brute-Force-Schutz)
- **API-Keys**: AES-256-GCM verschlüsselt in DB, werden nie an den Browser zurückgegeben (nur Preview mit letzten 4 Zeichen)
- **Rate-Limits**: Login (8/15 Min), Register (3/h), Forgot-Password (5/h + 3/h pro E-Mail), KI-Analysen (60/h pro User), Chat (30/h + Länge-Limits), Movers-Scan (10/h)
- **CSP + Security-Headers**: HSTS, X-Frame-Options, X-Content-Type, Referrer-Policy, COOP, Permissions-Policy werden von der Proxy-Datei gesetzt
- **SSRF-Schutz**: `openaiBaseUrl` wird gegen private IPs / `.internal`-Domains geprüft
- **User-Enumeration**: Register + Forgot-Password liefern neutral, unabhängig von Account-Existenz
- **DSGVO**: Datenexport (Art. 15/20), Konto-Löschung (Art. 17) unter `/settings`. Admin-Delete cascadet über alle User-Models
- **Cookie-Banner**: informativ (nur ein technisch notwendiges Session-Cookie, kein Tracking)
- **Rechtliche Seiten**: `/impressum`, `/datenschutz`, `/barrierefreiheit` (WCAG 2.2 AA), `/hilfe` sind öffentlich erreichbar

## 9. Monitoring

- **Systemd-Logs**: `journalctl -u ai-stock-analyzer -f`
- **Next.js-Errors**: landen in journalctl unter `[api-error]` (generische Client-Messages, Details nur im Server-Log)
- **Error-Tracking**: Sentry lässt sich über Next.js SDK einbinden (optional)
- **Uptime-Check**: UptimeRobot / Hetzner / BetterStack ping auf `/login`
- **KI-Kosten im Blick**: Admin-Seite → „KI-Nutzung" zeigt Usage pro User und Operation
- **Yahoo-Quota**: Admin-Seite → „Yahoo-Finance-Tageslimit" zeigt heutigen Verbrauch + Limit-Treffer-Zeitstempel

## 10. Update-Deployment

**Mit systemd:**

```bash
cd /opt/ai-stock-analyzer
git fetch --all && git checkout <neuer-tag-oder-main>
npm ci
npm run build
sudo systemctl restart ai-stock-analyzer
```

**Mit PM2:**

```bash
cd /opt/ai-stock-analyzer
git fetch --all && git checkout <neuer-tag-oder-main>
npm ci
npm run build
pm2 reload ai-stock-analyzer       # zero-downtime
```

Bei Schema-Änderungen passt Mongoose sich automatisch an (neue Felder bekommen Defaults, alte bleiben unangetastet). Nur bei echten Breaking-Changes wird eine Migrations-Notiz im CHANGELOG stehen.

## Ports-Checkliste

| Port | Öffentlich? | Zweck |
|---|---|---|
| 22 | optional | SSH (fail2ban nicht vergessen) |
| 80 | ja | HTTP → HTTPS-Redirect |
| 443 | ja | HTTPS |
| 3000 (oder via `PORT=` festgelegt) | nein (nur 127.0.0.1) | Next.js |
| 27017 | nein (nur 127.0.0.1) | MongoDB |

## Was diese App **nicht** automatisch macht

- **Off-site Backups** — händisch einrichten (rsync / restic / S3-Sync)
- **`APP_SECRET_KEY`-Rotation** — bei Wechsel sind alle gespeicherten API-Keys ungültig und müssen neu eingetragen werden
- **Log-Rotation für Custom-Logs** — systemd-journal rotiert automatisch; wer eigene Log-Files schreibt, muss logrotate konfigurieren
- **Multi-Instance / HA** — der aktuelle Rate-Limiter ist in-memory pro Node-Prozess. Bei Multi-Instance-Setups (Kubernetes, PM2-Cluster) wird Rate-Limiting inkonsistent; Redis-basierter Limiter wäre der Fix
- **Datenquellen-Lizenzen** — Yahoo-Finance erlaubt in den Terms keine kommerzielle Nutzung. Bei zahlendem B2C-Betrieb muss auf einen lizenzierten Provider (Twelve Data, Polygon, EOD Historical, Refinitiv) umgestellt werden
- **BaFin-Einordnung** — die KI-generierten Kauf-/Halte-/Verkaufs-Empfehlungen können je nach Auslegung als Finanzanalyse oder Anlageberatung gelten (§ 32 KWG / § 15 WpIG). Vor kommerziellem Launch mit Kapitalmarkt-Fachanwalt klären
