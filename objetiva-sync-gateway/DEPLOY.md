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
docker compose up -d --build
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

El wizard tiene 6 pasos:

1. **Base de datos** — Ingresar la URL de PostgreSQL
2. **Dominio publico** — Configurar la URL publica del gateway
3. **JWT** — Genera automaticamente el secret de autenticacion
4. **Contrasena** — Establecer la contrasena del sincronizador
5. **Aplicar** — Guarda todo en `.env` y reinicia la configuracion
6. **Enlazar sync** — Genera el codigo de pairing para conectar objetiva-sync

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
docker compose up -d --build
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

## Notas de Arquitectura

- **Build multi-stage:** deps → builder → runtime (~200MB imagen final)
- **Setup-only mode:** Si falta `.env` o `DATABASE_URL`, el server arranca solo con `/setup` habilitado
- **Entrypoint condicional:** `prisma migrate deploy` solo corre si `DATABASE_URL` esta definido
- **env_file opcional:** Docker Compose no exige `.env` para arrancar (`required: false`)
- **Limite de memoria:** 512MB (configurable en `docker-compose.yml`)
- **Health check:** endpoint `/health`, verificado cada 30s
- **Logs:** persistidos via Docker named volume `gateway-logs`
- **Usuario no-root:** el contenedor corre como `gateway` (UID 1001) con permisos de escritura en el workdir
