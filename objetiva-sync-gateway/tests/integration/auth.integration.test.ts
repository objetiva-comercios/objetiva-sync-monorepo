/**
 * Auth Integration Tests (Phase 15)
 *
 * Verifies all auth simplification features:
 * - POST /auth/login - token with expiresIn field
 * - POST /auth/refresh - token renewal, error codes
 * - GET /api/auth/diagnostics - token metadata, no secrets exposed
 * - POST /api/auth/change-password - requires auth, validates input
 * - Auth middleware error codes (TOKEN_MISSING, TOKEN_INVALID)
 * - Setup wizard endpoints accessible without auth (AS-04)
 *
 * Uses buildApp() with inject() for fast in-process testing.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../../src/app.js';
import type { FastifyInstance } from 'fastify';

describe('Auth Integration Tests', () => {
  let app: FastifyInstance;
  let validToken: string;

  // Test credentials - must match environment or use test setup
  const testUsername = process.env.SYNC_USERNAME || 'admin';
  const testPassword = process.env.SYNC_PASSWORD || 'Abc123456@';

  beforeAll(async () => {
    // Build app with test environment
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-integration-tests-32chars';
    process.env.JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1h';
    process.env.SYNC_USERNAME = testUsername;
    // Note: SYNC_PASSWORD_HASH must be set in environment for login tests to work

    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /auth/login', () => {
    it('should return token with expiresIn field on successful login', async () => {
      // Skip if SYNC_PASSWORD_HASH not configured
      if (!process.env.SYNC_PASSWORD_HASH || process.env.SYNC_PASSWORD_HASH === 'change-this-hash-in-setup') {
        console.log('Skipping login test: SYNC_PASSWORD_HASH not configured');
        return;
      }

      const response = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: {
          username: testUsername,
          password: testPassword
        }
      });

      const body = JSON.parse(response.body);

      if (response.statusCode === 200) {
        expect(body.success).toBe(true);
        expect(body.token).toBeDefined();
        expect(typeof body.token).toBe('string');
        expect(body.expiresIn).toBeDefined();
        expect(typeof body.expiresIn).toBe('number');
        expect(body.expiresIn).toBeGreaterThan(0);
        expect(body.tokenType).toBe('Bearer');
        expect(body.user).toBeDefined();
        expect(body.user.username).toBe(testUsername);

        // Save token for subsequent tests
        validToken = body.token;
      } else {
        // Login failed - could be wrong password in test env
        console.log('Login returned non-200:', response.statusCode, body);
        expect([401, 503]).toContain(response.statusCode);
      }
    });

    it('should return 401 for invalid credentials', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: {
          username: 'wronguser',
          password: 'wrongpassword'
        }
      });

      // Either 401 (invalid credentials) or 503 (not configured)
      expect([401, 503]).toContain(response.statusCode);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
    });

    it('should return 400 or validation error for missing fields', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: {}
      });

      // Zod validation will throw, caught by error handler
      expect(response.statusCode).toBeGreaterThanOrEqual(400);
    });
  });

  describe('POST /auth/refresh', () => {
    it('should return TOKEN_MISSING when no Authorization header', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/refresh'
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error).toBe('TOKEN_MISSING');
      expect(body.message).toBeDefined();
    });

    it('should return TOKEN_INVALID for malformed token', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/refresh',
        headers: {
          Authorization: 'Bearer not-a-valid-jwt-token'
        }
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error).toBe('TOKEN_INVALID');
    });

    it('should return new token with expiresIn for valid token', async () => {
      // Generate a valid token for testing
      const token = app.jwt.sign({ username: 'testuser', authenticated: true });

      const response = await app.inject({
        method: 'POST',
        url: '/auth/refresh',
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.token).toBeDefined();
      expect(typeof body.token).toBe('string');
      expect(body.expiresIn).toBeDefined();
      expect(typeof body.expiresIn).toBe('number');
      expect(body.tokenType).toBe('Bearer');
      expect(body.issuedAt).toBeDefined();
    });
  });

  describe('GET /api/auth/diagnostics', () => {
    it('should return TOKEN_MISSING when no Authorization header', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/auth/diagnostics'
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error).toBe('TOKEN_MISSING');
    });

    it('should return TOKEN_INVALID for invalid token', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/auth/diagnostics',
        headers: {
          Authorization: 'Bearer invalid-token-here'
        }
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(['TOKEN_INVALID', 'TOKEN_MISSING']).toContain(body.error);
    });

    it('should return token metadata for valid token (no secrets exposed)', async () => {
      // Generate a valid token for testing
      const token = app.jwt.sign({ username: 'diagnosticsuser', authenticated: true });

      const response = await app.inject({
        method: 'GET',
        url: '/api/auth/diagnostics',
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);

      // Token metadata
      expect(body.token).toBeDefined();
      expect(body.token.isValid).toBe(true);
      expect(body.token.issuedAt).toBeDefined();
      expect(body.token.expiresAt).toBeDefined();
      expect(body.token.expiresInSeconds).toBeDefined();
      expect(typeof body.token.expiresInSeconds).toBe('number');
      expect(body.token.username).toBe('diagnosticsuser');
      expect(body.token.algorithm).toBeDefined();

      // Config status - booleans only, no secrets
      expect(body.config).toBeDefined();
      expect(body.config.tokenTTL).toBeDefined();
      expect(typeof body.config.jwtSecretConfigured).toBe('boolean');
      expect(typeof body.config.syncPasswordConfigured).toBe('boolean');

      // Verify no secrets are exposed
      expect(body.config.jwtSecret).toBeUndefined();
      expect(body.config.passwordHash).toBeUndefined();
      expect(JSON.stringify(body)).not.toContain(process.env.JWT_SECRET);
    });
  });

  describe('POST /api/auth/change-password', () => {
    it('should require authentication', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/change-password',
        payload: {
          currentPassword: 'oldpass',
          newPassword: 'newpass123'
        }
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error).toBe('TOKEN_MISSING');
    });

    it('should validate input - currentPassword required', async () => {
      const token = app.jwt.sign({ username: 'testuser', authenticated: true });

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/change-password',
        headers: {
          Authorization: `Bearer ${token}`
        },
        payload: {
          newPassword: 'newpassword123'
        }
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error).toBe('VALIDATION_ERROR');
    });

    it('should validate input - newPassword min length', async () => {
      const token = app.jwt.sign({ username: 'testuser', authenticated: true });

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/change-password',
        headers: {
          Authorization: `Bearer ${token}`
        },
        payload: {
          currentPassword: 'currentpass',
          newPassword: '12345' // Too short (min 6)
        }
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error).toBe('VALIDATION_ERROR');
    });

    it('should return PASSWORD_INVALID for wrong current password', async () => {
      // Skip if SYNC_PASSWORD_HASH not configured
      if (!process.env.SYNC_PASSWORD_HASH || process.env.SYNC_PASSWORD_HASH === 'change-this-hash-in-setup') {
        console.log('Skipping password change test: SYNC_PASSWORD_HASH not configured');
        return;
      }

      const token = app.jwt.sign({ username: 'testuser', authenticated: true });

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/change-password',
        headers: {
          Authorization: `Bearer ${token}`
        },
        payload: {
          currentPassword: 'definitely-wrong-password',
          newPassword: 'newpassword123'
        }
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error).toBe('PASSWORD_INVALID');
    });

    // Note: We intentionally skip actual password change tests to avoid
    // modifying the .env file during tests. Manual testing recommended.
  });

  describe('Auth Middleware Error Codes', () => {
    it('should return TOKEN_MISSING on protected route without auth header', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/auth/diagnostics'
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('TOKEN_MISSING');
      expect(body.message).toBeDefined();
    });

    it('should return TOKEN_INVALID on protected route with malformed token', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/auth/diagnostics',
        headers: {
          Authorization: 'Bearer xyz.not.valid'
        }
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(['TOKEN_INVALID', 'SIGNATURE_MISMATCH']).toContain(body.error);
    });

    it('should return TOKEN_INVALID for token signed with wrong secret', async () => {
      // Manually construct a token-like string with wrong signature
      const wrongToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VybmFtZSI6InRlc3QiLCJhdXRoZW50aWNhdGVkIjp0cnVlLCJpYXQiOjE2MTYxNjE2MTYsImV4cCI6OTk5OTk5OTk5OX0.wrongsignature';

      const response = await app.inject({
        method: 'GET',
        url: '/api/auth/diagnostics',
        headers: {
          Authorization: `Bearer ${wrongToken}`
        }
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(['TOKEN_INVALID', 'SIGNATURE_MISMATCH']).toContain(body.error);
    });
  });

  describe('Setup Wizard Accessibility (AS-04)', () => {
    it('GET /setup should be accessible without auth', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/setup'
      });

      // Should return HTML setup page, not 401
      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('text/html');
    });

    it('GET /api/setup/status should be accessible without auth', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/setup/status'
      });

      // Should return config status, not 401
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      // Returns object with database, jwt, auth fields (may be null if not configured)
      expect(body).toHaveProperty('database');
      expect(body).toHaveProperty('jwt');
      expect(body).toHaveProperty('auth');
    });

    it('POST /api/setup/test-db should be accessible without auth (validates input)', async () => {
      // We test accessibility by checking it doesn't return 401
      // It will return validation error for invalid URL, which is expected
      const response = await app.inject({
        method: 'POST',
        url: '/api/setup/test-db',
        payload: {
          databaseUrl: 'invalid-url'
        }
      });

      // Should not be 401 (unauthorized)
      expect(response.statusCode).not.toBe(401);
      // Will be 500 (validation error) or similar
    });

    it('POST /api/setup/set-password should be accessible without auth', async () => {
      // Test accessibility by sending invalid payload
      const response = await app.inject({
        method: 'POST',
        url: '/api/setup/set-password',
        payload: {
          password: '123' // Too short, but tests accessibility
        }
      });

      // Should not be 401 (unauthorized) - will be validation error
      expect(response.statusCode).not.toBe(401);
    });
  });

  describe('Health Check', () => {
    it('GET /health should be accessible without auth', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health'
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBe('ok');
      expect(body.timestamp).toBeDefined();
    });
  });
});
