#!/bin/bash
# =============================================================================
# Objetiva Sync Gateway — Instalador automatico
# =============================================================================
# Uso:
#   curl -sL https://raw.githubusercontent.com/objetiva-comercios/objetiva-sync-monorepo/main/objetiva-sync-gateway/install.sh | bash
#
# O desde el VPS:
#   bash ~/proyectos/objetiva-sync-monorepo/objetiva-sync-gateway/install.sh
#
# Que hace:
#   1. Clona el repo (sparse checkout: solo shared/ + objetiva-sync-gateway/)
#   2. Crea la red Docker si no existe
#   3. Construye la imagen Docker
#   4. Levanta el contenedor en modo setup wizard
#   5. Muestra la URL para completar la configuracion
#
# Requisitos:
#   - Docker >= 20.10 con Docker Compose v2
#   - Git
#   - Traefik corriendo en sanchez_docker_network (o descomentar ports en docker-compose.yml)
#   - PostgreSQL accesible desde sanchez_docker_network
# =============================================================================

set -euo pipefail

# -- Config ------------------------------------------------------------------
INSTALL_DIR="${HOME}/proyectos"
REPO_DIR="${INSTALL_DIR}/objetiva-sync-monorepo"
GATEWAY_DIR="${REPO_DIR}/objetiva-sync-gateway"
REPO_URL="https://github.com/objetiva-comercios/objetiva-sync-monorepo.git"
DOCKER_NETWORK="sanchez_docker_network"
CONTAINER_NAME="sync-gateway"
DOMAIN="sync-gateway.sanchezrepuestos.com.ar"

# -- Colores -----------------------------------------------------------------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

