# Objetiva Sync Gateway - Guía de Configuración

## Descripción

API Gateway para recibir y almacenar datos sincronizados desde Objetiva Sync en PostgreSQL.

## Tecnologías

- **Framework**: Fastify 4
- **ORM**: Prisma
- **Validación**: Zod
- **Autenticación**: JWT
- **Base de datos**: PostgreSQL
- **Puerto**: 3335

## 🚀 Deployment en Servidor Remoto

**¿Necesitas deployar en un servidor de producción con Nginx + SSL?**

👉 Consulta la guía completa: **[DEPLOYMENT.md](./DEPLOYMENT.md)**

Incluye:
- Configuración de PostgreSQL en el servidor
- Setup de Nginx como proxy inverso
- Certificado SSL con Let's Encrypt
- PM2 para gestión de procesos
- Firewall y seguridad
- Backups automatizados

## Estructura del Proyecto

```
objetiva-sync-gateway/
├── prisma/
│   └── schema.prisma              # Modelos de base de datos
├── shared/schemas/                # Validación Zod compartida
│   ├── articulo.ts
│   ├── comprobante.ts
│   ├── pago.ts
│   └── index.ts
├── src/
│   ├── lib/                       # Utilidades
│   │   ├── prisma.ts             # Cliente Prisma singleton
│   │   └── logger.ts             # Pino logger
│   ├── middleware/
│   │   ├── auth.ts               # JWT authentication
│   │   └── error-handler.ts      # Manejo global de errores
│   ├── routes/                    # Endpoints API
│   │   ├── auth.ts               # POST /auth/login
│   │   ├── articulos.ts          # POST /api/articulos/batch
│   │   ├── comprobantes.ts       # POST /api/comprobantes/batch
│   │   ├── pagos.ts              # POST /api/comprobantes/pagos/batch
│   │   └── setup.ts              # GET /setup - Interfaz de configuración
│   ├── services/
│   │   └── ingestion.ts          # Lógica de upsert
│   ├── types/
│   │   └── index.ts              # Tipos TypeScript
│   ├── app.ts                     # Configuración Fastify
│   └── server.ts                  # Entry point
├── .env.example                   # Plantilla de variables de entorno
├── .env                           # Variables de entorno (git-ignored)
├── package.json
├── tsconfig.json
├── README.md                      # Documentación general
└── SETUP.md                       # Esta guía

```

## Instalación Rápida

### 1. Instalar Dependencias

```bash
cd objetiva-sync-gateway
npm install
```

### 2. Configuración Inicial con Interfaz Web

**Opción A: Configuración Automática (Recomendado)**

```bash
npm run dev
```

Luego abre en tu navegador: `http://localhost:3335/setup`

La interfaz web te permitirá:
- ✅ Configurar PostgreSQL y probar la conexión
- ✅ Generar y configurar JWT_SECRET automáticamente
- ✅ Crear el esquema de base de datos (prisma push)
- ✅ Crear el primer comercio con contraseña segura

**Opción B: Configuración Manual**

Ver sección "Configuración Manual" más abajo.

## Modelos de Base de Datos

### Comercio
Representa un comercio/cliente que sincroniza datos.

```prisma
model Comercio {
  id          String    @id @default(cuid())
  nombre      String
  cuit        String    @unique
  username    String    @unique
  password    String    # bcrypt hashed

  articulos   Articulo[]
  comprobantes Comprobante[]

  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
}
```

### Articulo
Productos o servicios del comercio.

```prisma
model Articulo {
  id          String    @id @default(cuid())
  comercioId  String
  sku         String
  nombre      String
  objeto      String    # 'producto' | 'servicio'
  precio      Decimal?
  rubro       String?

  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  @@unique([comercioId, sku])
}
```

### Comprobante
Comprobantes de venta (facturas, tickets, etc).

```prisma
model Comprobante {
  id                  String    @id @default(cuid())
  comercioId          String
  tipo                String
  comprobante         String    # Número único
  fecha               DateTime
  terceroNombre       String
  terceroDocumento    String?
  total               Decimal
  erpIdComprobante    String?

  detalles            ComprobanteDetalle[]
  pagos               ComprobantePago[]

  createdAt           DateTime  @default(now())
  updatedAt           DateTime  @updatedAt

  @@unique([comercioId, comprobante])
}
```

### ComprobanteDetalle
Líneas de detalle de cada comprobante.

```prisma
model ComprobanteDetalle {
  id                String      @id @default(cuid())
  comprobanteId     String
  lineaNumero       Int
  codigoArticulo    String
  nombreArticulo    String
  unidades          Decimal
  precioUnitario    Decimal
  total             Decimal

  comprobante       Comprobante @relation(onDelete: Cascade)

  createdAt         DateTime    @default(now())

  @@unique([comprobanteId, lineaNumero])
}
```

