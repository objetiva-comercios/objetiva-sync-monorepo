/**
 * Cliente principal de la API remota
 * Agrupa AuthManager y todos los clientes de endpoints
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
import { AuthManager } from './auth.js';
import { ArticulosClient } from './articulos-client.js';
import { ComprobantesCabeceraClient } from './comprobantes-cabecera-client.js';
import { ComprobantesDetalleClient } from './comprobantes-detalle-client.js';
import { ComprobantesPagosClient } from './comprobantes-pagos-client.js';
import { logger } from '../utils/logger.js';

/**
 * Configuración del cliente API
 */
export interface APIClientConfig {
  baseUrl: string;
  username: string;
  password: string;
}

/**
 * Cliente principal de la API
 * Maneja autenticación y proporciona acceso a todos los endpoints
 */
export class APIClient {
  private authManager: AuthManager;
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

    // Inicializar AuthManager
    this.authManager = new AuthManager(normalizedBaseUrl, config.username, config.password, this.agent);

    // Inicializar clientes de endpoints con dispatcher compartido
    this.articulos = new ArticulosClient(normalizedBaseUrl, this.authManager, this.agent);
    this.comprobantes = new ComprobantesCabeceraClient(normalizedBaseUrl, this.authManager, this.agent);
    this.comprobantesDetalle = new ComprobantesDetalleClient(normalizedBaseUrl, this.authManager, this.agent);
    this.comprobantesPagos = new ComprobantesPagosClient(normalizedBaseUrl, this.authManager, this.agent);
  }

  /**
   * Inicializa el cliente (realiza login)
   */
  async initialize(): Promise<void> {
    logger.info('[APIClient] Inicializando cliente API...');

    try {
      await this.authManager.login();
      logger.info('[APIClient] ✅ Cliente API inicializado');
    } catch (error) {
      logger.error({ error }, '[APIClient] ❌ Error al inicializar cliente API');
      throw error;
    }
  }

  /**
   * Prueba la conexión a la API
   */
  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      logger.info('[APIClient] Probando conexión a API...');

      // Intentar login
      await this.authManager.login();

      // Verificar que el token es válido
      if (!this.authManager.hasValidToken()) {
        return {
          success: false,
          message: 'Login exitoso pero token inválido',
        };
      }

      logger.info('[APIClient] ✅ Test de conexión exitoso');

      return {
        success: true,
        message: 'Conexión exitosa. Token válido.',
      };
    } catch (error) {
      logger.error({ error }, '[APIClient] ❌ Test de conexión fallido');

      return {
        success: false,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Obtiene el token de autenticación actual
   */
  async getToken(): Promise<string> {
    return await this.authManager.getToken();
  }

  /**
   * Verifica si el cliente tiene un token válido
   */
  hasValidToken(): boolean {
    return this.authManager.hasValidToken();
  }

  /**
   * Limpia los tokens almacenados (logout)
   */
  logout(): void {
    this.authManager.clearTokens();
    logger.info('[APIClient] Logout realizado');
  }

  /**
   * Obtiene información del cliente
   */
  getInfo(): {
    baseUrl: string;
    hasValidToken: boolean;
    timeUntilExpiry: number;
  } {
    return {
      baseUrl: this.config.baseUrl,
      hasValidToken: this.authManager.hasValidToken(),
      timeUntilExpiry: this.authManager.getTimeUntilExpiry(),
    };
  }
}

// Re-exportar tipos y clases para facilitar imports
export { AuthManager } from './auth.js';
export { ArticulosClient } from './articulos-client.js';
export { ComprobantesCabeceraClient } from './comprobantes-cabecera-client.js';
export { ComprobantesDetalleClient } from './comprobantes-detalle-client.js';
export { ComprobantesPagosClient } from './comprobantes-pagos-client.js';
