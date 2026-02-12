# Phase 15: Auth Simplification - Research

**Researched:** 2026-02-12
**Domain:** JWT Authentication, Token Refresh, bcrypt Password Management
**Confidence:** HIGH

## Summary

This phase focuses on improving the authentication experience in the objetiva-sync-monorepo. The existing system uses @fastify/jwt (backed by fast-jwt) for token management and bcryptjs for password hashing. The main gaps are: (1) no token refresh mechanism for long-running syncs, (2) no auth diagnostics endpoint, (3) generic error messages that don't help troubleshooting, and (4) manual bcrypt hash generation required for initial setup.

The codebase already has a solid foundation with:
- `@fastify/jwt` v7.2.4 for JWT signing/verification (gateway)
- `fast-jwt` for token creation (sync client)
- `bcryptjs` v2.4.3 / `bcrypt` v5.1.1 for password hashing
- Existing `/setup` wizard that generates passwords programmatically

**Primary recommendation:** Add a `/auth/refresh` endpoint to the gateway that issues new tokens before expiration, implement proactive token refresh in AuthManager, and enhance error messages with specific failure codes.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @fastify/jwt | 7.2.4 | JWT signing, verification, decode | Already in use, official Fastify plugin, uses fast-jwt internally |
| fast-jwt | (via @fastify/jwt) | Token operations | High performance, caching, detailed error codes |
| bcryptjs | 2.4.3 | Password hashing (gateway) | Pure JS, works everywhere, no native deps |
| bcrypt | 5.1.1 | Password hashing (sync client) | Native, faster for heavy use |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| crypto (node built-in) | - | Secure random generation | JWT secret generation, tokens |
| zod | 3.x | Request validation | All auth endpoint inputs |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| bcryptjs | argon2 | argon2 is newer/stronger but adds native dependency |
| fast-jwt | jose | jose is standards-compliant but slower |

**Installation:**
No new dependencies needed - all libraries already installed.

## Architecture Patterns

### Current Auth Architecture

```
objetiva-sync-gateway/
  src/routes/auth.ts          # POST /auth/login (JWT token issuance)
  src/routes/setup.ts         # /setup wizard (generates bcrypt hashes)
  src/middleware/auth.ts      # request.jwtVerify() middleware

objetiva-sync/
  src/api-client/auth.ts      # AuthManager (token handling, auto-refresh)
  src/services/auth-service.ts # Dashboard session auth
  src/services/gateway-client.ts # JWT generation for gateway calls
```

### Recommended New Structure

```
objetiva-sync-gateway/
  src/routes/auth.ts          # ADD: POST /auth/refresh, GET /api/auth/diagnostics
                              # ENHANCE: Specific error codes on login failure

objetiva-sync/
  src/api-client/auth.ts      # ENHANCE: Proactive refresh calling /auth/refresh
                              # ADD: Token status methods
```

### Pattern 1: Token Refresh Endpoint

**What:** Server-side endpoint that issues a new access token when current one is near expiration
**When to use:** Long-running sync operations (>30 min) that would exceed token TTL

```typescript
// Gateway: /auth/refresh endpoint
// Source: Fastify JWT best practices
app.post('/auth/refresh', async (request, reply) => {
  try {
    // Verify current token (may be near expiration but still valid)
    await request.jwtVerify();

    // Issue new token with same claims, fresh expiration
    const newToken = app.jwt.sign({
      username: request.user.username,
      authenticated: true
    });

    // Return with metadata
    return {
      success: true,
      token: newToken,
      expiresIn: 3600, // seconds
      issuedAt: new Date().toISOString()
    };
  } catch (err) {
    // Handle expired token differently - require re-auth
    return reply.status(401).send({
      success: false,
      error: 'TOKEN_EXPIRED',
      message: 'Token expired, please login again'
    });
  }
});
```

### Pattern 2: Auth Diagnostics Endpoint

**What:** Endpoint that exposes non-sensitive token/auth state for troubleshooting
**When to use:** Debugging auth issues without exposing secrets

