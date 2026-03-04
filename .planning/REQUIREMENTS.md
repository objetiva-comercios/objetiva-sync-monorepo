# Requirements: Objetiva Sync v1.2

**Defined:** 2026-03-04
**Core Value:** PostgreSQL schema changes propagate correctly through entire sync pipeline without breaking queries, validation, or data ingestion

## v1.2 Requirements

### Pre-Flight Validation

- [ ] **PF-01**: Gateway valida todas las variables de entorno requeridas al arrancar y muestra errores específicos por cada variable faltante
- [ ] **PF-02**: Gateway verifica conectividad a PostgreSQL antes de aceptar requests
- [ ] **PF-03**: Gateway verifica existencia de las 4 tablas requeridas al arrancar
- [ ] **PF-04**: Gateway expone `GET /api/setup/preflight` con checklist agregada de todas las validaciones (pass/fail + remediación por item)
- [ ] **PF-05**: Escritura centralizada de .env con mutex y escape correcto de caracteres especiales (`$`, `#`, etc.)

### Setup Wizard

- [ ] **WIZ-01**: Wizard paso a paso con gating (no avanza sin completar el paso anterior)
- [ ] **WIZ-02**: Constructor visual de DATABASE_URL (host, port, user, password, database como campos separados)
- [ ] **WIZ-03**: Configuración de dominio/subdominio Traefik (GATEWAY_PUBLIC_URL)
- [ ] **WIZ-04**: Generación automática de JWT_SECRET (64 chars hex)
- [ ] **WIZ-05**: Generación completa del archivo .env desde la wizard
- [ ] **WIZ-06**: Download del .env generado como archivo

### Pairing

- [ ] **PAIR-01**: Gateway genera código de enlace corto (6 caracteres, alfanumérico) con expiración de 10 minutos
- [ ] **PAIR-02**: Sync consume código via `POST /api/pairing/claim` y recibe URL, JWT secret y credenciales
- [ ] **PAIR-03**: Sync almacena automáticamente la configuración recibida en su config encriptada (SQLite)
- [ ] **PAIR-04**: Código se invalida inmediatamente después de ser consumido (single-use)
- [ ] **PAIR-05**: Rate limiting en endpoint de claim (unauthenticated) para prevenir brute force

### Sync Pairing Client

- [ ] **SPC-01**: Campo de entrada de código de pairing en la configuración de API del sync dashboard
- [ ] **SPC-02**: Botón de claim que ejecuta el intercambio y muestra resultado (éxito/error)
- [ ] **SPC-03**: Verificación automática de conexión después de pairing exitoso

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
| PF-01 | — | Pending |
| PF-02 | — | Pending |
| PF-03 | — | Pending |
| PF-04 | — | Pending |
| PF-05 | — | Pending |
| WIZ-01 | — | Pending |
| WIZ-02 | — | Pending |
| WIZ-03 | — | Pending |
| WIZ-04 | — | Pending |
| WIZ-05 | — | Pending |
| WIZ-06 | — | Pending |
| PAIR-01 | — | Pending |
| PAIR-02 | — | Pending |
| PAIR-03 | — | Pending |
| PAIR-04 | — | Pending |
| PAIR-05 | — | Pending |
| SPC-01 | — | Pending |
| SPC-02 | — | Pending |
| SPC-03 | — | Pending |

**Coverage:**
- v1.2 requirements: 19 total
- Mapped to phases: 0
- Unmapped: 19 ⚠️

---
*Requirements defined: 2026-03-04*
*Last updated: 2026-03-04 after initial definition*
