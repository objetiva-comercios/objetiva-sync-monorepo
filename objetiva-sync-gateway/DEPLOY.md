# Objetiva Sync Gateway - Guia de Deployment con Docker

## Instalacion Rapida

Ejecutar desde el VPS:

```bash
curl -sL https://raw.githubusercontent.com/objetiva-comercios/objetiva-sync-monorepo/main/objetiva-sync-gateway/install.sh | bash
```

Esto clona el repo, construye la imagen Docker y levanta el gateway en modo setup wizard. Despues seguir las instrucciones en pantalla.

> Para instalacion manual paso a paso, continuar leyendo.

---

## Requisitos Previos

- **Docker** >= 20.10 con Docker Compose v2
- **Git**
- **PostgreSQL** accesible desde la red Docker (ej: corriendo en un contenedor en `sanchez_docker_network`)
- **Traefik** como reverse proxy (ya corriendo en `sanchez_docker_network`)

## 1. Clonar el Repositorio

Descarga solo los archivos necesarios con sparse checkout:

```bash
git clone --filter=blob:none --sparse https://github.com/objetiva-comercios/objetiva-sync-monorepo.git
cd objetiva-sync-monorepo

git sparse-checkout set --skip-checks \
  shared/ \
  objetiva-sync-gateway/
```

> Si ya tenes un clon completo, salta este paso.

## 2. Crear la Red Docker (si no existe)

```bash
docker network create sanchez_docker_network
```

Traefik, PostgreSQL y sync-gateway deben estar en esta misma red.

## 3. Construir e Iniciar

**No se necesita crear `.env` manualmente.** El gateway arranca en modo setup wizard y se configura desde el navegador.

```bash
cd objetiva-sync-gateway
docker compose build --no-cache && docker compose up -d
```

Verificar que el contenedor este corriendo:

```bash
docker compose ps
docker compose logs -f sync-gateway
```

Deberias ver en los logs:

```
Mode: SETUP-ONLY
DATABASE_URL not set — skipping migrations (setup wizard mode).
Action required: visit http://0.0.0.0:3335/setup
```

## 4. Configurar DNS / Acceso

El contenedor no expone puertos directamente — Traefik rutea internamente via labels de Docker.

### Opcion A: Acceso via Tailscale (recomendado para setup inicial)

Si el VPS esta conectado via Tailscale, agregar una entrada en el archivo `hosts` de tu PC:

```
# Windows: C:\Windows\System32\drivers\etc\hosts
# Linux/Mac: /etc/hosts
<IP-TAILSCALE-DEL-VPS>    sync-gateway.sanchezrepuestos.com.ar
```

Para obtener la IP Tailscale del VPS:

```bash
tailscale ip -4
```

### Opcion B: DNS publico

Crear un registro A en tu proveedor DNS:

```
Tipo: A
Nombre: sync-gateway
Valor: <IP publica del VPS>
```

### Opcion C: Desarrollo local sin Traefik

Descomentar el port mapping en `docker-compose.yml`:

```yaml
ports:
  - "3335:3335"
```

Y acceder directamente a `http://localhost:3335/setup`.

## 5. Ejecutar el Setup Wizard

Abrir en el navegador:

```
http://sync-gateway.sanchezrepuestos.com.ar/setup
```

El wizard tiene 5 pasos:

1. **Base de datos** — Ingresar la URL de PostgreSQL
2. **Dominio publico** — Configurar la URL publica del gateway
3. **JWT** — Genera automaticamente el secret de autenticacion
4. **Aplicar** — Guarda todo en `.env` y reinicia la configuracion
5. **Enlazar sync** — Genera el codigo de pairing para conectar objetiva-sync

> **Importante (Docker):** En el paso de base de datos, usar el hostname del contenedor PostgreSQL (ej: `postgres`), NO `localhost`. Ambos contenedores deben estar en la misma red Docker.

Despues de completar el wizard, reiniciar el contenedor para que ejecute las migraciones:

```bash
docker compose restart sync-gateway
```

Verificar que arranco en modo normal:

```bash
docker compose logs --tail 10 sync-gateway
```

Deberias ver:

```
Running Prisma migrations...
Migrations complete.
Mode: NORMAL
All systems go.
```

## 6. Actualizar

```bash
cd objetiva-sync-gateway
git pull
docker compose build --no-cache && docker compose up -d
```

Las migraciones de Prisma se ejecutan automaticamente en cada inicio (idempotente). El `.env` se preserva porque no esta dentro de la imagen Docker — lo genera el wizard en el directorio de trabajo.

## 7. Monitoreo y Troubleshooting