```typescript
// Gateway: GET /api/auth/diagnostics
// Source: Microsoft Identity Platform patterns
app.get('/api/auth/diagnostics', { preHandler: [authenticate] }, async (request, reply) => {
  const token = request.headers.authorization?.replace('Bearer ', '');
  const decoded = app.jwt.decode(token, { complete: true });

  return {
    success: true,
    token: {
      isValid: true,
      issuedAt: decoded.payload.iat ? new Date(decoded.payload.iat * 1000).toISOString() : null,
      expiresAt: decoded.payload.exp ? new Date(decoded.payload.exp * 1000).toISOString() : null,
      expiresInSeconds: decoded.payload.exp ? decoded.payload.exp - Math.floor(Date.now() / 1000) : null,
      username: decoded.payload.username,
      algorithm: decoded.header.alg
    },
    config: {
      tokenTTL: process.env.JWT_EXPIRES_IN || '24h',
      jwtSecretConfigured: !!process.env.JWT_SECRET,
      syncPasswordConfigured: process.env.SYNC_PASSWORD_HASH !== 'change-this-hash-in-setup'
    }
  };
});
```

### Pattern 3: Specific Auth Error Messages

**What:** Error responses that identify exact failure cause
**When to use:** All auth endpoints for clear troubleshooting

```typescript
// Source: fast-jwt TOKEN_ERROR_CODES pattern
const AUTH_ERROR_CODES = {
  TOKEN_EXPIRED: 'Token has expired - refresh or login again',
  TOKEN_INVALID: 'Token format is invalid or malformed',
  TOKEN_MISSING: 'Authorization header missing or empty',
  SIGNATURE_MISMATCH: 'Token signature invalid - check JWT_SECRET matches',
  PASSWORD_INVALID: 'Incorrect password',
  USER_NOT_FOUND: 'Username not found',
  SYSTEM_NOT_CONFIGURED: 'Auth system not configured - run /setup first',
  SECRET_MISMATCH: 'Gateway JWT_SECRET does not match sync client secret'
} as const;

// In auth middleware
export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  const authHeader = request.headers.authorization;

  if (!authHeader) {
    return reply.status(401).send({
      success: false,
      error: 'TOKEN_MISSING',
      message: AUTH_ERROR_CODES.TOKEN_MISSING
    });
  }

  try {
    await request.jwtVerify();
  } catch (err) {
    // Identify specific error type
    if (err.code === 'FST_JWT_AUTHORIZATION_TOKEN_EXPIRED') {
      return reply.status(401).send({
        success: false,
        error: 'TOKEN_EXPIRED',
        message: AUTH_ERROR_CODES.TOKEN_EXPIRED
      });
    }
    // ... handle other error codes
  }
}
```

### Pattern 4: Proactive Token Refresh in AuthManager

**What:** Client-side token refresh before expiration during long syncs
**When to use:** AuthManager.getToken() calls

