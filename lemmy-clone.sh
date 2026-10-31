#!/usr/bin/env bash
# ============================================================
# lemmy-clone.sh — self-hosted Lemmy instance for Q&A search
# ============================================================
# Requires:
#   - Docker + Docker Compose v2
#   - A domain (A record pointing to this server)
#   - Ports 80 + 443 open
#   - An email for Let's Encrypt
#
# Usage:
#   ./lemmy-clone.sh your.domain.com admin@yourdomain.com
#
# After setup, add your instance to LEMMY_INSTANCES in questionFinder.js:
#   'https://your.domain.com',
# ============================================================
set -euo pipefail

DOMAIN="${1:-}"
EMAIL="${2:-}"
LEMMY_VERSION="${LEMMY_VERSION:-0.19.8}"
INSTALL_DIR="${INSTALL_DIR:-$HOME/lemmy-clone}"
DB_PASS="$(openssl rand -hex 20)"
ADMIN_PASS="$(openssl rand -hex 12)"

if [[ -z "$DOMAIN" || -z "$EMAIL" ]]; then
  echo "Usage: $0 <domain> <admin-email>"
  echo "Example: $0 lemmy.mygrowthbot.com admin@mygrowthbot.com"
  exit 1
fi

command -v docker >/dev/null || { echo "ERROR: docker not installed"; exit 1; }
docker compose version >/dev/null 2>&1 || { echo "ERROR: docker compose v2 required"; exit 1; }

echo "▶ Installing Lemmy $LEMMY_VERSION at $DOMAIN"
echo "  Install dir: $INSTALL_DIR"
echo "  Admin email: $EMAIL"
mkdir -p "$INSTALL_DIR" && cd "$INSTALL_DIR"

# ---------- .env ----------
cat > .env <<EOF
LEMMY_HOSTNAME=$DOMAIN
LEMMY_VERSION=$LEMMY_VERSION
POSTGRES_PASSWORD=$DB_PASS
ADMIN_EMAIL=$EMAIL
ADMIN_PASSWORD=$ADMIN_PASS
EOF

# ---------- docker-compose.yml (API only, no UI) ----------
cat > docker-compose.yml <<'YML'
version: "3.7"

x-logging: &default-logging
  driver: json-file
  options:
    max-size: 50m
    max-file: "4"

services:
  postgres:
    image: postgres:16-alpine
    environment:
      - POSTGRES_USER=lemmy
      - POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
      - POSTGRES_DB=lemmy
    volumes:
      - pgdata:/var/lib/postgresql/data
    restart: always
    logging: *default-logging

  lemmy:
    image: dessalines/lemmy:${LEMMY_VERSION}
    ports:
      - "127.0.0.1:8536:8536"
    environment:
      - LEMMY_DATABASE_URL=postgres://lemmy:${POSTGRES_PASSWORD}@postgres:5432/lemmy
      - LEMMY_HOSTNAME=${LEMMY_HOSTNAME}
      - LEMMY_FEDERATION_ENABLED=true
      - LEMMY_FEDERATION_ALLOWED_INSTANCES=
      - LEMMY_FEDERATION_BLOCKED_INSTANCES=
      - LEMMY_PICTURES_ENABLED=false
      - LEMMY_TLS_ENABLED=false
      - LEMMY_PORT=8536
      - RUST_LOG=warn
    depends_on:
      - postgres
    restart: always
    logging: *default-logging

  nginx:
    image: nginx:1-alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - certs:/etc/letsencrypt
      - certbot-webroot:/var/www/html
    depends_on:
      - lemmy
    restart: always
    logging: *default-logging

  certbot:
    image: certbot/certbot
    volumes:
      - certs:/etc/letsencrypt
      - certbot-webroot:/var/www/html
    entrypoint: /bin/sh
    command: -c "trap exit TERM; while :; do certbot renew --webroot -w /var/www/html --quiet; sleep 12h & wait $${!}; done;"
    restart: always

volumes:
  pgdata:
  certs:
  certbot-webroot:
YML

# ---------- nginx.conf ----------
cat > nginx.conf <<EOF
events { worker_connections 1024; }
http {
  server {
    listen 80;
    server_name $DOMAIN;
    location /.well-known/acme-challenge/ { root /var/www/html; }
    location / { return 301 https://\$host\$request_uri; }
  }
  server {
    listen 443 ssl http2;
    server_name $DOMAIN;
    ssl_certificate     /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;
    client_max_body_size 20m;
    location / {
      proxy_pass http://lemmy:8536;
      proxy_set_header Host \$host;
      proxy_set_header X-Real-IP \$remote_addr;
      proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Proto https;
    }
  }
}
EOF

echo "▶ Pulling images…"
docker compose pull

echo "▶ Starting postgres + lemmy…"
docker compose up -d postgres lemmy

echo "▶ Waiting for lemmy to be healthy…"
for i in $(seq 1 60); do
  if curl -sf "http://127.0.0.1:8536/api/v3/site" >/dev/null 2>&1; then
    echo "  ✅ lemmy API is up"
    break
  fi
  sleep 2
  [[ $i -eq 60 ]] && { echo "  ❌ lemmy didn't come up in 120s"; docker compose logs lemmy | tail -40; exit 1; }
done

echo "▶ Issuing TLS certificate for $DOMAIN…"
docker compose run --rm certbot certonly --webroot -w /var/www/html \
  -d "$DOMAIN" --email "$EMAIL" --agree-tos --non-interactive

echo "▶ Starting nginx + certbot renewal loop…"
docker compose up -d nginx certbot

echo
echo "✅ Lemmy is live at https://$DOMAIN"
echo
echo "Next: register the admin account (open in a browser):"
echo "  https://$DOMAIN/api/v3/user/register"
echo "  username: admin"
echo "  email:    $EMAIL"
echo "  password: $ADMIN_PASS"
echo
echo "Then add your instance to LEMMY_INSTANCES in questionFinder.js:"
echo "  'https://$DOMAIN',"
echo
echo "Restart your GrowthBot server so it picks up the change."