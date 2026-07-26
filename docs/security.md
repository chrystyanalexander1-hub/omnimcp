# Seguridad

## Autenticación

- **Sesión (panel web / apps)**: `POST /auth/login` con `{tenantId, email, password}`
  → JWT de acceso de vida corta (15 min, ver
  `packages/core-infrastructure/src/services/jwt-token-service.ts`) + refresh token
  opaco de 30 días, cuyo **hash** (nunca el valor) se guarda en `sessions`.
- **Programático (SDK, scripts, gateway MCP)**: `POST /api-keys` (requiere sesión)
  emite una API key de un solo uso visible — el servidor solo guarda su SHA-256, así
  que si la base se filtra las keys no son reutilizables directamente.
- `apps/rest-api/src/auth.ts` acepta ambos formatos en el mismo header
  `Authorization: Bearer <token>` y los resuelve a la misma identidad interna, para
  que las rutas nunca necesiten saber cuál se usó.

## Autorización

- Rol por tenant: `owner`/`admin` pueden instalar conectores, otorgar/revocar
  credenciales y ver auditoría; `member` no, a menos que reciba un `Permission`
  explícito para un conector puntual (`packages/core-domain/src/entities/permission.ts`).
- Cada ejecución de tool pasa obligatoriamente por
  `packages/core-application/src/use-cases/execute-tool.ts`, que valida instalación,
  permiso, y — si la tool es `sensitive` — exige confirmación explícita antes de
  reenviar la llamada al conector. No hay atajo que la evite.

## Credenciales de terceros

- Nunca se guardan en texto plano. `AesCryptoService`
  (`packages/core-infrastructure/src/services/aes-crypto-service.ts`) cifra con
  AES-256-GCM usando una clave derivada por tenant vía
  `HMAC-SHA256(masterKey, "tenant:<id>")` — un tenant comprometido no expone la clave
  de otro, y la clave maestra (`MASTER_ENCRYPTION_KEY`) nunca se usa directamente para
  cifrar datos.
- Se desencriptan solo en el momento exacto de despachar la llamada
  (`ExecuteTool`, paso 6), nunca antes, y solo dentro del proceso del gateway — jamás
  se le pasa el texto plano a la API REST ni se loguea.
- El proceso hijo de cada conector recibe el secreto **solo por variable de entorno**,
  y solo la suya — `ConnectorProcessManager` arma el `env` del proceso hijo desde una
  lista blanca (`INHERITED_ENV_KEYS`) que deliberadamente excluye
  `DATABASE_URL`, `JWT_SECRET`, `MASTER_ENCRYPTION_KEY`, `REDIS_URL`: un conector
  comprometido no puede leer los secretos del núcleo.

## Aislamiento multi-tenant

- Cada repositorio en `packages/core-infrastructure/src/repositories/` filtra
  explícitamente por `tenant_id` en cada query — esta es la capa que protege
  activamente los datos hoy.
- `infra/migrations/0001_init.sql` además define políticas de Row-Level Security como
  defensa en profundidad; requieren que la sesión de Postgres tenga seteado
  `app.tenant_id` (ver `withTenantScope` en
  `packages/core-infrastructure/src/db/client.ts`). Enchufar ese scope en cada request
  HTTP es un pendiente explícito — hoy no reemplaza al filtrado por `tenant_id`, lo
  complementa a futuro.
- `ConnectorProcessManager` mantiene procesos hijos separados por `(tenant, conector)`
  — nunca comparte un proceso (y por lo tanto nunca comparte una credencial en memoria)
  entre tenants.

## Auditoría

- `RecordAuditEvent` escribe un registro inmutable por cada intento de ejecutar una
  tool — éxito, denegación, error, o "esperando confirmación" — con un hash SHA-256 de
  los parámetros (nunca los parámetros en claro, que podrían contener datos
  sensibles) y sin PII más allá de los IDs internos.
- `GET /audit` (solo `owner`/`admin`) expone ese historial por tenant.

## Rate limiting

- `RedisRateLimiter` aplica una ventana fija por minuto por tenant
  (`RATE_LIMIT_PER_MINUTE`, default 120) antes de que `ExecuteTool` llegue a
  desencriptar ninguna credencial o tocar la red.

## Qué falta (ver también `docs/architecture.md`)

- 2FA/MFA en el login.
- Rotación automática de `MASTER_ENCRYPTION_KEY`.
- `withTenantScope` enchufado en cada request para que las políticas RLS estén
  activas de punta a punta.
- Escaneo de dependencias / SAST en CI (no hay pipeline de CI todavía en esta fase).
