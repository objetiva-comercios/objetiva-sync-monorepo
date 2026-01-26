# Objetiva Sync Gateway

API Gateway para recibir y almacenar datos sincronizados desde **Objetiva Sync** en PostgreSQL.

## Inicio Rápido

### 1. Instalar Dependencias

```bash
cd objetiva-sync-gateway
npm install
```

### 2. Configuración Inicial (Interfaz Web)

Inicia el servidor y accede a la interfaz de configuración:

```bash
npm run dev
```

Luego abre en tu navegador:

```
http://localhost:3335/setup
```

La interfaz web te guiará paso a paso:

1. ✅ **Configurar PostgreSQL** - Prueba la conexión a tu base de datos
2. ✅ **Configurar JWT Secret** - Genera o configura el secret compartido
3. ✅ **Crear Esquema DB** - Ejecuta `prisma db push` automáticamente
4. ✅ **Crear Comercio** - Crea el primer usuario con contraseña segura

### 3. Listo

Una vez completada la configuración, el servidor estará listo para recibir sincronizaciones en el puerto **3335**.

## Dashboard de Monitoreo

Accede al dashboard de monitoreo en tiempo real:

```
http://localhost:3335/status
```

El dashboard muestra:
- ✅ Estado del sistema (PostgreSQL, JWT, uptime)
- 📊 Estadísticas de sincronizaciones (últimas 24h)
- 📈 Registros procesados (insertados/actualizados/fallidos)
- 💾 Datos en base de datos (comercios, artículos, comprobantes, pagos)
- 📝 Últimas sincronizaciones recibidas
- 🔄 Auto-actualización cada 30 segundos

**El servidor inicia incluso sin PostgreSQL configurado**, permitiéndote acceder a `/setup` para configurarlo.

## Stack Tecnológico

- **Framework**: Fastify 4
- **ORM**: Prisma
- **Validación**: Zod
- **Autenticación**: JWT
- **Base de datos**: PostgreSQL
- **Puerto**: 3335

## Endpoints API

### Autenticación
- `POST /auth/login` - Autenticación y obtención de token JWT

### Sincronización
- `POST /api/articulos/batch` - Recibir lote de artículos
- `POST /api/comprobantes/batch` - Recibir lote de comprobantes
- `POST /api/comprobantes/pagos/batch` - Recibir lote de pagos

### Monitoreo y Utilidades
- `GET /status` - Dashboard de monitoreo en tiempo real
- `GET /setup` - Interfaz de configuración inicial
- `GET /health` - Health check

## Documentación Completa

Para información detallada sobre:
- Modelos de base de datos
- Esquemas de validación
- Ejemplos de requests/responses
- Configuración manual
- Troubleshooting

Consulta **[SETUP.md](./SETUP.md)**

## Scripts NPM

- `npm run dev` - Modo desarrollo con hot-reload
- `npm run build` - Compilar TypeScript
- `npm start` - Iniciar en producción
- `npm run prisma:generate` - Generar Prisma Client
- `npm run prisma:push` - Sincronizar schema con DB
- `npm run prisma:studio` - Abrir interfaz visual de DB

## Importante

⚠️ El `JWT_SECRET` configurado debe ser **el mismo** que el usado en **objetiva-sync** para que los tokens sean válidos entre ambos sistemas.

## Licencia

MIT
