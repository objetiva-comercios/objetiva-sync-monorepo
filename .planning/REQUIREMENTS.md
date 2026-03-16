# Requirements: Objetiva Sync v1.2

**Defined:** 2026-03-04
**Core Value:** PostgreSQL schema changes propagate correctly through entire sync pipeline without breaking queries, validation, or data ingestion

## v1.2 Requirements

### Pre-Flight Validation

- [x] **PF-01**: Gateway valida todas las variables de entorno requeridas al arrancar y muestra errores específicos por cada variable faltante
- [x] **PF-02**: Gateway verifica conectividad a PostgreSQL antes de aceptar requests
- [x] **PF-03**: Gateway verifica existencia de las 4 tablas requeridas al arrancar
- [x] **PF-04**: Gateway expone `GET /api/setup/preflight` con checklist agregada de todas las validaciones (pass/fail + remediación por item)
- [x] **PF-05**: Escritura centralizada de .env con mutex y escape correcto de caracteres especiales (`$`, `#`, etc.)

### Setup Wizard

- [x] **WIZ-01**: Wizard paso a paso con gating (no avanza sin completar el paso anterior)
- [x] **WIZ-02**: Constructor visual de DATABASE_URL (host, port, user, password, database como campos separados)
- [x] **WIZ-03**: Configuración de dominio/subdominio Traefik (GATEWAY_PUBLIC_URL)
- [x] **WIZ-04**: Generación automática de JWT_SECRET (64 chars hex)
- [x] **WIZ-05**: Generación completa del archivo .env desde la wizard
- [x] **WIZ-06**: Download del .env generado como archivo

### Pairing

- [x] **PAIR-01**: Gateway genera código de enlace corto (6 caracteres, alfanumérico) con expiración de 10 minutos
- [x] **PAIR-02**: Sync consume código via `POST /api/pairing/claim` y recibe URL, JWT secret y credenciales
- [x] **PAIR-03**: Sync almacena automáticamente la configuración recibida en su config encriptada (SQLite)
- [x] **PAIR-04**: Código se invalida inmediatamente después de ser consumido (single-use)
- [x] **PAIR-05**: Rate limiting en endpoint de claim (unauthenticated) para prevenir brute force

### Sync Pairing Client

- [x] **SPC-01**: Campo de entrada de código de pairing en la configuración de API del sync dashboard
- [x] **SPC-02**: Botón de claim que ejecuta el intercambio y muestra resultado (éxito/error)
- [x] **SPC-03**: Verificación automática de conexión después de pairing exitoso

### Auth Simplification

- [ ] **AUTH-RM-01**: Gateway elimina rutas /auth/login, /auth/refresh, /api/auth/diagnostics, /api/auth/change-password
- [ ] **AUTH-RM-02**: Gateway elimina env vars SYNC_PASSWORD y SYNC_USERNAME de .env.example, generate-env, y preflight checks
- [ ] **AUTH-RM-03**: Pairing claim response retorna solo gatewayUrl + jwtSecret (sin syncPassword)
- [ ] **AUTH-RM-04**: POST /api/setup/token retorna JWT firmado durante setup-only mode, 403 después
- [ ] **AUTH-RM-05**: Setup wizard tiene 5 pasos (sin paso de password), renumerado correctamente
- [ ] **AUTH-RM-06**: AuthManager eliminado de sync; batch clients usan getJwtToken() directo
- [ ] **AUTH-RM-07**: Dashboard sync muestra estado de pairing (enlazado/no enlazado) en vez de token expiry
- [ ] **AUTH-RM-08**: Test Connection usa JWT firmado localmente contra /health (sin /auth/login)

## Future Requirements

### Pairing Enhancements

- **PAIR-F01**: QR code display alongside text code for mobile-friendly pairing
- **PAIR-F02**: Re-pairing flow (revoke existing pairing and generate new code)
- **PAIR-F03**: Multi-client pairing (multiple sync instances to one gateway)

### Setup Enhancements

- **WIZ-F01**: Setup access token shown in container logs for first-time security
- **WIZ-F02**: Automatic Let's Encrypt configuration for non-Tailscale deployments

## Out of Scope

| Feature | Reason |
|---------|--------|
| Sync-side setup wizard improvements | Sync dashboard setup is functional as-is; only pairing client added |
| Redis/persistent pairing code storage | In-memory Map sufficient for single-instance Docker container |
| OAuth/OIDC integration | Over-engineering for single-operator deployment |
| Dockerizing objetiva-sync (Windows) | Runs on Windows with SQL Server drivers; Docker adds complexity without value |
| Dashboard modernization (React/shadcn) | Rolled back in v1.1-rc2; separate milestone if revisited |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| PF-01 | Phase 18 | Complete |
| PF-02 | Phase 18 | Complete |
| PF-03 | Phase 18 | Complete |
| PF-04 | Phase 18 | Complete |
| PF-05 | Phase 18 | Complete |
| WIZ-01 | Phase 19 | Complete |
| WIZ-02 | Phase 19 | Complete |
| WIZ-03 | Phase 19 | Complete |
| WIZ-04 | Phase 19 | Complete |
| WIZ-05 | Phase 19 | Complete |
| WIZ-06 | Phase 19 | Complete |
| PAIR-01 | Phase 20 | Complete |
| PAIR-02 | Phase 20 | Complete |
| PAIR-03 | Phase 20 | Complete |
| PAIR-04 | Phase 20 | Complete |
| PAIR-05 | Phase 20 | Complete |
| SPC-01 | Phase 21 | Complete |
| SPC-02 | Phase 21 | Complete |
| SPC-03 | Phase 21 | Complete |
| AUTH-RM-01 | Phase 22 | Planned |
| AUTH-RM-02 | Phase 22 | Planned |
| AUTH-RM-03 | Phase 22 | Planned |
| AUTH-RM-04 | Phase 22 | Planned |
| AUTH-RM-05 | Phase 22 | Planned |
| AUTH-RM-06 | Phase 22 | Planned |
| AUTH-RM-07 | Phase 22 | Planned |
| AUTH-RM-08 | Phase 22 | Planned |

**Coverage:**
- v1.2 requirements: 27 total
- Mapped to phases: 27
- Unmapped: 0

---
*Requirements defined: 2026-03-04*
*Last updated: 2026-03-16 after Phase 22 planned*