```typescript
// Source: Current AuthManager with enhancement
class AuthManager {
  private readonly REFRESH_MARGIN_MS = 5 * 60 * 1000; // 5 minutes before expiry

  async getToken(): Promise<string> {
    if (!this.accessToken) {
      await this.login();
      return this.accessToken!;
    }

    if (this.isTokenExpiringSoon()) {
      // NEW: Try refresh endpoint first, fall back to re-login
      try {
        await this.refreshToken();
      } catch (refreshError) {
        logger.warn('[AuthManager] Refresh failed, attempting full login');
        await this.login();
      }
    }

    return this.accessToken!;
  }

  private async refreshToken(): Promise<void> {
    const response = await fetch(`${this.baseUrl}/auth/refresh`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Refresh failed: ${response.status}`);
    }

    const data = await response.json();
    this.accessToken = data.token;
    this.tokenExpiresAt = Date.now() + (data.expiresIn * 1000);
  }
}
```

### Anti-Patterns to Avoid

- **Generic error messages:** "Credenciales invalidas" tells nothing - always use specific error codes
- **Storing tokens in localStorage:** Already avoided - keep using in-memory with refresh
- **Long-lived tokens without refresh:** Current 24h tokens can expire mid-sync
- **Manual bcrypt CLI generation:** Setup wizard already avoids this, ensure it's complete
- **Exposing JWT_SECRET in diagnostics:** Only expose config booleans, never actual secrets

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Password hashing | Custom hash function | bcrypt/bcryptjs | Proven algorithm, proper salt handling |
| JWT creation | Manual base64 encoding | fast-jwt/jsonwebtoken | Handles algorithm, expiry, claims correctly |
| Token decoding | Manual parsing | app.jwt.decode() | Handles all formats, validates structure |
| Secure random | Math.random() | crypto.randomBytes() | Cryptographically secure |
| Token expiry check | Manual date math | fast-jwt verifier | Handles clock skew, nbf, exp properly |

**Key insight:** JWT and password security have many edge cases (timing attacks, clock skew, algorithm confusion). Libraries handle these; hand-rolled solutions invariably miss something.

## Common Pitfalls

### Pitfall 1: Token Expiration During Long Syncs

**What goes wrong:** A 45-minute sync starts with valid token, token expires at 30 min, subsequent batch uploads fail with 401
**Why it happens:** Current 24h token TTL seems safe, but default may be shorter in prod. Also, token refresh relies on re-login which may fail if network hiccups during sync.
**How to avoid:**
- Implement `/auth/refresh` endpoint
- Call `getToken()` before each batch upload, not just at sync start
- AuthManager already has proactive refresh margin (5 min), ensure it works
**Warning signs:** Syncs that complete locally but fail on "random" batches

### Pitfall 2: JWT_SECRET Mismatch Between Services

**What goes wrong:** Gateway signs tokens with one secret, sync client creates tokens with different secret (or vice versa)
**Why it happens:** Two services, same env var name, different .env files or deployment configs
**How to avoid:**
- Diagnostics endpoint should verify secret match (test decode of gateway-issued token)
- Error messages should explicitly mention "check JWT_SECRET matches between services"
**Warning signs:** Auth works in dev (same machine), fails in prod (different machines)

### Pitfall 3: Generic "Invalid Credentials" Messages

**What goes wrong:** User can't tell if username wrong, password wrong, or system misconfigured
**Why it happens:** Security "best practice" from 2000s was to hide failure reason
**How to avoid:** Modern approach: specific errors for different failure modes. Brute force protection is via rate limiting, not obscurity.
**Warning signs:** Support tickets asking "what does this error mean?"

### Pitfall 4: Setup Wizard Incomplete State

**What goes wrong:** User runs setup, misses a step, system appears configured but auth fails
**Why it happens:** Current setup wizard has 4 steps that can be done in any order
**How to avoid:**
- Status endpoint shows clear checklist of what's configured/missing
- Auth diagnostics shows "SYSTEM_NOT_CONFIGURED" with specific missing pieces
**Warning signs:** "Setup completado" but login fails

### Pitfall 5: Password Change Without Current Password Verification

**What goes wrong:** If session is hijacked, attacker can change password
**Why it happens:** Current change-password doesn't require current password
**How to avoid:** Require current password for password change (AS-06 explicitly mentions this)
**Warning signs:** Password changed without user's knowledge

## Code Examples

Verified patterns from official sources:

### Decoding JWT to Get Expiration (fast-jwt)

```typescript
// Source: fast-jwt documentation
import { createDecoder } from 'fast-jwt';

const decode = createDecoder({ complete: true });

function getTokenInfo(token: string): { expiresAt: Date | null; username: string | null } {
  try {
    const decoded = decode(token);
    return {
      expiresAt: decoded.payload.exp ? new Date(decoded.payload.exp * 1000) : null,
      username: decoded.payload.username || null
    };
  } catch {
    return { expiresAt: null, username: null };
  }
}
```

### Password Hashing with bcryptjs (Programmatic)

```typescript
// Source: bcryptjs documentation
import bcrypt from 'bcryptjs';

// Async (recommended for server)
async function hashPassword(password: string): Promise<string> {
  const saltRounds = 12; // 2-3 hashes/sec, good security
  return bcrypt.hash(password, saltRounds);
}

async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// Secure password generation
import { randomBytes } from 'crypto';

function generateSecurePassword(length: number = 32): string {
  return randomBytes(length).toString('base64').slice(0, length);
}
```

### fastify/jwt Error Handling

```typescript
// Source: @fastify/jwt documentation
import type { FastifyRequest, FastifyReply } from 'fastify';

