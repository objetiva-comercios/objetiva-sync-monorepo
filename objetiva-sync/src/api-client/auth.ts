/**
 * Gestor de autenticacion JWT con refresh automatico
 */

import { fetch } from 'undici';
import type { Dispatcher } from 'undici';
import { logger } from '../utils/logger.js';

/**
 * Interface para respuesta de login
 */
interface LoginResponse {
  success: boolean;
  token?: string;
  expiresIn?: number; // seconds
  user?: {
    username: string;
  };
  message?: string;
}

/**
 * Interface para respuesta de refresh
 */
interface RefreshResponse {
  success: boolean;
  token?: string;
  expiresIn?: number; // seconds
  issuedAt?: string;
  error?: string;
  message?: string;
}

/**
 * Token status for dashboard display
 */
export interface TokenStatus {
  hasToken: boolean;
  isValid: boolean;
  expiresAt: string | null;
  expiresInSeconds: number;
  username: string | null;
}

/**
 * Gestor de autenticacion con JWT
 * Maneja login, refresh automatico de tokens y cache de tokens
 */
export class AuthManager {
  private baseUrl: string;
  private username: string;
  private password: string;
  private dispatcher?: Dispatcher;

  private accessToken: string | null = null;
  private tokenExpiresAt: number | null = null; // Timestamp en ms

  /**
   * Margen de seguridad para refresh (5 minutos antes de expirar)
   */
  private readonly REFRESH_MARGIN_MS = 5 * 60 * 1000;

  constructor(baseUrl: string, username: string, password: string, dispatcher?: Dispatcher) {
    this.baseUrl = baseUrl.replace(/\/$/, ''); // Remover trailing slash
    this.username = username;
    this.password = password;
    this.dispatcher = dispatcher;
  }

  /**
   * Realiza login y obtiene tokens JWT
   */
  async login(): Promise<void> {
    try {
      logger.info('[AuthManager] Iniciando login...');

      const response = await fetch(`${this.baseUrl}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: this.username,
          password: this.password,
        }),
        dispatcher: this.dispatcher,
      });

      if (!response.ok) {
        throw new Error(`Login failed: ${response.status} ${response.statusText}`);
      }

      const data = (await response.json()) as LoginResponse;

      if (!data.success || !data.token) {
        throw new Error(`Login failed: ${data.message ?? 'Unknown error'}`);
      }

      // Guardar token
      this.accessToken = data.token;

      // Use expiresIn from response if provided, otherwise default to 1 hour
      const expiresInMs = (data.expiresIn || 3600) * 1000;
      this.tokenExpiresAt = Date.now() + expiresInMs;

      logger.info({
        username: data.user?.username,
        expiresAt: new Date(this.tokenExpiresAt).toISOString(),
        expiresIn: data.expiresIn,
      }, '[AuthManager] Login exitoso');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      logger.error({
        error,
        errorMessage,
        errorStack,
        baseUrl: this.baseUrl,
        username: this.username
      }, '[AuthManager] Error en login');
      this.clearTokens();
      throw error;
    }
  }

  /**
   * Refreshes the token using /auth/refresh endpoint
   */
  private async refreshToken(): Promise<void> {
    if (!this.accessToken) {
      throw new Error('No token to refresh');
    }

    logger.info('[AuthManager] Refreshing token...');

    const response = await fetch(`${this.baseUrl}/auth/refresh`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json'
      },
      dispatcher: this.dispatcher,
    });

    if (!response.ok) {
      const data = await response.json() as RefreshResponse;
      throw new Error(`Refresh failed: ${data.error || response.statusText}`);
    }

    const data = await response.json() as RefreshResponse;

    if (!data.success || !data.token) {
      throw new Error(`Refresh failed: ${data.message || 'Unknown error'}`);
    }

    this.accessToken = data.token;
    // Use expiresIn from response, fallback to 1 hour
    const expiresInMs = (data.expiresIn || 3600) * 1000;
    this.tokenExpiresAt = Date.now() + expiresInMs;

    logger.info({
      expiresAt: new Date(this.tokenExpiresAt).toISOString(),
      expiresIn: data.expiresIn
    }, '[AuthManager] Token refreshed successfully');
  }

  /**
   * Obtiene un token valido (refresca si es necesario)
   */
  async getToken(): Promise<string> {
    // Si no hay token, hacer login
    if (!this.accessToken) {
      await this.login();
      return this.accessToken!;
    }

    // Si el token esta cerca de expirar, intentar refresh primero
    if (this.isTokenExpiringSoon()) {
      logger.info('[AuthManager] Token near expiration, attempting refresh');
      try {
        await this.refreshToken();
      } catch (refreshError) {
        // Refresh failed (token expired or other error), fall back to login
        logger.warn({ error: refreshError }, '[AuthManager] Refresh failed, falling back to login');
        await this.login();
      }
    }

    return this.accessToken!;
  }

  /**
   * Verifica si el token esta cerca de expirar
   */
  private isTokenExpiringSoon(): boolean {
    if (!this.tokenExpiresAt) {
      return true;
    }

    const now = Date.now();
    const timeUntilExpiry = this.tokenExpiresAt - now;

    return timeUntilExpiry <= this.REFRESH_MARGIN_MS;
  }

  /**
   * Verifica si hay un token valido
   */
  hasValidToken(): boolean {
    if (!this.accessToken || !this.tokenExpiresAt) {
      return false;
    }

    return !this.isTokenExpiringSoon();
  }

  /**
   * Limpia los tokens almacenados
   */
  clearTokens(): void {
    this.accessToken = null;
    this.tokenExpiresAt = null;
    logger.info('[AuthManager] Tokens cleared');
  }

  /**
   * Obtiene el access token actual (sin refresh)
   */
  getCurrentToken(): string | null {
    return this.accessToken;
  }

  /**
   * Obtiene el tiempo restante hasta la expiracion (en segundos)
   */
  getTimeUntilExpiry(): number {
    if (!this.tokenExpiresAt) {
      return 0;
    }

    const timeMs = this.tokenExpiresAt - Date.now();
    return Math.max(0, Math.floor(timeMs / 1000));
  }

  /**
   * Gets current token status for dashboard display
   */
  getTokenStatus(): TokenStatus {
    if (!this.accessToken) {
      return {
        hasToken: false,
        isValid: false,
        expiresAt: null,
        expiresInSeconds: 0,
        username: null
      };
    }

    const expiresInSeconds = this.getTimeUntilExpiry();
    const isValid = expiresInSeconds > 0;

    // Decode token to get username (without verification - just reading payload)
    let username: string | null = null;
    try {
      const payload = JSON.parse(
        Buffer.from(this.accessToken.split('.')[1], 'base64').toString()
      );
      username = payload.username || null;
    } catch {
      // Ignore decode errors
    }

    return {
      hasToken: true,
      isValid,
      expiresAt: this.tokenExpiresAt ? new Date(this.tokenExpiresAt).toISOString() : null,
      expiresInSeconds,
      username
    };
  }
}
