/**
 * Gestor de autenticación JWT con refresh automático
 */

import { fetch } from 'undici';
import { logger } from '../utils/logger.js';

/**
 * Interface para respuesta de login
 */
interface LoginResponse {
  success: boolean;
  token?: string;
  user?: {
    username: string;
  };
  message?: string;
}

/**
 * Gestor de autenticación con JWT
 * Maneja login, refresh automático de tokens y caché de tokens
 */
export class AuthManager {
  private baseUrl: string;
  private username: string;
  private password: string;

  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private tokenExpiresAt: number | null = null; // Timestamp en ms

  private isRefreshing: boolean = false;
  private refreshPromise: Promise<string> | null = null;

  /**
   * Margen de seguridad para refresh (5 minutos antes de expirar)
   */
  private readonly REFRESH_MARGIN_MS = 5 * 60 * 1000;

  constructor(baseUrl: string, username: string, password: string) {
    this.baseUrl = baseUrl.replace(/\/$/, ''); // Remover trailing slash
    this.username = username;
    this.password = password;
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
      });

      if (!response.ok) {
        throw new Error(`Login failed: ${response.status} ${response.statusText}`);
      }

      const data = (await response.json()) as LoginResponse;

      if (!data.success || !data.token) {
        throw new Error(`Login failed: ${data.message ?? 'Unknown error'}`);
      }

      // Guardar token (la gateway no proporciona refresh token)
      this.accessToken = data.token;
      this.refreshToken = null;

      // Establecer expiración por defecto (1 hora) ya que la gateway no proporciona expires_in
      const defaultExpiresInMs = 60 * 60 * 1000; // 1 hora
      this.tokenExpiresAt = Date.now() + defaultExpiresInMs;

      logger.info({
        username: data.user?.username,
        expiresAt: new Date(this.tokenExpiresAt).toISOString(),
      }, '[AuthManager] ✅ Login exitoso');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      logger.error({
        error,
        errorMessage,
        errorStack,
        baseUrl: this.baseUrl,
        username: this.username
      }, '[AuthManager] ❌ Error en login');
      this.clearTokens();
      throw error;
    }
  }

  /**
   * Refresca el access token usando el refresh token
   */
  private async refreshAccessToken(): Promise<string> {
    // Si ya hay un refresh en progreso, esperar a que termine
    if (this.isRefreshing && this.refreshPromise) {
      return this.refreshPromise;
    }

    this.isRefreshing = true;
    this.refreshPromise = this.doRefreshToken();

    try {
      const token = await this.refreshPromise;
      return token;
    } finally {
      this.isRefreshing = false;
      this.refreshPromise = null;
    }
  }

  /**
   * Realiza el refresh del token
   */
  private async doRefreshToken(): Promise<string> {
    if (!this.refreshToken) {
      throw new Error('No refresh token available. Login required.');
    }

    try {
      logger.info('[AuthManager] Refrescando access token...');

      const response = await fetch(`${this.baseUrl}/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.refreshToken}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Token refresh failed: ${response.status}`);
      }

      const data = (await response.json()) as LoginResponse;

      if (!data.success || !data.data) {
        throw new Error(`Token refresh failed: ${data.message ?? 'Unknown error'}`);
      }

      // Actualizar access token
      this.accessToken = data.data.access_token;

      // Actualizar expiración
      const expiresInMs = data.data.expires_in * 1000;
      this.tokenExpiresAt = Date.now() + expiresInMs;

      logger.info({
        expiresIn: data.data.expires_in,
      }, '[AuthManager] ✅ Token refrescado');

      return this.accessToken;
    } catch (error) {
      logger.error({ error }, '[AuthManager] ❌ Error al refrescar token');
      this.clearTokens();
      throw error;
    }
  }

  /**
   * Obtiene un token válido (refresca si es necesario)
   */
  async getToken(): Promise<string> {
    // Si no hay token, hacer login
    if (!this.accessToken) {
      await this.login();
      return this.accessToken!;
    }

    // Si el token está cerca de expirar, hacer login de nuevo (no hay refresh token)
    if (this.isTokenExpiringSoon()) {
      logger.info('[AuthManager] Token cerca de expirar, haciendo login nuevamente');
      await this.login();
      return this.accessToken!;
    }

    return this.accessToken;
  }

  /**
   * Verifica si el token está cerca de expirar
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
   * Verifica si hay un token válido
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
    this.refreshToken = null;
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
   * Obtiene el tiempo restante hasta la expiración (en segundos)
   */
  getTimeUntilExpiry(): number {
    if (!this.tokenExpiresAt) {
      return 0;
    }

    const timeMs = this.tokenExpiresAt - Date.now();
    return Math.max(0, Math.floor(timeMs / 1000));
  }
}
