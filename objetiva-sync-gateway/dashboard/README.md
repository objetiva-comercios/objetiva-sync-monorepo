# Gateway Dashboard

Dashboard moderno y distintivo para monitorear ingesta de datos en tiempo real del Objetiva Sync Gateway.

## Características

- **Métricas en Tiempo Real**: Visualización de registros recibidos, procesados y fallidos
- **Breakdown por Entidad**: Estadísticas detalladas para cada entidad (artículos, comprobantes, etc.)
- **Feed de Actividad en Vivo**: Stream de eventos en tiempo real
- **Historial de Lotes**: Operaciones recientes con detalles
- **Estado del Sistema**: Monitoreo de salud, CPU, memoria y conexiones
- **Actualización Automática**: Polling cada 2 segundos para datos frescos

## Diseño

**Estética "Digital Flow"**:
- Tipografía distintiva: IBM Plex Mono + Outfit
- Tema oscuro con gradientes fluidos
- Colores específicos por entidad
- Animaciones suaves y micro-interacciones
- Efectos de brillo y pulso en elementos activos

## Stack Tecnológico

- React 18 + TypeScript
- Vite (build tool)
- TailwindCSS (styling)
- shadcn/ui (componentes)
- Lucide React (iconos)

## Instalación

```bash
cd objetiva-sync-gateway/dashboard
npm install
```

## Desarrollo

```bash
npm run dev
```

El dashboard estará disponible en `http://localhost:3336`

La configuración de Vite incluye proxy automático a la API del gateway en `http://localhost:3335`

## Build

```bash
npm run build
```

Los archivos compilados estarán en `dist/`

## Integración con el Gateway

El dashboard hace polling a estos endpoints (actualmente usando datos mock):

- `GET /api/stats` - Estadísticas generales
- `GET /api/status` - Estado del sistema

Para conectar con datos reales, modifica `src/hooks/useGatewayData.ts` y reemplaza `generateMockStats()` con llamadas reales a la API.

## Personalización

### Colores por Entidad

Edita en `src/index.css`:

```css
--entity-articulos: 45 93% 58%;  /* Amarillo */
--entity-cabecera: 168 76% 42%;  /* Verde */
--entity-detalle: 262 83% 58%;   /* Púrpura */
--entity-pagos: 25 95% 53%;      /* Naranja */
```

### Intervalo de Actualización

Modifica en `src/hooks/useGatewayData.ts`:

```typescript
const POLL_INTERVAL = 2000 // milisegundos
```

## Estructura del Proyecto

```
dashboard/
├── src/
│   ├── components/
│   │   ├── ui/              # Componentes base (shadcn)
│   │   ├── Dashboard.tsx    # Dashboard principal
│   │   ├── MetricCard.tsx   # Tarjetas de métricas
│   │   ├── EntityCard.tsx   # Stats por entidad
│   │   ├── ActivityFeed.tsx # Feed de actividad
│   │   ├── BatchList.tsx    # Lista de lotes
│   │   └── SystemHealth.tsx # Estado del sistema
│   ├── hooks/
│   │   └── useGatewayData.ts # Hook para datos
│   ├── lib/
│   │   └── utils.ts          # Utilidades
│   ├── types/
│   │   └── index.ts          # Tipos TypeScript
│   ├── App.tsx
│   ├── main.tsx
│   └── index.css
├── index.html
├── vite.config.ts
├── tailwind.config.js
└── package.json
```

## Capturas

El dashboard presenta:

1. **Métricas Globales**: Cards con animaciones y efectos de brillo
2. **Stats por Entidad**: 4 tarjetas con códigos de color únicos
3. **Estado del Sistema**: Métricas de salud con indicadores visuales
4. **Activity Feed**: Stream en tiempo real de eventos
5. **Operaciones de Lote**: Historial con barras de progreso animadas

Cada elemento tiene animaciones de entrada escalonadas y efectos hover para una experiencia fluida y moderna.
