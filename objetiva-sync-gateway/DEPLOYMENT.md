# Objetiva Sync Gateway - Guía de Deployment

## Requisitos del Servidor Remoto

- AlmaLinux 8/9 (o compatible RHEL)
- Node.js 20+
- PostgreSQL 13+
- Nginx
- Certbot (Let's Encrypt)
- PM2 (process manager)
- Acceso SSH con sudo
- Registro DNS A configurado: `sync-gateway.sanchezrepuestos.com.ar` → IP del servidor

## Despliegue Automatizado (Recomendado)

El gateway incluye un script de despliegue automatizado que maneja todo el proceso: instalación de dependencias, build, backup de base de datos, migraciones, y configuración de PM2.

### Prerequisito: Configurar Variables de Entorno

1. **Copiar el template de configuración:**
   ```bash
   cd ~/objetiva-sync-gateway
   cp .env.example .env
   ```

2. **Editar `.env` con tus valores:**
   ```bash
   nano .env
   ```

   Variables críticas que debes configurar:
   - `DATABASE_URL`: URL de conexión a PostgreSQL
   - `JWT_SECRET`: Generar con `openssl rand -hex 32`
   - `SYNC_PASSWORD_HASH`: Generar con `node -e "import('bcryptjs').then(b => console.log(b.hashSync('tu-password', 10)))"`
   - `HOST`: `0.0.0.0` para producción detrás de proxy
   - `NODE_ENV`: `production`

   Ver `.env.example` para documentación completa de cada variable.

### Primer Despliegue

```bash
cd ~/objetiva-sync-gateway

# Dar permisos de ejecución al script
chmod +x deploy.sh

# Ejecutar despliegue
bash deploy.sh
```

El script realizará automáticamente:
1. ✅ Pre-flight checks (Node.js, npm, pm2, pg_dump)
2. ✅ Validación de variables de entorno
3. ✅ Instalación de dependencias (`npm ci`)
4. ✅ Generación de Prisma Client
5. ✅ Build de TypeScript
6. ✅ Backup de PostgreSQL (formato comprimido)
7. ✅ Migraciones de base de datos (`prisma migrate deploy`)
8. ✅ Inicio/recarga de servicio PM2
9. ✅ Health check del proceso

Logs del despliegue se guardan en `logs/deploy-YYYYMMDD-HHMMSS.log`.

### Actualizaciones Posteriores

Para actualizar a una nueva versión:

```bash
cd ~/objetiva-sync-gateway

# Obtener cambios (si usas git)
git pull

# Re-desplegar
bash deploy.sh
```

El script detectará si el proceso ya está corriendo y hará reload sin downtime.

### Comandos Útiles Post-Despliegue

```bash
# Ver estado del proceso
pm2 status

# Ver logs en tiempo real
pm2 logs sync-gateway

# Reiniciar el servicio
pm2 restart sync-gateway

# Detener el servicio
pm2 stop sync-gateway
```

---

## Despliegue Manual (Paso a Paso)

Si prefieres entender o ejecutar cada paso manualmente, sigue esta guía.


- AlmaLinux 8/9 (o compatible RHEL)
- Node.js 20+
- PostgreSQL 13+
- Nginx
- Certbot (Let's Encrypt)
- Acceso SSH con sudo
- Registro DNS A configurado: `sync-gateway.sanchezrepuestos.com.ar` → IP del servidor

## Paso 1: Preparar el Servidor

### 1.1 Conectar por SSH

```bash
ssh usuario@tu-servidor.com
```

### 1.2 Actualizar Sistema

```bash
sudo dnf update -y
sudo dnf update -y
```

### 1.3 Instalar Dependencias

```bash
# Node.js 20+
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo -E bash -
sudo dnf install -y nodejs

# Verificar instalación
node --version  # Debe ser v18 o superior
npm --version

# PostgreSQL (si no está instalado)
sudo dnf install -y postgresql postgresql-contrib

# Nginx
sudo dnf install -y nginx

# Certbot para Let's Encrypt
sudo dnf install -y certbot python3-certbot-nginx
```

## Paso 2: Configurar PostgreSQL

### 2.1 Crear Base de Datos y Usuario

```bash
sudo -u postgres psql
```

Dentro de PostgreSQL:

```sql
-- Crear usuario
CREATE USER sync_gateway_user WITH PASSWORD 'password-seguro-aqui';

-- Crear base de datos
CREATE DATABASE objetiva_sync_gateway;

-- Otorgar permisos
GRANT ALL PRIVILEGES ON DATABASE objetiva_sync_gateway TO sync_gateway_user;

-- Salir
\q
```

### 2.2 Configurar Acceso Local

Editar `/var/lib/pgsql/data/pg_hba.conf`:

```bash
sudo nano /etc/postgresql/14/main/pg_hba.conf
```

Asegurar que existe esta línea (debería estar por defecto):

```
local   all             all                                     peer
host    all             all             127.0.0.1/32            md5
```

Reiniciar PostgreSQL:

```bash
sudo systemctl restart postgresql
```

### 2.3 Probar Conexión

```bash
psql -U sync_gateway_user -d objetiva_sync_gateway -h localhost -W
```

## Paso 3: Deployar Objetiva Sync Gateway

### 3.1 Crear Usuario de Sistema

```bash
# Crear usuario sin privilegios para ejecutar la app
sudo useradd -m -s /bin/bash syncgateway
sudo su - syncgateway
```

### 3.2 Clonar o Transferir el Proyecto

**Opción A: Clonar desde Git**

```bash
cd ~
git clone <url-del-repositorio> objetiva-sync-gateway
cd objetiva-sync-gateway
```

**Opción B: Transferir desde Local**

Desde tu máquina local:

```bash
# Comprimir el proyecto (excluir node_modules)
cd C:/Users/sistemas/.proyectos
tar -czf objetiva-sync-gateway.tar.gz \
  --exclude='node_modules' \
  --exclude='dist' \
  --exclude='.env' \
  objetiva-sync-gateway

# Transferir al servidor
scp objetiva-sync-gateway.tar.gz usuario@servidor:~

# En el servidor (como usuario syncgateway)
sudo su - syncgateway
cd ~
tar -xzf objetiva-sync-gateway.tar.gz
cd objetiva-sync-gateway
```

### 3.3 Instalar Dependencias

```bash
npm install
```

### 3.4 Configurar Variables de Entorno

```bash
cp .env.example .env
nano .env
```

Configurar:

```env
# Server
PORT=3335
NODE_ENV=production
HOST=127.0.0.1

# Database
DATABASE_URL="postgresql://sync_gateway_user:password-seguro-aqui@localhost:5432/objetiva_sync_gateway"

# JWT (generar uno nuevo con: openssl rand -hex 32)
JWT_SECRET=tu-secret-super-seguro-de-64-caracteres-minimo
JWT_EXPIRES_IN=86400

# Logging
LOG_LEVEL=info
```

### 3.5 Compilar el Proyecto

```bash
npm run build
```

### 3.6 Generar Prisma Client

```bash
npm run prisma:generate
```

### 3.7 Crear Esquema de Base de Datos

```bash
npm run prisma:push
```

### 3.8 Probar que Funciona

```bash
npm start
```

Debería mostrar:

```
✅ Conectado a PostgreSQL
🚀 Sync Gateway escuchando en http://127.0.0.1:3335
```

Presiona `Ctrl+C` para detener (configuraremos PM2 después).

## Paso 4: Configurar PM2 (Process Manager)

### 4.1 Instalar PM2 Globalmente

```bash
# Salir del usuario syncgateway
exit

# Como usuario con sudo
sudo npm install -g pm2
```

### 4.2 Configurar PM2 para el Usuario syncgateway

```bash
sudo su - syncgateway
cd ~/objetiva-sync-gateway

# Iniciar con PM2
pm2 start npm --name "sync-gateway" -- start

# Verificar
pm2 status

# Ver logs
pm2 logs sync-gateway

# Configurar para que inicie al arrancar el sistema
pm2 startup
# Ejecutar el comando que PM2 te muestra
```

### 4.3 Guardar Configuración PM2

```bash
pm2 save
```

### 4.4 Comandos Útiles de PM2

```bash
pm2 status                    # Estado de procesos
pm2 logs sync-gateway         # Ver logs en tiempo real
pm2 restart sync-gateway      # Reiniciar
pm2 stop sync-gateway         # Detener
pm2 delete sync-gateway       # Eliminar proceso
pm2 monit                     # Monitor interactivo
```

## Paso 5: Configurar Nginx como Proxy Inverso

### 5.1 Copiar Configuración

Salir del usuario syncgateway y volver a tu usuario con sudo:

```bash
exit
```

Copiar el archivo de configuración:

```bash
sudo cp /home/syncgateway/objetiva-sync-gateway/nginx/sync-gateway.conf \
  /etc/nginx/conf.d/sync-gateway.conf
```

O crear manualmente:

```bash
sudo nano /etc/nginx/conf.d/sync-gateway.conf
```

Y pegar el contenido de `nginx/sync-gateway.conf`.

### 5.2 Habilitar el Sitio

```bash
sudo ln -s /etc/nginx/conf.d/sync-gateway.conf \
  /etc/nginx/conf.d/
```

### 5.3 Verificar Configuración

```bash
sudo nginx -t
```

Debe mostrar: `syntax is ok` y `test is successful`

### 5.4 Recargar Nginx

```bash
sudo systemctl reload nginx
```

## Paso 6: Obtener Certificado SSL con Let's Encrypt

### 6.1 Crear Directorio para Certbot

```bash
sudo mkdir -p /var/www/certbot
```

### 6.2 Obtener Certificado

```bash
sudo certbot certonly --webroot \
  -w /var/www/certbot \
  -d sync-gateway.sanchezrepuestos.com.ar \
  --email tu-email@ejemplo.com \
  --agree-tos \
  --no-eff-email
```

Sigue las instrucciones en pantalla.

### 6.3 Verificar Certificado

Los certificados se guardan en:
```
/etc/letsencrypt/live/sync-gateway.sanchezrepuestos.com.ar/
```

### 6.4 Recargar Nginx

```bash
sudo systemctl reload nginx
```

### 6.5 Configurar Renovación Automática

Certbot configura un cronjob automáticamente. Verifica:

```bash
sudo systemctl status certbot.timer
```

Para probar la renovación:

```bash
sudo certbot renew --dry-run
```

## Paso 7: Configuración Inicial vía /setup

### 7.1 Acceder a la Interfaz Web

Abre en tu navegador:

```
https://sync-gateway.sanchezrepuestos.com.ar/setup
```

### 7.2 Completar Configuración

1. **PostgreSQL**: Ya configurado en `.env`
2. **JWT Secret**: Ya configurado en `.env`
3. **Esquema DB**: Ya ejecutado con `prisma:push`
4. **Crear Comercio**: Completa el formulario para crear el primer comercio

Anota las credenciales del comercio creado (username y password).

## Paso 8: Verificar Deployment

### 8.1 Health Check

```bash
curl https://sync-gateway.sanchezrepuestos.com.ar/health
```

Debe responder:
```json
{"status":"ok","timestamp":"2024-12-27T..."}
```

### 8.2 Test de Login

```bash
curl -X POST https://sync-gateway.sanchezrepuestos.com.ar/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "comercio123",
    "password": "tu-password"
  }'
```

Debe responder con un token JWT.

## Paso 9: Configurar Firewall (Opcional pero Recomendado)

```bash
# Permitir SSH
sudo firewall-cmd --permanent --add-service= 22/tcp

# Permitir HTTP y HTTPS
sudo firewall-cmd --permanent --add-service= 80/tcp
sudo firewall-cmd --permanent --add-service= 443/tcp

# Habilitar firewall
sudo firewall-cmd --reload

# Verificar status
sudo firewall-cmd --list-all
```

**Importante**: El puerto 3335 NO debe estar abierto en el firewall, solo debe ser accesible localmente.

## Paso 10: Monitoreo y Logs

### 10.1 Ver Logs de la Aplicación

```bash
sudo su - syncgateway
pm2 logs sync-gateway
```

### 10.2 Ver Logs de Nginx

```bash
# Access logs
sudo tail -f /var/log/nginx/sync-gateway.access.log

# Error logs
sudo tail -f /var/log/nginx/sync-gateway.error.log
```

### 10.3 Ver Logs del Sistema

```bash
sudo journalctl -u nginx -f
```

## Troubleshooting

### Error: "502 Bad Gateway"

**Causa**: El gateway no está corriendo en el puerto 3335.

**Solución**:
```bash
sudo su - syncgateway
pm2 status
pm2 restart sync-gateway
pm2 logs sync-gateway
```

### Error: "Cannot connect to database"

**Causa**: PostgreSQL no está corriendo o credenciales incorrectas.

**Solución**:
```bash
sudo systemctl status postgresql
# Verificar DATABASE_URL en .env
```

### Error: SSL no funciona

**Causa**: Certificado no instalado correctamente.

**Solución**:
```bash
sudo certbot certificates
sudo nginx -t
sudo systemctl reload nginx
```

### Error: "EADDRINUSE: Port already in use"

**Causa**: El puerto 3335 ya está en uso.

**Solución**:
```bash
sudo lsof -i :3335
# Matar el proceso que lo usa o cambiar el puerto en .env
```

## Actualización del Gateway

Para actualizar a una nueva versión:

```bash
sudo su - syncgateway
cd ~/objetiva-sync-gateway

# Detener el servicio
pm2 stop sync-gateway

# Actualizar código (si usas git)
git pull

# O transferir nueva versión y descomprimirla

# Instalar dependencias
npm install

# Recompilar
npm run build

# Aplicar migraciones de DB si hay
npm run prisma:push

# Reiniciar
pm2 restart sync-gateway

# Verificar
pm2 logs sync-gateway
```

## Configuración en Objetiva Sync (Cliente)

Una vez deployado el gateway, configura en **objetiva-sync** (cliente local):

1. Abre el dashboard: `http://localhost:3000`
2. Ve a **Configuración → API Remota**
3. Configura:
   - **URL**: `https://sync-gateway.sanchezrepuestos.com.ar`
   - **Username**: El username del comercio creado
   - **Password**: La contraseña del comercio
4. Prueba la conexión
5. Ejecuta una sincronización de prueba

## Seguridad Recomendada

1. ✅ **Siempre usar HTTPS** (ya configurado con Let's Encrypt)
2. ✅ **JWT Secret seguro** (64+ caracteres aleatorios)
3. ✅ **Firewall configurado** (solo puertos 22, 80, 443)
4. ✅ **PostgreSQL solo en localhost**
5. ✅ **Gateway solo en localhost** (proxy via Nginx)
6. ⚠️ **Backups regulares de la base de datos**
7. ⚠️ **Monitoreo de logs**
8. ⚠️ **Actualizar dependencias regularmente**

## Backups

### Backup Manual de PostgreSQL

```bash
sudo -u postgres pg_dump objetiva_sync_gateway > backup-$(date +%Y%m%d).sql
```

### Backup Automatizado (Cron)

```bash
sudo crontab -e
```

Agregar:
```
# Backup diario a las 2 AM
0 2 * * * /usr/bin/pg_dump objetiva_sync_gateway > /home/syncgateway/backups/backup-$(date +\%Y\%m\%d).sql
```

## URLs del Sistema

- **Gateway HTTPS**: https://sync-gateway.sanchezrepuestos.com.ar
- **Setup**: https://sync-gateway.sanchezrepuestos.com.ar/setup
- **Health Check**: https://sync-gateway.sanchezrepuestos.com.ar/health
- **Login**: https://sync-gateway.sanchezrepuestos.com.ar/auth/login

## Soporte

Para problemas o consultas:
- Revisar logs de PM2: `pm2 logs sync-gateway`
- Revisar logs de Nginx: `/var/log/nginx/sync-gateway.error.log`
- Verificar conectividad: `curl https://sync-gateway.sanchezrepuestos.com.ar/health`
