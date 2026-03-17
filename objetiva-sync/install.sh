#!/bin/bash
# =============================================================================
# Objetiva Sync — Instalador automatico
# =============================================================================
# Uso:
#   curl -sL https://raw.githubusercontent.com/objetiva-comercios/objetiva-sync-monorepo/main/objetiva-sync/install.sh | bash
#
# O desde el servidor:
#   bash ~/proyectos/objetiva-sync-monorepo/objetiva-sync/install.sh
#
# Que hace:
#   1. Clona el repo (sparse checkout: solo shared/ + objetiva-sync/)
#   2. Instala dependencias (npm ci)
#   3. Compila TypeScript (npm run build)
#   4. Crea directorios de base de datos y logs
#   5. Ejecuta migraciones Drizzle
#   6. Inicia/recarga el servicio con PM2
#   7. Ejecuta health check
#
# Requisitos:
#   - Node.js >= 20
#   - npm
#   - PM2 (npm install -g pm2)
#   - Git
# =============================================================================

set -euo pipefail

# -- Config ------------------------------------------------------------------
INSTALL_DIR="${HOME}/proyectos"
REPO_DIR="${INSTALL_DIR}/objetiva-sync-monorepo"
SYNC_DIR="${REPO_DIR}/objetiva-sync"
REPO_URL="https://github.com/objetiva-comercios/objetiva-sync-monorepo.git"
PM2_APP_NAME="objetiva-sync"

# -- Colores -----------------------------------------------------------------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

