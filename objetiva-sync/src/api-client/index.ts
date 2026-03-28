/**
 * Cliente principal de la API remota
 * Agrupa todos los clientes de endpoints con autenticacion JWT
 */

import os from 'os';

/**
 * Generate stable source identifier for this sync client instance.
 * Format: hostname-default (hostname sanitized to alphanumeric + hyphens)
 *
 * Can be overridden via SYNC_SOURCE_ID environment variable for containerized deployments.
 */
export function generateSourceId(): string {
  // Allow environment override for containers/Kubernetes
  if (process.env.SYNC_SOURCE_ID) {
    return process.env.SYNC_SOURCE_ID;
  }

  // Generate from hostname
  const hostname = os.hostname()
    .replace(/[^a-zA-Z0-9-]/g, '-')  // Replace non-alphanumeric with hyphen
    .replace(/-+/g, '-')              // Collapse multiple hyphens
    .replace(/^-|-$/g, '')            // Remove leading/trailing hyphens
    .substring(0, 32);                // Limit length

  return `${hostname}-default`;
}

// Singleton source ID (generated once per process)
let _sourceId: string | null = null;

/**
 * Get the source ID for this sync client (cached).
 */
export function getSourceId(): string {
  if (!_sourceId) {
    _sourceId = generateSourceId();
  }
  return _sourceId;
}
import { ArticulosClient } from './articulos-client.js';
import { ComprobantesCabeceraClient } from './comprobantes-cabecera-client.js';
import { ComprobantesDetalleClient } from './comprobantes-detalle-client.js';
import { ComprobantesPagosClient } from './comprobantes-pagos-client.js';
import { getJwtToken } from '../services/gateway-client.js';
import { logger } from '../utils/logger.js';

/**
 * Configuración del cliente API
 */
export interface APIClientConfig {
  baseUrl: string;
}

/**
 * Cliente principal de la API
 * Maneja autenticación y proporciona acceso a todos los endpoints
 */
export class APIClient {
  public readonly articulos: ArticulosClient;
  public readonly comprobantes: ComprobantesCabeceraClient; // cabeceras
  public readonly comprobantesDetalle: ComprobantesDetalleClient;
  public readonly comprobantesPagos: ComprobantesPagosClient;

  private config: APIClientConfig;

  constructor(config: APIClientConfig) {
    // Normalize baseUrl by removing trailing slashes
    const normalizedBaseUrl = config.baseUrl.replace(/\/+$/, '');

    this.config = {
      ...config,
      baseUrl: normalizedBaseUrl
    };

    // Node 22 native fetch handles connection pooling internally
    this.articulos = new ArticulosClient(normalizedBaseUrl);
    this.comprobantes = new ComprobantesCabeceraClient(normalizedBaseUrl);
    this.comprobantesDetalle = new ComprobantesDetalleClient(normalizedBaseUrl);
    this.comprobantesPagos = new ComprobantesPagosClient(normalizedBaseUrl);
  }

  /**
   * Inicializa el cliente (verifica conectividad via JWT + /health)
   */
  async initialize(): Promise<void> {
    logger.info('[APIClient] Inicializando cliente API...');

    try {
      const token = await getJwtToken();
      const response = await fetch(`${this.config.baseUrl}/health`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(10_000),
      });

      if (!response.ok) {
        throw new Error(`Health check failed: HTTP ${response.status}`);
      }

      logger.info('[APIClient] Cliente API inicializado');
    } catch (error) {
      logger.error({ error }, '[APIClient] Error al inicializar cliente API');
      throw error;
    }
  }

  /**
   * Prueba la conexion a la API via JWT + endpoint protegido
   *
   * Two-step check:
   * 1. GET /health (unauthenticated) — verifies gateway is reachable
   * 2. POST /api/articulos/batch with empty payload — verifies JWT is accepted
   */
  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      logger.info('[APIClient] Probando conexion a API...');

      // Step 1: Check gateway is reachable (no auth needed)
      const healthResponse = await fetch(`${this.config.baseUrl}/health`, {
        signal: AbortSignal.timeout(10_000),
      });

      if (!healthResponse.ok) {
        return {
          success: false,
          message: `Gateway no disponible: HTTP ${healthResponse.status}`,
        };
      }

      // Step 2: Verify JWT against an authenticated endpoint
      const token = await getJwtToken();
      const authResponse = await fetch(`${this.config.baseUrl}/api/articulos/batch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ articulos: [] }),
        signal: AbortSignal.timeout(10_000),
      });

      if (authResponse.status === 401) {
        const data = await authResponse.json() as Record<string, any>;
        const errorCode = data.error || 'TOKEN_INVALID';
        return {
          success: false,
          message: `JWT rechazado por el gateway (${errorCode}). Re-ejecuta el pairing.`,
        };
      }

      if (!authResponse.ok) {
        return {
          success: false,
          message: `Gateway respondio con HTTP ${authResponse.status}`,
        };
      }

      logger.info('[APIClient] Test de conexion exitoso');

      return {
        success: true,
        message: 'Conexion exitosa. JWT valido.',
      };
    } catch (error) {
      logger.error({ error }, '[APIClient] Test de conexion fallido');

      return {
        success: false,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Obtiene informacion del cliente
   */
  getInfo(): { baseUrl: string } {
    return {
      baseUrl: this.config.baseUrl,
    };
  }
}

// Re-exportar clases para facilitar imports
export { ArticulosClient } from './articulos-client.js';
export { ComprobantesCabeceraClient } from './comprobantes-cabecera-client.js';
export { ComprobantesDetalleClient } from './comprobantes-detalle-client.js';
export { ComprobantesPagosClient } from './comprobantes-pagos-client.js';
