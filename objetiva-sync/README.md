# Objetiva Sync

Sincronizador unidireccional de datos que extrae información de artículos y comprobantes desde sistemas de gestión (ERPs, bases de datos, archivos) y los envía a un backend centralizado para analítica.

## Características

- **Agnóstico al origen**: Arquitectura de módulos/adaptadores que permite conectar cualquier fuente de datos
- **Sincronización flexible**: Por polling automático o manual desde dashboard
- **Dashboard HTMX**: Interfaz web para configuración, monitoreo y operaciones
- **Mapeo configurable**: Los campos se mapean visualmente desde la UI
- **Multi-comercio**: Una instancia por comercio, desplegable en múltiples clientes

## Stack Tecnológico

- **Backend**: Node.js v20+ con Fastify 5.x
- **Base de datos**: SQLite (better-sqlite3) con Drizzle ORM
- **Frontend**: HTMX 2.x + EJS + Tailwind CSS
- **Lenguaje**: TypeScript
- **Adaptadores**: SQL Server (otros en desarrollo)

## Instalación

### Requisitos

- Node.js v20 o superior
- npm o yarn

### Pasos

1. Clonar el repositorio:
```bash
git clone <repo-url>
cd objetiva-sync
```

2. Instalar dependencias:
```bash
npm install
```

3. Copiar archivo de configuración:
```bash
cp .env.example .env
```

4. Editar `.env` y configurar variables según necesidad

5. Ejecutar migraciones de base de datos:
```bash
npm run db:migrate
```

6. Iniciar en modo desarrollo:
```bash
npm run dev
```

7. Abrir navegador en `http://localhost:3000`

## Comandos Disponibles

```bash
# Desarrollo
npm run dev              # Iniciar en modo desarrollo con hot-reload
npm run build            # Compilar para producción
npm run start            # Iniciar en modo producción

# Base de datos
npm run db:generate      # Generar migraciones desde schema
npm run db:migrate       # Aplicar migraciones
npm run db:studio        # Abrir Drizzle Studio (explorador de DB)

# Servicio Windows
npm run service:install    # Instalar como servicio de Windows
npm run service:uninstall  # Desinstalar servicio

# Testing y Calidad
npm run test             # Ejecutar tests
npm run test:coverage    # Tests con coverage
npm run lint             # Ejecutar linter
npm run format           # Formatear código
```

## Estructura del Proyecto

```
objetiva-sync/
├── src/
│   ├── adapters/        # Adaptadores de fuentes de datos
│   ├── api-client/      # Cliente del backend remoto
│   ├── config/          # Configuración
│   ├── dashboard/       # UI con HTMX
│   ├── notifications/   # Servicios de notificación
│   ├── services/        # Servicios de dominio
│   ├── store/           # SQLite + Drizzle
│   ├── sync/            # Motor de sincronización
│   ├── types/           # Tipos TypeScript
│   └── utils/           # Utilidades
├── database/            # Archivos SQLite
├── docs/                # Documentación
├── scripts/             # Scripts de utilidad
└── tests/               # Tests
```

## Documentación

- [Arquitectura](./docs/ARQUITECTURA.md) - Stack y patrones
- [Base de Datos](./docs/DATABASE.md) - Esquema SQLite completo
- [API](./docs/API.md) - Documentación de endpoints
- [Reglas de IA](./docs/AI-RULES.md) - Procedimientos del proyecto
- [Decisiones](./docs/DECISIONES.md) - Decisiones arquitectónicas
- [Actividad](./docs/ACTIVIDAD.md) - Log de desarrollo
- [Pendientes](./docs/PENDIENTES.md) - Tareas por hacer

## Primer Inicio

1. Acceder a `http://localhost:3000`
2. Login con usuario: `admin` / password: (configurado en `.env`)
3. El sistema solicitará cambio de password
4. Configurar conexión a la fuente de datos (ERP)
5. Configurar conexión al backend remoto
6. Crear consultas SQL para cada entidad
7. Configurar mapeos de campos
8. Probar sincronización manual
9. Activar polling automático (opcional)

## Desarrollo

Este proyecto sigue las siguientes convenciones:

- **Naming**: kebab-case para archivos, camelCase para código, PascalCase para clases
- **Git**: Commits descriptivos, branches para features
- **Documentación**: Actualizar docs/ al hacer cambios importantes
- **Testing**: Tests para lógica crítica
- **Código**: TypeScript estricto, ESLint + Prettier

Ver [docs/AI-RULES.md](./docs/AI-RULES.md) para más detalles.

## Soporte

Para problemas o preguntas, revisar la documentación en `docs/` o consultar el log de actividad en `docs/ACTIVIDAD.md`.

## Licencia

ISC