info()  { echo -e "${CYAN}[INFO]${NC}  $1"; }
ok()    { echo -e "${GREEN}[OK]${NC}    $1"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

# -- Banner ------------------------------------------------------------------
echo ""
echo "=========================================="
echo "  Objetiva Sync — Instalador"
echo "=========================================="
echo ""

# -- Verificar dependencias --------------------------------------------------
info "Verificando dependencias..."

command -v git >/dev/null 2>&1 || error "git no esta instalado"
ok "git encontrado"

command -v node >/dev/null 2>&1 || error "Node.js no esta instalado"
NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
  error "Node.js version ${NODE_VERSION} detectada. Se requiere >= 20"
fi
ok "Node.js $(node -v) encontrado"

command -v npm >/dev/null 2>&1 || error "npm no esta instalado"
ok "npm $(npm -v) encontrado"

command -v pm2 >/dev/null 2>&1 || error "PM2 no esta instalado. Instalar con: npm install -g pm2"
ok "PM2 $(pm2 -v) encontrado"

# -- Manejar instalacion previa ---------------------------------------------
if [ -d "$REPO_DIR" ]; then
  echo ""
  warn "Detectada instalacion previa en ${REPO_DIR}"

  # Detener PM2 si esta corriendo
  if pm2 list 2>/dev/null | grep -q "$PM2_APP_NAME"; then
    info "Deteniendo servicio PM2..."
    pm2 stop "$PM2_APP_NAME" 2>/dev/null || true
    pm2 delete "$PM2_APP_NAME" 2>/dev/null || true
    ok "Servicio PM2 detenido"
  fi

  # Preservar .env si existe
  ENV_BACKUP=""
  if [ -f "${SYNC_DIR}/.env" ]; then
    ENV_BACKUP=$(mktemp)
    cp "${SYNC_DIR}/.env" "$ENV_BACKUP"
    ok "Backup de .env guardado en ${ENV_BACKUP}"
  fi

  # Preservar base de datos SQLite si existe
  DB_BACKUP=""
  if [ -d "${SYNC_DIR}/database" ] && [ "$(ls -A "${SYNC_DIR}/database" 2>/dev/null)" ]; then
    DB_BACKUP=$(mktemp -d)
    cp -r "${SYNC_DIR}/database/." "$DB_BACKUP/"
    ok "Backup de database/ guardado en ${DB_BACKUP}"
  fi

  info "Eliminando ${REPO_DIR}..."
  rm -rf "$REPO_DIR"
  ok "Instalacion previa eliminada"
fi

# -- Crear directorio de instalacion ----------------------------------------
mkdir -p "$INSTALL_DIR"

# -- Clonar con sparse checkout ---------------------------------------------
echo ""
info "Clonando repositorio (sparse checkout)..."
cd "$INSTALL_DIR"

git clone --filter=blob:none --sparse "$REPO_URL"
cd "$REPO_DIR"

git sparse-checkout set --skip-checks \
  shared/ \
  objetiva-sync/

ok "Repositorio clonado (solo shared/ + objetiva-sync/)"

# -- Restaurar .env si habia backup -----------------------------------------
if [ -n "${ENV_BACKUP:-}" ] && [ -f "$ENV_BACKUP" ]; then
  cp "$ENV_BACKUP" "${SYNC_DIR}/.env"
  rm -f "$ENV_BACKUP"
  ok "Archivo .env restaurado desde backup"
fi

# -- Restaurar database si habia backup -------------------------------------
if [ -n "${DB_BACKUP:-}" ] && [ -d "$DB_BACKUP" ]; then
  mkdir -p "${SYNC_DIR}/database"
  cp -r "$DB_BACKUP/." "${SYNC_DIR}/database/"
  rm -rf "$DB_BACKUP"
  ok "Base de datos SQLite restaurada desde backup"
fi

# -- Instalar dependencias ---------------------------------------------------
echo ""
info "Instalando dependencias..."
cd "$SYNC_DIR"

# Instalar desde la raiz del monorepo para resolver workspaces
cd "$REPO_DIR"
npm ci --production=false 2>&1 | tail -5
ok "Dependencias instaladas"

# -- Compilar TypeScript -----------------------------------------------------
echo ""
info "Compilando TypeScript..."
cd "$SYNC_DIR"
npm run build 2>&1 | tail -5

if [ ! -f "dist/index.js" ]; then
  error "Build fallo: dist/index.js no encontrado"
fi
ok "Build completado"

# -- Crear directorios necesarios --------------------------------------------
echo ""
info "Creando directorios..."
mkdir -p "${SYNC_DIR}/database"
mkdir -p "${SYNC_DIR}/logs"
ok "Directorios database/ y logs/ creados"

# -- Verificar .env ----------------------------------------------------------
if [ ! -f "${SYNC_DIR}/.env" ]; then
  warn "No se encontro .env — creando desde .env.example"
  if [ -f "${SYNC_DIR}/.env.example" ]; then
    cp "${SYNC_DIR}/.env.example" "${SYNC_DIR}/.env"
    warn "IMPORTANTE: Editar ${SYNC_DIR}/.env con los valores correctos antes de usar"
  else
    error "No se encontro .env ni .env.example"
  fi
fi

# -- Ejecutar migraciones ---------------------------------------------------
echo ""
info "Ejecutando migraciones de base de datos..."
cd "$SYNC_DIR"
npx drizzle-kit migrate 2>&1 | tail -5
ok "Migraciones completadas"

# -- Iniciar/recargar PM2 ---------------------------------------------------
echo ""
info "Iniciando servicio con PM2..."
cd "$SYNC_DIR"

if pm2 list 2>/dev/null | grep -q "$PM2_APP_NAME"; then
  pm2 reload ecosystem.config.js --env production 2>&1 | tail -3
  ok "Servicio PM2 recargado"
else
  pm2 start ecosystem.config.js --env production 2>&1 | tail -3
  ok "Servicio PM2 iniciado"
fi

# Guardar lista de procesos PM2 (para auto-start en reboot)
pm2 save 2>/dev/null || true

# -- Health check ------------------------------------------------------------
echo ""
info "Verificando que el servicio este corriendo..."
sleep 3

RETRIES=0
MAX_RETRIES=10

while [ $RETRIES -lt $MAX_RETRIES ]; do
  if pm2 list 2>/dev/null | grep "$PM2_APP_NAME" | grep -q "online"; then
    ok "Servicio online"
    break
  fi
  RETRIES=$((RETRIES + 1))
  sleep 2
done

if [ $RETRIES -ge $MAX_RETRIES ]; then
  warn "El servicio no confirmo estado 'online'. Revisando logs..."
  pm2 logs "$PM2_APP_NAME" --nostream --lines 20
  echo ""
  error "El servicio no inicio correctamente. Revisa los logs arriba."
fi

# Verificar endpoint HTTP si se puede leer el puerto del .env
SYNC_PORT=$(grep -E "^PORT=" "${SYNC_DIR}/.env" 2>/dev/null | cut -d= -f2 || echo "3000")
RETRIES=0
while [ $RETRIES -lt 5 ]; do
  if curl -sf "http://localhost:${SYNC_PORT}/" >/dev/null 2>&1; then
    ok "Dashboard respondiendo en puerto ${SYNC_PORT}"
    break
  fi
  RETRIES=$((RETRIES + 1))
  sleep 2
done

# -- Resultado ---------------------------------------------------------------
echo ""
echo "=========================================="
echo "  Instalacion completa"
echo "=========================================="
echo ""

ok "Objetiva Sync corriendo con PM2"
echo ""
info "Dashboard:    http://localhost:${SYNC_PORT}"
info "Logs:         pm2 logs ${PM2_APP_NAME}"
info "Reiniciar:    pm2 restart ${PM2_APP_NAME}"
info "Detener:      pm2 stop ${PM2_APP_NAME}"
info "Monitoreo:    pm2 monit"
echo ""

# Verificar si .env necesita configuracion
if grep -q "cambiar123" "${SYNC_DIR}/.env" 2>/dev/null; then
  warn "ADMIN_PASSWORD sigue con el valor por defecto. Cambiar en ${SYNC_DIR}/.env"
fi

if ! grep -qE "^REMOTE_API_URL=.+" "${SYNC_DIR}/.env" 2>/dev/null; then
  warn "REMOTE_API_URL no configurado. Enlazar al Gateway desde el dashboard:"
  echo -e "    ${CYAN}Configuracion > API Remota > Enlazar via codigo${NC}"
fi

echo ""
info "Para configurar Nginx como reverse proxy:"
echo -e "    ${CYAN}sudo cp ${SYNC_DIR}/nginx/objetiva-sync.conf /etc/nginx/sites-available/objetiva-sync${NC}"
echo -e "    ${CYAN}sudo ln -sf /etc/nginx/sites-available/objetiva-sync /etc/nginx/sites-enabled/${NC}"
echo -e "    ${CYAN}sudo nginx -t && sudo systemctl reload nginx${NC}"
echo ""