export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.jwtVerify();
  } catch (err: any) {
    // @fastify/jwt error codes
    const errorMap: Record<string, { status: number; code: string; message: string }> = {
      'FST_JWT_AUTHORIZATION_TOKEN_EXPIRED': {
        status: 401,
        code: 'TOKEN_EXPIRED',
        message: 'Token has expired, please refresh or login again'
      },
      'FST_JWT_AUTHORIZATION_TOKEN_INVALID': {
        status: 401,
        code: 'TOKEN_INVALID',
        message: 'Token format is invalid or signature mismatch'
      },
      'FST_JWT_NO_AUTHORIZATION_IN_HEADER': {
        status: 401,
        code: 'TOKEN_MISSING',
        message: 'Authorization header is required'
      }
    };

    const errorInfo = errorMap[err.code] || {
      status: 401,
      code: 'AUTH_FAILED',
      message: err.message || 'Authentication failed'
    };

    return reply.status(errorInfo.status).send({
      success: false,
      error: errorInfo.code,
      message: errorInfo.message
    });
  }
}
```

### Token Refresh Response Structure

```typescript
// Source: Auth0 and JWT best practices
interface TokenRefreshResponse {
  success: boolean;
  token: string;
  expiresIn: number;      // seconds until expiry
  issuedAt: string;       // ISO timestamp
  tokenType: 'Bearer';    // Always Bearer for JWT
}

// In /auth/refresh handler
return reply.send({
  success: true,
  token: newToken,
  expiresIn: 3600,
  issuedAt: new Date().toISOString(),
  tokenType: 'Bearer'
} satisfies TokenRefreshResponse);
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Long-lived tokens (24h+) | Short access + refresh tokens | 2020+ | Better security, seamless UX |
| Generic auth errors | Specific error codes | 2022+ | Better troubleshooting |
| CLI bcrypt hash gen | Programmatic in setup wizard | Always available | Better UX |
| Session-only auth | JWT + session hybrid | Current | Supports both API and dashboard |

**Deprecated/outdated:**
- `jsonwebtoken` synchronous methods: Use async or fast-jwt for better performance
- Storing refresh tokens in cookies only: HTTP-only cookies are secure, but consider token rotation

## Open Questions

Things that couldn't be fully resolved:

1. **Token rotation on refresh**
   - What we know: Security best practice is to rotate tokens on each refresh
   - What's unclear: Does the current use case warrant full rotation (adds complexity)?
   - Recommendation: Implement simple refresh first (AS-01), add rotation later if needed

2. **Rate limiting on auth endpoints**
   - What we know: Specific error messages could enable enumeration attacks
   - What's unclear: Is rate limiting already implemented? Need to check
   - Recommendation: Verify rate limiting exists before exposing specific errors

3. **Token expiration alignment**
   - What we know: Gateway JWT_EXPIRES_IN and AuthManager assumptions may diverge
   - What's unclear: Should refresh response include actual expiry from token or use config?
   - Recommendation: Include expiresIn in response, decode token to get actual exp claim

## Sources

### Primary (HIGH confidence)
- @fastify/jwt GitHub README - sign, verify, decode methods
- fast-jwt npm documentation - TOKEN_ERROR_CODES, createDecoder
- bcryptjs npm documentation - hash, compare, salt rounds
- Existing codebase auth implementation (verified by reading)

### Secondary (MEDIUM confidence)
- [JWT Authentication With Refresh Tokens - GeeksforGeeks](https://www.geeksforgeeks.org/node-js/jwt-authentication-with-refresh-tokens/)
- [Auth0 Token Best Practices](https://auth0.com/docs/secure/tokens/token-best-practices)
- [fastify/fastify-jwt GitHub](https://github.com/fastify/fastify-jwt)
- [fast-jwt GitHub](https://github.com/nearform/fast-jwt)

### Tertiary (LOW confidence)
- [JWT Token Lifecycle Management](https://skycloak.io/blog/jwt-token-lifecycle-management-expiration-refresh-revocation-strategies/) - general patterns

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - already in use, just enhancing
- Architecture: HIGH - patterns verified with official docs and existing code
- Pitfalls: HIGH - based on actual codebase analysis and known JWT issues

**Research date:** 2026-02-12
**Valid until:** 2026-03-12 (30 days - stable domain, no breaking changes expected)
