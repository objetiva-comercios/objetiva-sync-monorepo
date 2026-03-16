/**
 * Cliente principal de la API remota
 * Agrupa todos los clientes de endpoints con autenticacion JWT
 */

import os from 'os';
import { Agent } from 'undici';

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
import { fetch } from 'undici';
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
  private agent: Agent;

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

    // Shared HTTP agent with connection pooling to prevent TCP exhaustion
    // Without this, each fetch() creates a new TCP connection, and after ~200+
    // sequential requests in 60s, Windows ephemeral ports get stuck in TIME_WAIT
    this.agent = new Agent({
      keepAliveTimeout: 30_000,     // Keep connections alive 30s between requests
      keepAliveMaxTimeout: 120_000, // Max 2 min keepalive
      connections: 10,              // Up to 10 connections per origin
      pipelining: 1,                // HTTP/1.1 pipelining
    });

    // Inicializar clientes de endpoints con dispatcher compartido
    this.articulos = new ArticulosClient(normalizedBaseUrl, this.agent);
    this.comprobantes = new ComprobantesCabeceraClient(normalizedBaseUrl, this.agent);
    this.comprobantesDetalle = new ComprobantesDetalleClient(normalizedBaseUrl, this.agent);
    this.comprobantesPagos = new ComprobantesPagosClient(normalizedBaseUrl, this.agent);
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
        dispatcher: this.agent,
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
   * Prueba la conexion a la API via JWT + /health
   */
  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      logger.info('[APIClient] Probando conexion a API...');

      const token = await getJwtToken();
      const response = await fetch(`${this.config.baseUrl}/health`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(10_000),
        dispatcher: this.agent,
      });

      if (!response.ok) {
        return {
          success: false,
          message: `Health check failed: HTTP ${response.status}`,
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