info()  { echo -e "${CYAN}[INFO]${NC}  $1"; }
ok()    { echo -e "${GREEN}[OK]${NC}    $1"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

# -- Verificar dependencias --------------------------------------------------
echo ""
echo "=========================================="
echo "  Objetiva Sync Gateway — Instalador"
echo "=========================================="
echo ""

info "Verificando dependencias..."

command -v git >/dev/null 2>&1 || error "git no esta instalado"
ok "git encontrado"

command -v docker >/dev/null 2>&1 || error "docker no esta instalado"
ok "docker encontrado"

docker compose version >/dev/null 2>&1 || error "docker compose v2 no esta disponible"
ok "docker compose v2 encontrado"

# -- Limpiar instalacion previa ----------------------------------------------
if [ -d "$REPO_DIR" ]; then
  echo ""
  warn "Detectada instalacion previa en ${REPO_DIR}"
  info "Bajando contenedor existente..."
  cd "$GATEWAY_DIR" 2>/dev/null && docker compose down 2>/dev/null || true
  cd "$INSTALL_DIR"

  # Preservar .env si existe (tiene la config del wizard)
  ENV_BACKUP=""
  if [ -f "${GATEWAY_DIR}/.env" ]; then
    ENV_BACKUP=$(mktemp)
    cp "${GATEWAY_DIR}/.env" "$ENV_BACKUP"
    ok "Backup de .env guardado en ${ENV_BACKUP}"
  fi

  info "Eliminando ${REPO_DIR}..."
  rm -rf "$REPO_DIR"
  ok "Instalacion previa eliminada"
fi

# -- Clonar con sparse checkout ---------------------------------------------
echo ""
info "Clonando repositorio (sparse checkout)..."
cd "$INSTALL_DIR"

git clone --filter=blob:none --sparse "$REPO_URL"
cd "$REPO_DIR"

git sparse-checkout set --skip-checks \
  shared/ \
  objetiva-sync-gateway/

ok "Repositorio clonado (solo shared/ + objetiva-sync-gateway/)"

# -- Restaurar .env si habia backup -----------------------------------------
if [ -n "${ENV_BACKUP:-}" ] && [ -f "$ENV_BACKUP" ]; then
  cp "$ENV_BACKUP" "${GATEWAY_DIR}/.env"
  rm -f "$ENV_BACKUP"
  ok "Archivo .env restaurado desde backup"
fi

# -- Crear red Docker si no existe -------------------------------------------
echo ""
info "Verificando red Docker '${DOCKER_NETWORK}'..."

if docker network inspect "$DOCKER_NETWORK" >/dev/null 2>&1; then
  ok "Red '${DOCKER_NETWORK}' ya existe"
else
  info "Creando red '${DOCKER_NETWORK}'..."
  docker network create "$DOCKER_NETWORK"
  ok "Red '${DOCKER_NETWORK}' creada"
fi

# -- Construir imagen --------------------------------------------------------
echo ""
info "Construyendo imagen Docker (esto puede tardar unos minutos)..."
cd "$GATEWAY_DIR"

docker compose build --no-cache
ok "Imagen construida"

# -- Levantar contenedor ----------------------------------------------------
echo ""
info "Levantando contenedor..."
docker compose up -d
ok "Contenedor levantado"

# -- Esperar que el contenedor este healthy ----------------------------------
info "Esperando que el servicio responda..."
RETRIES=0
MAX_RETRIES=30

while [ $RETRIES -lt $MAX_RETRIES ]; do
  STATUS=$(docker inspect --format='{{.State.Health.Status}}' "$CONTAINER_NAME" 2>/dev/null || echo "not_found")

  if [ "$STATUS" = "healthy" ]; then
    ok "Servicio healthy"
    break
  elif [ "$STATUS" = "unhealthy" ]; then
    # En modo setup-only, /health puede fallar — verificar que el contenedor este corriendo
    RUNNING=$(docker inspect --format='{{.State.Running}}' "$CONTAINER_NAME" 2>/dev/null || echo "false")
    if [ "$RUNNING" = "true" ]; then
      ok "Contenedor corriendo (modo setup wizard — health check esperado como unhealthy)"
      break
    fi
  fi

  RETRIES=$((RETRIES + 1))
  sleep 2
done

if [ $RETRIES -ge $MAX_RETRIES ]; then
  warn "El contenedor no respondio a tiempo. Revisando logs..."
  docker compose logs --tail 20 "$CONTAINER_NAME"
  echo ""
  error "El contenedor no inicio correctamente. Revisa los logs arriba."
fi

# -- Mostrar resultado -------------------------------------------------------
echo ""
echo "=========================================="
echo "  Instalacion completa"
echo "=========================================="
echo ""

# Detectar si hay .env (ya configurado) o no (necesita wizard)
if [ -f "${GATEWAY_DIR}/.env" ] && grep -q "DATABASE_URL" "${GATEWAY_DIR}/.env" 2>/dev/null; then
  ok "Gateway configurado y corriendo"
  echo ""
  info "Dashboard:  http://${DOMAIN}/"
  info "Health:     http://${DOMAIN}/health"
  info "Setup:      http://${DOMAIN}/setup"
else
  warn "Gateway en modo SETUP WIZARD"
  echo ""
  info "Completa la configuracion desde tu navegador:"
  echo ""
  echo -e "    ${GREEN}http://${DOMAIN}/setup${NC}"
  echo ""
  info "Asegurate de que el DNS o tu archivo hosts apunte a este servidor:"
  TAILSCALE_IP=$(tailscale ip -4 2>/dev/null || echo "<IP-TAILSCALE>")
  echo ""
  echo -e "    ${CYAN}${TAILSCALE_IP}    ${DOMAIN}${NC}"
  echo ""
  info "Despues de completar el wizard, reiniciar para aplicar migraciones:"
  echo ""
  echo -e "    ${CYAN}cd ${GATEWAY_DIR} && docker compose restart${NC}"
fi

echo ""
info "Logs:  cd ${GATEWAY_DIR} && docker compose logs -f sync-gateway"
echo ""