### ComprobantePago
Medios de pago utilizados en cada comprobante.

```prisma
model ComprobantePago {
  id              String      @id @default(cuid())
  comprobanteId   String
  medio           String
  monto           Decimal
  moneda          String      @default("ARS")
  tarjetaMarca    String?
  tarjetaCuotas   Int?

  comprobante     Comprobante @relation(onDelete: Cascade)

  createdAt       DateTime    @default(now())
}
```

## API Endpoints

### Autenticación

#### POST /auth/login
Autentica un comercio y retorna un JWT token.

**Request:**
```json
{
  "username": "comercio123",
  "password": "secret"
}
```

**Response (200):**
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "comercio": {
    "id": "cm4...",
    "nombre": "Mi Comercio",
    "cuit": "20-12345678-9",
    "username": "comercio123"
  }
}
```

**Response (401):**
```json
{
  "success": false,
  "error": "Credenciales inválidas"
}
```

### Artículos

#### POST /api/articulos/batch
Recibe un lote de artículos para insertar/actualizar.

**Headers:**
```
Authorization: Bearer <token>
Content-Type: application/json
```

**Request:**
```json
{
  "articulos": [
    {
      "sku": "ART001",
      "nombre": "Producto 1",
      "objeto": "producto",
      "precio": 1500.50,
      "rubro": "Electrónica"
    }
  ]
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Procesados 10 artículos",
  "result": {
    "total_received": 10,
    "inserted": 5,
    "updated": 5,
    "failed": 0
  }
}
```

**Response (207) - Parcialmente exitoso:**
```json
{
  "success": false,
  "message": "Procesados 8 artículos",
  "result": {
    "total_received": 10,
    "inserted": 5,
    "updated": 3,
    "failed": 2
  },
  "errors": [
    {
      "index": 3,
      "identifier": "ART004",
      "error": "Duplicate key",
      "code": "INGESTION_ERROR"
    }
  ]
}
```

### Comprobantes

#### POST /api/comprobantes/batch
Recibe un lote de comprobantes con sus detalles.

**Headers:**
```
Authorization: Bearer <token>
Content-Type: application/json
```

**Request:**
```json
{
  "comprobantes": [
    {
      "tipo": "Factura A",
      "comprobante": "0001-00000123",
      "fecha": "2024-12-25T10:30:00Z",
      "tercero_nombre": "Cliente SA",
      "tercero_documento": "30-12345678-9",
      "total": 5000.00,
      "erp_id_comprobante": "ERP-123",
      "detalles": [
        {
          "linea_numero": 1,
          "codigo_articulo": "ART001",
          "nombre_articulo": "Producto 1",
          "unidades": 2,
          "precio_unitario": 2500.00,
          "total": 5000.00
        }
      ]
    }
  ]
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Procesados 5 comprobantes",
  "result": {
    "total_received": 5,
    "inserted": 3,
    "updated": 2,
    "detalles_inserted": 15,
    "failed": 0
  }
}
```

### Pagos

#### POST /api/comprobantes/pagos/batch
Recibe un lote de pagos asociados a comprobantes existentes.

**Headers:**
```
Authorization: Bearer <token>
Content-Type: application/json
```

**Request:**
```json
{
  "pagos": [
    {
      "comprobante": "0001-00000123",
      "medio": "Efectivo",
      "monto": 3000.00,
      "moneda": "ARS"
    },
    {
      "comprobante": "0001-00000123",
      "medio": "Tarjeta",
      "monto": 2000.00,
      "moneda": "ARS",
      "tarjeta_marca": "Visa",
      "tarjeta_cuotas": 3
    }
  ]
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Procesados 10 pagos",
  "result": {
    "total_received": 10,
    "inserted": 10,
    "failed": 0
  }
}
```

**Response (207) - Con errores:**
```json
{
  "success": false,
  "message": "Procesados 8 pagos",
  "result": {
    "total_received": 10,
    "inserted": 8,
    "failed": 2
  },
  "errors": [
    {
      "index": 5,
      "identifier": "0001-00000999",
      "error": "Comprobante no encontrado",
      "code": "NOT_FOUND"
    }
  ]
}
```

### Health Check

#### GET /health
Verifica que el servidor está funcionando.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2024-12-25T15:30:00.000Z"
}
```

## Configuración Manual

Si prefieres configurar manualmente sin usar la interfaz `/setup`:

### 1. Configurar Variables de Entorno

```bash
cp .env.example .env
```

Edita `.env`:

