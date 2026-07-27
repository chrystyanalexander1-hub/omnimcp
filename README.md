# OmniMCP AI

Repositorio: https://github.com/chrystyanalexander1-hub/omnimcp

Gateway MCP universal: agrega conectores independientes (cada uno su propio servidor
MCP) detrás de un único punto de autenticación, permisos, auditoría y rate limiting
multi-tenant. Ver `docs/architecture.md` para el diseño completo y el alcance de esta
fase.

## Estructura

```
packages/
  core-domain           entidades y reglas de negocio, sin dependencias externas
  core-application       casos de uso (Clean Architecture) + ports
  core-infrastructure     Postgres, Redis, JWT, AES-256-GCM, ConnectorProcessManager
  connector-sdk-ts        helper para escribir conectores TypeScript
apps/
  mcp-gateway             servidor MCP (stdio) que expone las tools de todos los
                          conectores instalados a un cliente de IA
  rest-api                API HTTP multi-usuario (Fastify) para el panel/SDK/apps
  web-panel               placeholder Next.js (fuera de alcance esta fase)
connectors/
  github                  PAT, tools: list_repos, create_issue, create_pull_request,
                          delete_repository (sensitive)
  google-drive             OAuth2 + PKCE, tools: list_files, upload_file, download_file
  meta-ads                 Token de larga duración, tools: list_ad_accounts,
                          list_campaigns, get_campaign_insights, create_campaign
                          (sensitive), update_campaign_status (sensitive)
  tiktok-ads                Token de larga duración, tools: list_campaigns,
                          get_campaign_report, create_campaign (sensitive),
                          update_campaign_status (sensitive)
  whatsapp-business          Token de larga duración, tools: get_business_profile,
                          list_message_templates, send_text_message (sensitive),
                          send_template_message (sensitive)
  telegram                  Token de bot, tools: get_me, get_chat, get_updates,
                          send_message (sensitive)
  google-ads                 OAuth2 + PKCE + developer token compartido, tools:
                          list_accessible_customers, search_campaigns,
                          create_campaign (sensitive), update_campaign_status
                          (sensitive)
  hubspot                    Token de larga duración, tools: list_contacts,
                          create_contact, search_deals, update_deal_stage
                          (sensitive)
  google-analytics            OAuth2 + PKCE, tools: list_account_summaries,
                          run_report
infra/migrations/          esquema SQL de Postgres + Row-Level Security
docs/                       arquitectura, guía para escribir conectores, seguridad
```

## Requisitos

- Node.js >= 20
- Docker (para Postgres/Redis vía `docker-compose.yml`), o instancias propias

## Puesta en marcha (desarrollo local)

```bash
cp .env.example .env
# completar JWT_SECRET, MASTER_ENCRYPTION_KEY (ver instrucciones en .env.example),
# y GOOGLE_CLIENT_ID/SECRET si vas a probar el conector de Google Drive.

docker compose up -d postgres redis
docker compose run --rm migrate

npm install
npm run build

npm run dev:rest-api          # http://localhost:3000

# Generar el primer tenant + owner:
curl -X POST http://localhost:3000/tenants \
  -H "Content-Type: application/json" \
  -d '{"tenantName":"Acme","ownerEmail":"owner@acme.com","ownerPassword":"correct-horse-battery-staple"}'

# Login para obtener un JWT:
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"tenantId":"<id devuelto arriba>","email":"owner@acme.com","password":"correct-horse-battery-staple"}'

# Emitir una API key para el gateway MCP (usar el accessToken del login):
curl -X POST http://localhost:3000/api-keys \
  -H "Authorization: Bearer <accessToken>" -H "Content-Type: application/json" \
  -d '{"name":"local-gateway"}'

# En .env, setear OMNIMCP_API_KEY=<key devuelta arriba>, luego:
npm run dev:gateway
```

Instalar un conector e invocar una tool (ejemplo con GitHub y curl, vía REST):

```bash
curl -X POST http://localhost:3000/connectors/github/install \
  -H "Authorization: Bearer <accessToken>"

curl -X POST http://localhost:3000/connectors/github/credentials \
  -H "Authorization: Bearer <accessToken>" -H "Content-Type: application/json" \
  -d '{"secret":"<tu GitHub PAT>"}'

curl -X POST http://localhost:3000/tools/execute \
  -H "Authorization: Bearer <accessToken>" -H "Content-Type: application/json" \
  -d '{"qualifiedToolName":"github.list_repos","params":{}}'
```

## Tests

```bash
npm run test        # vitest en todos los paquetes (hoy: core-domain, core-application)
npm run typecheck
```

## Documentación

- [`docs/architecture.md`](docs/architecture.md) — diseño completo, capas, diagrama.
- [`docs/connector-authoring-guide.md`](docs/connector-authoring-guide.md) — cómo
  agregar un conector nuevo sin tocar el núcleo.
- [`docs/security.md`](docs/security.md) — autenticación, cifrado, aislamiento
  multi-tenant, auditoría.