```bash
# Estado del contenedor
docker compose ps

# Logs en tiempo real
docker compose logs -f sync-gateway

# Shell dentro del contenedor
docker compose exec sync-gateway sh

# Reiniciar
docker compose restart sync-gateway

# Reconstruir desde cero
docker compose build --no-cache && docker compose up -d

# Health check
curl http://localhost:3335/health   # solo si ports esta descomentado

# Preflight checks (desde dentro del contenedor)
docker compose exec sync-gateway node -e "fetch('http://localhost:3335/api/setup/preflight').then(r=>r.json()).then(console.log)"
```

### Problemas Comunes

**El contenedor queda en `Restarting`:**
Revisar logs con `docker compose logs sync-gateway`. Si dice `DATABASE_URL environment variable is required`, la imagen es vieja — reconstruir con `docker compose build --no-cache`.

**No puedo acceder a `/setup`:**
El contenedor no expone puertos por defecto (Traefik rutea). Verificar que Traefik este corriendo y en la misma red. Alternativamente, descomentar `ports: - "3335:3335"` en `docker-compose.yml` para acceso directo.

**Conexion a base de datos rechazada:**
Verificar que `DATABASE_URL` use el hostname del contenedor PostgreSQL (no `localhost`). Ambos contenedores deben estar en `sanchez_docker_network`.

**Las migraciones fallan:**
Verificar que la base de datos exista y el usuario tenga permisos CREATE TABLE. Revisar `docker compose logs sync-gateway` para ver la salida de Prisma.

**El wizard no puede escribir `.env`:**
El contenedor corre como usuario no-root (`gateway`). Si ves errores de permisos al guardar en el wizard, reconstruir la imagen (`docker compose build --no-cache`) — el Dockerfile actual da permisos de escritura al directorio de trabajo.

## 8. Traefik + Tailscale

Se usa HTTP (entrypoint `web`) porque Let's Encrypt no puede completar el challenge HTTP-01 detras de Tailscale (el puerto 80 no es accesible desde internet). El trafico viaja cifrado por el tunel de Tailscale.

Para cambiar el dominio, editar el label en `docker-compose.yml`:

```yaml
- "traefik.http.routers.sync-gateway.rule=Host(`tu-dominio.ejemplo.com`)"
```

## 9. Migracion desde PM2

Si migrás desde el deployment anterior con PM2:

1. Detener PM2: `pm2 stop sync-gateway && pm2 delete sync-gateway`
2. El contenedor Docker usa la misma base de datos, no se necesita migrar datos
3. Si ya tenias un `.env`, copialo a `objetiva-sync-gateway/.env` y el contenedor lo levanta directamente sin pasar por el wizard

## 10. Ciclo de Deploy: Regeneracion de Schemas

Usar este procedimiento cuando un cambio en PostgreSQL (columna nueva, tipo modificado, columna eliminada, tabla nueva) necesita propagarse al sistema completo. Para referencia tecnica detallada del flujo completo, ver `.planning/REGENERACION_SCHEMAS.md`.

### Procedimiento paso a paso

#### Paso 1: Preview de cambios (dry-run)

```bash
cd objetiva-sync-monorepo
npm run regenerate-schemas:dry-run
```

No requiere configuracion manual — el script auto-descubre la URL del gateway desde `objetiva-sync-gateway/.env` (GATEWAY_PUBLIC_URL) y obtiene un token JWT automaticamente via `POST /api/setup/token`. Muestra un diff con colores por campo sin escribir ningun archivo. Campos agregados (+) en verde, eliminados (-) en rojo, modificados (~) en amarillo.

**Verificar:** el output muestra los nombres de entidades y el resumen de cambios esperados.

#### Paso 2: Regenerar schemas

```bash
npm run regenerate-schemas
```

Se autentica automaticamente con el gateway (mismo mecanismo que el dashboard). Introspecciona PostgreSQL, genera los schemas Zod en `shared/schemas/generated/` y el schema Prisma en `objetiva-sync-gateway/prisma/schema.prisma`, y ejecuta `prisma generate` automaticamente.

**Verificar:** el output muestra "Schemas regenerated successfully". Confirmar archivos modificados:

```bash
git diff --stat
```

#### Paso 3: Revisar cambios

```bash
git diff shared/schemas/generated/ objetiva-sync-gateway/prisma/schema.prisma
```

**Verificar:** el diff coincide con lo que mostro el dry-run. No hay cambios inesperados en otras entidades.

#### Paso 4: Commit y push

```bash
git add shared/schemas/generated/ objetiva-sync-gateway/prisma/schema.prisma
git commit -m "chore: regenerate schemas from PostgreSQL"
git push origin main
```

**Verificar:** el commit esta en el historial:

```bash
git log --oneline -1
```

#### Paso 5: Rebuild imagen Docker en el VPS

```bash
# En el VPS
cd objetiva-sync-monorepo/objetiva-sync-gateway
git pull
docker compose build --no-cache && docker compose up -d
```

