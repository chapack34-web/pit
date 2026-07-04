#!/bin/bash
# Sistema "Deploy en 1 comando": automatiza TODO lo que antes eran 6 pasos manuales.
# Uso en tu VPS (Ubuntu/Debian):
#   chmod +x deploy.sh
#   ./deploy.sh tudominio.com
set -e

DOMAIN=$1
if [ -z "$DOMAIN" ]; then
  echo "Uso: ./deploy.sh tudominio.com"
  exit 1
fi

echo "🚀 Desplegando Pit en $DOMAIN..."

# 1. Instala Docker si no está
if ! command -v docker &> /dev/null; then
  echo "📦 Instalando Docker..."
  curl -fsSL https://get.docker.com | sh
fi

# 2. Genera secretos reales si no existen
if [ ! -f .env ]; then
  echo "🔐 Generando secretos..."
  DB_PASS=$(openssl rand -hex 16)
  JWT_SEC=$(openssl rand -hex 32)
  cat > .env <<EOF
DB_PASSWORD=$DB_PASS
JWT_SECRET=$JWT_SEC
NODE_ENV=production
EOF
fi

# 3. Configura el dominio en nginx
sed -i "s/TUDOMINIO.com/$DOMAIN/g" infrastructure/nginx/nginx.conf

# 4. Levanta nginx primero (necesario para el challenge de Let's Encrypt)
docker compose -f docker-compose.prod.yml up -d nginx

# 5. Emite el certificado SSL real y gratis
docker compose -f docker-compose.prod.yml run --rm certbot certonly \
  --webroot -w /var/www/certbot -d "$DOMAIN" --non-interactive --agree-tos \
  -m "admin@$DOMAIN" || echo "⚠️  Si esto falla, verificá que el DNS de $DOMAIN ya apunte a este servidor."

# 6. Levanta todo el stack
docker compose -f docker-compose.prod.yml up -d

# 7. Migra la base de datos y siembra el usuario demo
docker compose -f docker-compose.prod.yml exec -T backend npx prisma migrate deploy
docker compose -f docker-compose.prod.yml exec -T backend npm run seed || true

echo ""
echo "✅ Pit está publicado en https://$DOMAIN"
echo "   Cualquier persona en el mundo ya puede entrar desde el navegador y usarlo."
