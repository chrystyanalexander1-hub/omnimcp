# Arquitectura de OmniMCP AI

## Visión general

OmniMCP AI es un **gateway/agregador de servidores MCP**. Cada integración externa
(GitHub, Google Drive, y en el futuro Meta Ads, Shopify, Slack, etc.) es su propio
servidor MCP independiente — un proceso separado, en cualquier lenguaje, hablando el
protocolo MCP estándar por stdio. El núcleo de OmniMCP (`apps/mcp-gateway` y
`apps/rest-api`) no contiene lógica específica de ninguna plataforma externa: solo
sabe descubrir conectores por su manifiesto, autenticar, autorizar, limitar tasa,
auditar, y reenviar la llamada.

```
                         ┌────────────────────────┐
 Cliente de IA  ───MCP──▶│      apps/mcp-gateway   │
 (Claude, etc.)          │  (un proceso por sesión │
                         │   de usuario, stdio)    │
                         └───────────┬─────────────┘
                                     │ usa
                         ┌───────────▼─────────────┐
 Panel web / SDK ──HTTP─▶│      apps/rest-api      │
                         │  (multi-usuario, HTTP)  │
                         └───────────┬─────────────┘
                                     │ ambos reutilizan
                         ┌───────────▼─────────────┐
                         │  packages/core-application │  ← casos de uso (Clean Architecture)
                         └───────────┬─────────────┘
                                     │ implementado por
                         ┌───────────▼─────────────┐
                         │ packages/core-infrastructure│ ← Postgres, Redis, JWT, AES-256-GCM,
                         └───────────┬─────────────┘    ConnectorProcessManager
                                     │ spawnea (stdio, un proceso por tenant+conector)
                    ┌────────────────┼────────────────┐
                    ▼                                  ▼
         connectors/github                 connectors/google-drive
         (servidor MCP propio)              (servidor MCP propio, OAuth2+PKCE)
```

## Por qué un gateway de MCPs y no un monolito de plugins

- **Poliglota de verdad**: un conector nuevo puede escribirse en Python, Go, lo que
  sea — solo tiene que hablar MCP. `packages/connector-sdk-ts` es una conveniencia
  para conectores en TypeScript, no un requisito.
- **Sin tocar el núcleo**: registrar un conector es agregar una carpeta con un
  `connector.manifest.json` bajo `CONNECTORS_DIR`. `apps/mcp-gateway` y
  `apps/rest-api` no cambian.
- **Aislamiento por tenant real**: `ConnectorProcessManager`
  (`packages/core-infrastructure/src/services/connector-process-manager.ts`) mantiene
  **un proceso hijo por combinación (tenant, conector)**, nunca uno compartido — así
  el token de un tenant nunca puede terminar en la llamada de otro tenant, ni siquiera
  por un bug de concurrencia.
- **Aislamiento de fallos**: si un conector crashea, el gateway lo detecta (la llamada
  falla), lo saca del pool y lo vuelve a levantar en la siguiente llamada — no tumba
  el resto del sistema.

## Capas (Clean Architecture)

| Capa | Paquete | Contenido |
|---|---|---|
| Dominio | `packages/core-domain` | Entidades (`Tenant`, `User`, `Connector`, `CredentialGrant`, `AuditEvent`, ...), invariantes, errores tipados. Cero dependencias externas. |
| Aplicación | `packages/core-application` | Casos de uso (`ExecuteTool`, `AuthenticateUser`, `GrantConnectorCredential`, ...) y los *ports* (interfaces) que necesitan — repositorios y servicios. No sabe qué es Postgres ni Redis. |
| Infraestructura | `packages/core-infrastructure` | Implementaciones concretas de esos ports: repositorios Postgres (Drizzle), `RedisRateLimiter`, `AesCryptoService`, `JwtTokenService`, `ConnectorProcessManager`. Expone `createAppContext()` como *composition root* único. |
| Interfaz | `apps/mcp-gateway`, `apps/rest-api` | Traducen su protocolo (MCP / HTTP) a llamadas a los mismos casos de uso. Cero lógica de negocio duplicada entre los dos. |

## El caso de uso central: `ExecuteTool`

Todo tool call, sin excepción, pasa por
`packages/core-application/src/use-cases/execute-tool.ts`, en este orden:

1. El conector y la tool existen en el catálogo.
2. El conector está instalado para el tenant que llama.
3. El actor tiene permiso (rol `owner`/`admin`, o un `Permission` explícito).
4. Si la tool está marcada `sensitive: true` en el manifiesto, exige un
   `confirmationToken` explícito — si no viene, lanza `ConfirmationRequiredError` sin
   ejecutar nada. Así se implementa la regla "nunca ejecutar acciones sensibles sin
   autorización explícita del usuario" para *cualquier* conector futuro, sin que cada
   uno tenga que reimplementarla.
5. Rate limit por tenant (Redis, ventana fija por minuto).
6. Si el conector requiere credencial, la desencripta (AES-256-GCM, clave derivada por
   tenant) justo antes de usarla — nunca antes.
7. Despacha la llamada al proceso MCP del conector vía `ConnectorInvoker`.
8. **Siempre** escribe un `AuditEvent` — incluso en las denegaciones y en el paso 4 —
   así la auditoría prueba tanto lo que corrió como lo que fue bloqueado.

## El contrato de conector

Ver `docs/connector-authoring-guide.md` para el detalle completo. En resumen, cada
conector es una carpeta con:

- `connector.manifest.json`: id, transporte, tipo de auth, lista de tools (con su
  `inputSchema` en JSON Schema y su flag `sensitive`). Esto es lo único que el gateway
  lee sin tener que levantar el proceso.
- Su propio servidor MCP (`src/index.ts` en los dos conectores de referencia), que
  puede usar `packages/connector-sdk-ts` si está en TypeScript.

## Multi-tenencia y seguridad

Ver `docs/security.md` para el detalle. Resumen: JWT de sesión + API keys para
SDK/gateway, credenciales de terceros cifradas con AES-256-GCM con clave derivada por
tenant, Postgres con Row-Level Security como capa adicional sobre el filtrado
explícito por `tenant_id` que ya hace cada repositorio, auditoría inmutable de cada
intento de ejecución.

## Qué falta explícitamente (no está descartado, es la hoja de ruta)

- Los ~57 conectores restantes del listado original (TikTok Ads, WhatsApp Business,
  Telegram, Google Calendar/Workspace, CRMs, herramientas de analítica, Shopify,
  Stripe, bases de datos, generación de IA multimedia, etc.) — se agregan siguiendo
  `docs/connector-authoring-guide.md`, sin tocar el núcleo. Meta Ads
  (`connectors/meta-ads`) ya está — token de larga duración con tools de campañas y
  métricas, y sirve de plantilla para el resto de plataformas de ads/marketing.
- Apps nativas de Android y Windows.
- Panel web completo — `apps/web-panel` es hoy un placeholder de Next.js que solo
  verifica conectividad con la API REST.
- Facturación / planes de suscripción SaaS.
- Escalar `apps/mcp-gateway`/`apps/rest-api` a múltiples réplicas: hoy el catálogo de
  conectores vive en memoria (`InMemoryConnectorRepository`) porque se reconstruye en
  cada boot desde los manifiestos; con más de una réplica conviene una versión
  respaldada en Postgres para que el catálogo sea consistente entre instancias.
- Terminar de enchufar `withTenantScope` en cada request para que las políticas RLS de
  `infra/migrations/0001_init.sql` estén realmente activas (ver la nota al inicio de
  ese archivo) — hoy la protección real es el filtrado explícito por `tenant_id` en
  cada repositorio, que sí está completo.