El `docker-entrypoint.sh` ejecuta `npx prisma db push` automaticamente al iniciar el contenedor — sincroniza el schema Prisma con PostgreSQL real (crea columnas faltantes, ajusta tipos, elimina columnas con `--accept-data-loss`).

**Verificar:** los logs confirman que el ciclo completo se ejecuto:

```bash
docker compose logs --tail 20 sync-gateway
```

Debe aparecer:
```
Syncing database schema...
Schema sync complete.
```

#### Paso 5b: Rebuild objetiva-sync en el VPS

Los schemas regenerados deben compilarse en el bundle de produccion del sync para que `reportSchemasToGateway()` envie los schemas actualizados al gateway.

```bash
# En el VPS
cd objetiva-sync-monorepo/objetiva-sync
npm ci --production=false
npm run build
pm2 restart objetiva-sync
```

**Verificar:** PM2 reinicia sin errores y el proceso retoma estado `online`:

```bash
pm2 list
pm2 logs objetiva-sync --lines 10
```

#### Paso 6: Verificacion final — Schema Status

Abrir la pagina **Schema Status** en el dashboard del gateway. Cada entidad debe mostrar todas las columnas en verde (alineadas) en las 3 capas: PostgreSQL live, gateway compilado, sync reportado.

**Verificar:** no quedan indicadores amarillos ni rojos en ninguna entidad.

---

### Escenarios comunes

**Columna nueva agregada:** La columna nueva aparece en el schema Zod y en el modelo Prisma. `prisma db push` es un no-op para esta columna (ya existe en PostgreSQL). Si el sync debe enviar datos para esta columna, actualizar manualmente `objetiva-sync/src/types/*.ts`.

**Tipo de columna cambiado:** La regeneracion actualiza el tipo Zod y la anotacion `@db.*` en Prisma. `prisma db push` puede emitir una advertencia si el cambio requiere migracion de datos. Revisar cuidadosamente antes de continuar.

**Columna eliminada:** La regeneracion elimina el campo de Zod y Prisma. `prisma db push` (con `--accept-data-loss`, ya incluido en el entrypoint) refleja la eliminacion desde la perspectiva de Prisma. La columna ya fue eliminada previamente en PostgreSQL.

**Tabla nueva agregada:** Requiere agregar la entidad a los endpoints de introspección del gateway y a la lista de entidades del script antes de correr el procedimiento. Este es un cambio de codigo, no solo una regeneracion.

---

### Ejemplo de output dry-run

```
=== articulos ===
+ stock_minimo: integer, nullable

Resumen: 1 campo agregado en 1 entidad
```

---

### Troubleshooting

**"JWT authentication failed" al ejecutar el script:**
El script se autentica automaticamente via `POST /api/setup/token`. Si falla, verificar que el gateway esta corriendo y accesible. Si se usa la configuracion manual legacy (`.env` en raiz del monorepo), verificar que `JWT_SECRET` coincide con el del gateway y que `GATEWAY_URL` apunta al host correcto.

**El contenedor no refleja los cambios despues del rebuild:**
Verificar que se corrio `git pull` en el VPS antes de `docker compose build`. Confirmar que se uso el flag `--no-cache`. Revisar que los logs del entrypoint muestran "Schema sync complete."

**`prisma db push` falla con error de tipos:**
Un cambio de tipo de columna puede ser incompatible con datos existentes (ej: text a integer). Resolver el conflicto directamente en PostgreSQL primero, luego volver a correr el ciclo.

**Dry-run no muestra los cambios esperados:**
El script compara contra los archivos locales actuales. Si los archivos ya estan al dia, no hay diff. Verificar que el cambio en PostgreSQL fue realmente aplicado en la base de datos remota.

**Schema Status muestra amarillo/rojo despues del ciclo completo:**
El sync puede no haber reportado sus schemas todavia. Esperar el proximo ciclo de sync o reiniciar objetiva-sync. Si persiste el desalineamiento, verificar que el sync esta corriendo con el codigo actualizado (schemas regenerados).

---

## Notas de Arquitectura

- **Build multi-stage:** deps → builder → runtime (~200MB imagen final)
- **Setup-only mode:** Si falta `.env` o `DATABASE_URL`, el server arranca solo con `/setup` habilitado
- **Entrypoint condicional:** `prisma migrate deploy` solo corre si `DATABASE_URL` esta definido
- **env_file opcional:** Docker Compose no exige `.env` para arrancar (`required: false`)
- **Limite de memoria:** 512MB (configurable en `docker-compose.yml`)
- **Health check:** endpoint `/health`, verificado cada 30s
- **Logs:** persistidos via Docker named volume `gateway-logs`
- **Usuario no-root:** el contenedor corre como `gateway` (UID 1001) con permisos de escritura en el workdir
