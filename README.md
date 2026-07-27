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
  automation-worker        corre flujos programados (cron) — ver "Automatización"
                          en docs/architecture.md
  web-panel               login + dashboard (Next.js) — conectores, herramientas,
                          automatizaciones, auditoría, sin usar la terminal
connectors/     (27 conectores reales — ver docs/architecture.md para el detalle
                completo de auth y tools de cada uno)
  github, google-drive, meta-ads, tiktok-ads, whatsapp-business, telegram,
  google-ads, hubspot, google-analytics, youtube, shopify, postgres,
  google-cloud-storage, azure-blob-storage, firebase-firestore,
  tiktok-content, facebook-pages, instagram, slack, notion, google-calendar,
  stripe, linkedin, x, discord, trello, mongodb
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

Crear una automatización programada (corre sola cada minuto, vía `apps/automation-worker`):

```bash
curl -X POST http://localhost:3000/workflows \
  -H "Authorization: Bearer <accessToken>" -H "Content-Type: application/json" \
  -d '{
    "name": "Listar repos cada minuto",
    "cronExpression": "* * * * *",
    "steps": [{ "qualifiedToolName": "github.list_repos", "params": {} }]
  }'

# Dispararla ahora mismo sin esperar el cron:
curl -X POST http://localhost:3000/workflows/<id>/run -H "Authorization: Bearer <accessToken>"

# Ver el historial de corridas:
curl http://localhost:3000/workflows/<id>/runs -H "Authorization: Bearer <accessToken>"
```

## Panel web

En vez de `curl`, `apps/web-panel` da login + dashboard normal por navegador. Ya
está desplegado junto al resto en el Droplet — accesible en
`http://167.71.99.75:3300` (sin HTTPS todavía, ver `docs/security.md`).

Para correrlo en desarrollo local en vez del que está en el Droplet:

```bash
cp apps/web-panel/.env.local.example apps/web-panel/.env.local
# editar NEXT_PUBLIC_API_BASE_URL con la URL de tu rest-api (local o desplegado)

npm run dev --workspace apps/web-panel   # http://localhost:3300
```

Iniciá sesión, y desde ahí instalás conectores, les das credenciales, ejecutás
tools, y armás automatizaciones — sin terminal. Nota: `apps/rest-api` necesita CORS
habilitado para que el navegador deje llamarlo desde otro origen (`@fastify/cors`,
ya wireado en `src/server.ts`).

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
- [`docs/chatgpt-actions-guide.md`](docs/chatgpt-actions-guide.md) — conectar un
  Custom GPT de ChatGPT vía Actions (requiere HTTPS).