```env
# Server
PORT=3335
NODE_ENV=development

# Database
DATABASE_URL="postgresql://user:password@localhost:5432/objetiva_db"

# JWT (debe coincidir con el secret de objetiva-sync)
JWT_SECRET=your-super-secret-key-here
JWT_EXPIRES_IN=86400

# Logging
LOG_LEVEL=info
```

### 2. Generar Prisma Client

```bash
npm run prisma:generate
```

### 3. Crear Esquema de Base de Datos

```bash
npm run prisma:push
```

### 4. Crear Comercio Manualmente

Conecta a PostgreSQL y ejecuta:

```sql
INSERT INTO comercios (id, nombre, cuit, username, password, "createdAt", "updatedAt")
VALUES (
  'cm4abc123',
  'Mi Comercio',
  '20-12345678-9',
  'comercio123',
  '$2a$10$hashedpasswordhere',  -- Usa bcrypt para generar el hash
  NOW(),
  NOW()
);
```

Para generar el hash bcrypt de una contraseña:

```javascript
const bcrypt = require('bcryptjs');
const hash = bcrypt.hashSync('tu-password', 10);
console.log(hash);
```

### 5. Iniciar el Servidor

```bash
npm run dev
```

## Scripts NPM Disponibles

- `npm run dev` - Inicia el servidor en modo desarrollo (con hot-reload)
- `npm run build` - Compila TypeScript a JavaScript
- `npm start` - Inicia el servidor en modo producción
- `npm run prisma:generate` - Genera Prisma Client
- `npm run prisma:push` - Sincroniza schema con la base de datos
- `npm run prisma:migrate` - Crea migraciones
- `npm run prisma:studio` - Abre Prisma Studio (interfaz visual para la DB)

## Seguridad

### JWT
- El `JWT_SECRET` debe ser una cadena aleatoria segura
- Debe ser **el mismo** que el configurado en `objetiva-sync` para que los tokens sean válidos
- Los tokens expiran según `JWT_EXPIRES_IN` (por defecto 24 horas)

### Passwords
- Todas las contraseñas se almacenan hasheadas con bcrypt
- Se usa cost factor de 10 para el hashing
- Nunca se almacenan contraseñas en texto plano

### CORS
- Configurado para aceptar credenciales
- En producción, configura dominios específicos

## Flujo de Sincronización

1. **Objetiva Sync** (cliente) ejecuta consultas SQL contra el ERP
2. Obtiene datos de artículos, comprobantes y pagos
3. Se autentica contra `/auth/login` con credenciales del comercio
4. Recibe un JWT token
5. Envía lotes de datos a `/api/articulos/batch`, `/api/comprobantes/batch`, `/api/comprobantes/pagos/batch`
6. **Objetiva Sync Gateway** valida, procesa y almacena en PostgreSQL
7. Retorna resultados (éxitos, actualizaciones, errores)

## Lógica de Ingesta

### Artículos
- **Upsert**: Si existe (por `comercioId` + `sku`), actualiza. Si no, inserta.

### Comprobantes
- **Upsert**: Si existe (por `comercioId` + `comprobante`), elimina detalles anteriores y actualiza con nuevos datos
- Los detalles se manejan en transacción para garantizar consistencia

### Pagos
- **Insert only**: Siempre inserta nuevos pagos
- Requiere que el comprobante exista previamente
- Si el comprobante no existe, retorna error `NOT_FOUND`

## Troubleshooting

### Error: "Prisma Client not generated"
```bash
npm run prisma:generate
```

### Error: "Cannot connect to database"
- Verifica que PostgreSQL esté corriendo
- Verifica credenciales en `DATABASE_URL`
- Verifica que la base de datos exista

### Error: "JWT malformed" o "Token inválido"
- Verifica que el `JWT_SECRET` coincida entre objetiva-sync y objetiva-sync-gateway
- Verifica que el token no haya expirado

### Error al insertar datos
- Verifica que el comercio exista en la base de datos
- Verifica que el token JWT sea válido
- Revisa los logs del servidor para más detalles

## Logs

El proyecto usa **Pino** para logging. En desarrollo, los logs se muestran con colores y formato legible.

Niveles de log:
- `debug` - Detalles de cada operación
- `info` - Operaciones importantes
- `warn` - Advertencias
- `error` - Errores

Configura el nivel en `.env`:
```env
LOG_LEVEL=debug  # Más detallado
LOG_LEVEL=info   # Normal (recomendado)
```

## Próximos Pasos

1. ✅ Completar configuración inicial vía `/setup`
2. ✅ Verificar conexión a PostgreSQL
3. ✅ Crear primer comercio
4. Configurar `objetiva-sync` para apuntar a este gateway
5. Realizar sincronización de prueba
6. Monitorear logs y métricas

## Soporte

Para reportar problemas o consultas, contacta al equipo de desarrollo.
