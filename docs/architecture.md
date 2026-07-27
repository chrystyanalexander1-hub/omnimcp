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

## Automatización (flujos, pipelines, programaciones, acciones condicionadas)

Un `Workflow` es una secuencia de pasos (`WorkflowStep`), cada uno una llamada a una
tool namespaced (`qualifiedToolName` + `params`), con un disparador opcional por cron
(`cronExpression`) y una condición simple por paso (`runIf: "always" |
"previous_success" | "previous_failure"`, evaluada contra el resultado del paso
anterior). Ver `packages/core-domain/src/entities/workflow.ts` y `workflow-run.ts`.

**El motor no reimplementa nada de `ExecuteTool`.**
`packages/core-application/src/use-cases/run-workflow.ts` corre cada paso llamando al
mismo `ExecuteTool` que usa una llamada manual — mismo chequeo de instalación,
permisos, rate limit, descifrado de credencial y auditoría. Lo único que agrega es la
secuencia y el gate de `runIf` entre pasos.

**Acciones sensibles en una automatización desatendida.** Una corrida programada no
tiene a nadie presente para confirmar nada en el momento. La regla: si un paso apunta
a una tool `sensitive`, quien crea el flujo (siempre `owner`/`admin`) tiene que pasar
`confirmSensitive: true` para ese paso **al crear el flujo** —
`CreateWorkflow` (`packages/core-application/src/use-cases/create-workflow.ts`)
rechaza guardar el paso si no viene esa confirmación, y la traduce en un
`confirmationToken` fijo que cada corrida futura reutiliza. La creación misma es la
autorización explícita; no hay forma de que un flujo termine ejecutando algo sensible
sin que un humano lo haya aprobado al menos una vez, a propósito. Además,
`RunWorkflow` vuelve a resolver el rol del creador **en el momento de correr** (no un
snapshot guardado) — si le revocaron permisos después, `ExecuteTool` lo rechaza igual
que rechazaría una llamada manual suya hoy.

**Quién dispara la ejecución:**
- `apps/automation-worker`: un proceso nuevo, siempre activo, que cada
  `AUTOMATION_POLL_INTERVAL_SECONDS` (default 30) llama
  `RunDueWorkflows` — trae los flujos habilitados cuyo `nextRunAt` ya pasó, los corre,
  y recalcula el próximo horario con `CronScheduler` (`cron-parser`, en
  `packages/core-infrastructure/src/services/cron-parser-scheduler.ts`).
- `POST /workflows/:id/run` (`apps/rest-api/src/routes/workflows.ts`): disparo manual
  bajo demanda, mismo motor (`RunWorkflow`), pero pasando por `TriggerWorkflow` que
  valida tenant y rol primero — a diferencia del worker, este endpoint sí puede
  recibir una llamada de un tenant/rol que no corresponde al flujo, así que valida.

**Fuera de alcance por ahora, documentado, no descartado:**
- Disparo por evento externo (webhooks) — necesitaría infraestructura de ingestión de
  webhooks que no existe todavía.
- Encadenar el resultado de un paso como input del siguiente (templating) — se dejó
  afuera a propósito para no sumar un mini-lenguaje de expresiones como superficie de
  riesgo sin un caso de uso concreto que lo necesite hoy.
- Locking distribuido entre réplicas de `automation-worker` — con una sola réplica
  (el caso de hoy) no hace falta; correr más de una réplica sin eso puede duplicar una
  ejecución.

## Panel web (`apps/web-panel`)

Ya no es un placeholder — es una SPA de Next.js (login + dashboard) que habla
directo con `apps/rest-api` por `fetch`, sin agregar ningún endpoint nuevo al
backend. Pensado para alguien sin conocimientos técnicos: nada de comandos, todo por
formularios.

- `lib/session.ts`: la sesión (token, tenant, rol) vive solo en `localStorage` del
  navegador — no hay server-side rendering que la necesite, así que no hace falta
  tocar cookies.
- `lib/api.ts`: un único wrapper de `fetch` para todos los endpoints existentes.
- 4 pestañas — Conectores, Herramientas, Automatizaciones, Auditoría (esta última
  oculta para el rol `member`, igual que ya exige `GET /audit` en el backend). Las
  pestañas de Herramientas y Automatizaciones usan un textarea de JSON para
  parámetros/pasos en vez de generar un formulario por cada una de las ~90 tools
  entre los 21 conectores — desproporcionado para esta fase, y el textarea sirve
  para todas por igual.
- El panel corre en la PC del usuario (`localhost:3300` — el 3000 ya lo usa
  `rest-api` cuando corre local) y le habla al servidor real por internet vía
  `NEXT_PUBLIC_API_BASE_URL`; no hace falta desplegarlo aparte para usarlo.
- Esto exigió agregar CORS a `apps/rest-api` (`@fastify/cors`, origen reflejado)
  porque el navegador bloquea por default una página en un origen (`localhost:3300`)
  llamando a una API en otro (el dominio/IP del servidor). La autorización real
  sigue siendo el `Authorization: Bearer` de cada request — CORS solo controla qué
  navegadores pueden *leer* la respuesta, no da acceso por sí solo.

## Qué falta explícitamente (no está descartado, es la hoja de ruta)

- Conectores restantes del listado original (Amazon — ver el bloque "Conectores
  diferidos" más abajo con la razón concreta, generación de IA multimedia más
  allá de OpenAI, etc.) — se agregan siguiendo
  `docs/connector-authoring-guide.md`, sin tocar el núcleo. Ya están, además de
  GitHub y Google Drive:
  - `connectors/meta-ads` — token de larga duración, campañas y métricas.
  - `connectors/tiktok-ads` — mismo patrón que Meta Ads, header `Access-Token`
    propio de la API de TikTok Business en vez de `Authorization: Bearer`.
  - `connectors/whatsapp-business` — Graph API de Meta (mismo host que Meta Ads,
    distinto scope de permisos), envío de mensajes marcado `sensitive`.
  - `connectors/telegram` — token de bot embebido en la URL en vez de header,
    ejemplo más simple posible del patrón `api_key`.
  - `connectors/google-ads` — mismo OAuth2+PKCE que Google Drive, pero además
    necesita un "developer token" fijo de la app (no por-tenant). Esto llevó a
    agregar `auth.sharedEnvVars` al contrato de conector (ver
    `packages/core-domain/src/entities/connector.ts`): nombres de variables de
    entorno que el gateway inyecta tal cual desde su propio proceso a cualquier
    conector que las declare — para config estática de plataforma que no es un
    client id/secret de OAuth. La primera extensión al núcleo que un conector
    nuevo terminó necesitando — ver también `tokenAuthMethod` y
    `authorizationExtraParams` más abajo (`connectors/pinterest`,
    `connectors/reddit`), las otras dos.
  - `connectors/hubspot` — token de larga duración (HubSpot recomienda "Private
    App" tokens para este caso, igual que el PAT de GitHub).
  - `connectors/google-analytics` — mismo patrón OAuth2+PKCE, de solo lectura
    (reportes GA4); no tiene ninguna tool `sensitive` porque no escribe nada.
  - `connectors/youtube` — OAuth2+PKCE (mismo client de Google); subir/editar video
    marcado `sensitive` porque publica contenido público de inmediato.
  - `connectors/shopify` — token de Admin API de "Custom App" (mismo patrón que el
    PAT de GitHub); `shopDomain` va como parámetro de cada tool, no como config fija,
    porque identifica qué tienda del tenant se usa en esa llamada, no un secreto.
    `fulfill_order` es `sensitive` porque notifica a un cliente real y despacha
    mercadería real.
  - `connectors/postgres` — conecta a la **propia base de datos externa del
    tenant** (no a la de OmniMCP). `run_query` es `sensitive` siempre, sin importar
    el contenido de la consulta: distinguir de forma confiable un `SELECT` inocuo de
    una escritura disfrazada (una función que muta datos, un CTE, etc.) por el texto
    de la query no es seguro de automatizar, así que directamente no se intenta.
  - `connectors/google-cloud-storage` — OAuth2+PKCE (mismo client de Google);
    `delete_object` es `sensitive`.
  - `connectors/azure-blob-storage` — Azure no acepta un bearer token simple desde
    una cadena de conexión: cada request se firma con el algoritmo "Shared Key" de
    Azure (HMAC-SHA256 sobre la cuenta), implementado desde cero en
    `azure-signer.ts` porque no hay un cliente liviano oficial para eso. El listado
    de blobs devuelve XML (no JSON) — se extraen los nombres con una regex acotada
    en vez de sumar una dependencia de parseo XML completa para un solo campo.
  - `connectors/firebase-firestore` — OAuth2+PKCE (mismo client de Google);
    Firestore representa cada valor con un formato tipado propio
    (`{ stringValue: "x" }`, `{ mapValue: { fields: {...} } }`, ...) — hay un
    conversor de ida y vuelta en `firestore-values.ts` para que el resto del código
    (y quien llama a la tool) solo vea JSON plano.
  - `connectors/tiktok-content` — publicación **orgánica** en TikTok (Content
    Posting API), distinto producto de TikTok que `tiktok-ads` (host, app y token
    propios). Token de larga duración, no el flujo OAuth genérico: el OAuth v2 de
    TikTok usa el parámetro `client_key` en vez de `client_id`, que es justo el
    nombre que el flujo genérico de `apps/rest-api/src/routes/oauth.ts` da por
    sentado — conectarlo ahí sin ajustar esa ruta habría fallado en silencio.
  - `connectors/facebook-pages` — Graph API de Meta (mismo host que Meta Ads/
    WhatsApp). `list_pages` funciona con un token de usuario; publicar
    (`create_post`, `upload_video`) necesita el token propio de esa Page — el
    conector no hace el intercambio automático, se documenta en el manifiesto.
  - `connectors/instagram` — Graph API de Meta también. Publicar es un flujo de
    dos pasos real (crear un contenedor de media en borrador, después publicarlo);
    `create_media_container` no es `sensitive` porque nada queda público todavía,
    `publish_media` sí.
  - `connectors/slack` — token de bot de larga duración. `upload_file` usa el
    flujo moderno de 3 pasos de Slack (reservar URL, subir los bytes, confirmar) —
    el viejo endpoint de un solo paso está en proceso de discontinuarse.
  - `connectors/notion` — token de integración. La propiedad "título" de una
    página se llama `title` cuando el padre es otra página, pero varía por
    base de datos cuando el padre es una base de datos — se asume `Name` (el
    default más común) en vez de resolver el schema real, una simplificación
    documentada en el propio código.
  - `connectors/google-calendar` — mismo OAuth2+PKCE que Google Drive.
    `create_event` no manda notificaciones a los invitados salvo que se pida
    explícitamente (`sendUpdates`); `delete_event` sí las manda siempre (las
    cancela) y por eso es `sensitive`.
  - `connectors/telegram` — se le agregó `send_video` (antes solo mandaba texto):
    acepta una URL (que Telegram baja solo) o el archivo en base64 subido
    directo, dos caminos reales que la propia API de Telegram soporta.
  - `connectors/stripe` — a diferencia de casi todo el resto, la API de Stripe
    recibe el body como `application/x-www-form-urlencoded`, no JSON — el cliente
    del conector arma eso en vez de reusar el patrón `JSON.stringify` de los demás.
    `create_refund` es `sensitive` porque mueve dinero real y es irreversible.
  - `connectors/linkedin` — token de larga duración; `create_post` primero resuelve
    el `urn:li:person:` del propio usuario autenticado (una llamada extra a
    `/me`) para no exigirle ese dato a quien llama la tool.
  - `connectors/x` — mismo criterio que Meta/TikTok: token de larga duración en vez
    del OAuth2 genérico de la plataforma, para no arriesgar un detalle de la
    implementación real de X que no se pueda verificar sin credenciales de prueba.
  - `connectors/discord` — token de bot; usa el esquema `Authorization: Bot <token>`
    en vez de `Bearer`, una particularidad de la API de Discord.
  - `connectors/trello` — Trello no autentica con un solo token sino con un par
    `key` + `token`, los dos como query params — se guarda como un único secreto
    `"key:token"` y el conector lo separa, en vez de inventar un segundo campo de
    credencial que el resto de la plataforma no maneja.
  - `connectors/mongodb` — mismo rol que `connectors/postgres` pero para Mongo:
    conecta a la base externa del propio tenant, y `run_command` es `sensitive`
    siempre por la misma razón que `run_query` en Postgres — un comando puede leer
    o escribir/borrar por igual, y no es seguro asumir cuál por su forma.
  - `connectors/woocommerce` — WooCommerce recomienda HTTP Basic Auth sobre HTTPS
    (consumer key como usuario, consumer secret como contraseña) en vez de firmar
    cada query string; se guarda como un único secreto `"consumerKey:consumerSecret"`,
    mismo patrón que `"key:token"` en Trello. `storeUrl` va como parámetro de cada
    tool, no como config fija, igual que `shopDomain` en Shopify.
    `update_order_status` es `sensitive` porque puede disparar emails al cliente y
    workflows de fulfillment reales según la config de la tienda.
  - `connectors/gmail` — mismo OAuth2+PKCE que Google Drive/Calendar (reusa
    `GOOGLE_CLIENT_ID`/`SECRET`). `get_message` arma el cuerpo en texto plano
    recorriendo `payload.parts` y decodificando base64url — Gmail no expone un
    campo "texto plano" directo. `send_message` arma el mensaje RFC 2822 a mano
    (`To`/`Subject`/`Content-Type` + cuerpo) y lo manda en `raw` (base64url); es
    `sensitive` porque entrega el mail de inmediato, sin forma de deshacerlo.
  - `connectors/google-sheets` — mismo OAuth2+PKCE. `append_values` no es
    `sensitive` porque solo agrega filas después de los datos existentes, nunca
    pisa nada; `update_values` sí lo es porque sobreescribe el rango indicado sin
    posibilidad de deshacer vía API.
  - `connectors/snapchat-ads` — mismo criterio que Meta/TikTok Ads pero con OAuth2
    real (Snapchat sí emite un `refresh_token` reutilizable, no rotativo, a
    diferencia de Mercado Libre — ver más abajo). La API de Snapchat requiere
    resolver organización → cuenta publicitaria → campaña en ese orden (no hay un
    endpoint "todas mis cuentas" directo), y `update_campaign_status` necesita el
    `adAccountId` en la ruta además del `campaignId`, a diferencia de Meta Ads.
  - `connectors/pinterest` — primer conector que necesitó `tokenAuthMethod:
    "basic"`: Pinterest exige el `client_id`/`client_secret` como header HTTP
    Basic Auth tanto en el intercambio inicial (`apps/rest-api/src/routes/oauth.ts`)
    como en cada refresh posterior (`src/pinterest-auth.ts`, que lo reimplementa
    porque el refresh de cada llamada corre en el proceso del propio conector, no
    en el núcleo). Sin ese modo, el body-based genérico habría fallado con 401.
  - `connectors/reddit` — mismo `tokenAuthMethod: "basic"` que Pinterest, más un
    segundo caso de uso para `authorizationExtraParams`:
    `{"duration": "permanent"}` en la URL de autorización, porque sin ese
    parámetro Reddit entrega un access token de 1 hora y **ningún** refresh token,
    sin importar qué se pida después en el intercambio de token. También exige un
    header `User-Agent` descriptivo en todas sus llamadas (`REDDIT_USER_AGENT` en
    `reddit-auth.ts`) — sin él, Reddit limita o bloquea las requests. Sus
    endpoints de escritura (`submit_post`, `submit_comment`) además reciben
    `application/x-www-form-urlencoded`, no JSON, y devuelven un envoltorio
    `{"json":{"errors":[...],"data":{...}}}` que hay que revisar aparte del
    status HTTP — Reddit puede responder 200 con errores adentro.
  - `connectors/mailchimp` — el propio API key trae el datacenter como sufijo
    (`...-us6`): no hay host fijo, se parsea del key. `add_list_member` usa el PUT
    de upsert por `subscriber_hash` (MD5 del email en minúsculas), el patrón que
    Mailchimp documenta para "agregar o actualizar" en una sola llamada.
  - `connectors/activecampaign` — necesita dos valores, no uno: URL de API propia
    de la cuenta (`https://cuenta.api-us1.com`) + API key. Se guarda como
    `"apiUrl|apiKey"` con pipe en vez de los dos puntos de Trello, porque la URL
    ya tiene dos puntos (`https://`). `add_contact_to_automation` es `sensitive`
    porque inscribe un contacto real en una automatización real, que puede
    mandar emails de inmediato.
  - `connectors/klaviyo` — API JSON:API real (`{"data":{"type":...,"attributes":
    {...}}}` anidado), y exige un header `revision` con una fecha de versión de
    API fija (`KLAVIYO_REVISION` en `klaviyo-client.ts`) — Klaviyo va
    deprecando revisiones viejas, así que ese valor puede necesitar actualizarse
    con el tiempo. `track_event` es `sensitive` porque un evento puede disparar
    flows reales (emails/SMS automáticos) configurados para reaccionar a él.
  - `connectors/openai` — API key por tenant (no compartida): cada tenant paga su
    propio uso. `chat_completion`/`generate_image` no son `sensitive` — cuestan
    dinero real pero no publican ni destruyen nada, mismo criterio que ya se usa
    para llamadas pagas de solo lectura como `get_campaign_insights` en Meta Ads.
  - `connectors/zapier` y `connectors/make` — ninguna de las dos plataformas
    ofrece una API pública para "correr cualquiera de mis Zaps/escenarios" desde
    un tercero; la única vía soportada en ese sentido es una URL de webhook
    propia por Zap/escenario. La credencial acá **es la URL**, no un token —
    mismo patrón que el token de Telegram embebido en la URL. `trigger_zap`/
    `trigger_scenario` son `sensitive` porque este conector no tiene ninguna
    visibilidad de qué hace realmente el Zap/escenario del otro lado.
  - `connectors/n8n` — a diferencia de Zapier/Make, n8n autohospedado sí expone
    una API REST real (`X-N8N-API-KEY`) que permite listar workflows, no solo
    dispararlos a ciegas; `baseUrl` va como parámetro de cada tool porque cada
    tenant tiene su propia instancia (mismo criterio que `shopDomain` en
    Shopify). `trigger_webhook` sigue el patrón de URL-como-credencial de
    Zapier/Make para el nodo Webhook específico que se quiera disparar.
  - `connectors/mercado-libre` — ya no está diferido. Necesitaba resolver antes
    la rotación del `refresh_token` (ver la nota vieja más abajo, dejada como
    referencia): se agregó `ConnectorAuth.oauth.refreshTokenRotates` al
    contrato de conector (`packages/core-domain/src/entities/connector.ts`) y
    un nuevo método `CredentialGrantRepository.updateSecret`. Cuando un
    conector lo declara, `ConnectorProcessManager` — antes de spawnear un
    proceso nuevo para ese (tenant, conector), es decir en cualquier respawn
    tras un idle de 10 minutos, un deploy, o un crash — intercambia el
    refresh_token guardado por uno nuevo y lo persiste de inmediato
    (re-encriptado) en el `CredentialGrant`, antes de inyectárselo al proceso.
    El propio conector (`mercadolibre-auth.ts`) queda idéntico en forma a
    cualquier otro OAuth2 (mismo patrón que `google-calendar/google-auth.ts`) —
    no necesita saber nada sobre la rotación, el núcleo ya se la resolvió antes
    de que el proceso arrancara. Límite que sigue existiendo, ahora mucho más
    angosto: si un mismo proceso pooleado sobrevive sin reiniciarse más de una
    vida útil de access token (~6h de uso continuo sin gaps de 10+ min) y
    *después* muere, el próximo spawn puede fallar y pedir re-autenticación —
    cerrar ese último tramo exigiría que el token viajara fresco en cada
    llamada individual (no solo al spawnear), algo que el protocolo MCP actual
    (argumentos validados por el esquema zod de cada tool antes de llegar al
    handler) no deja colar sin tocar `connector-sdk-ts` para todos los
    conectores por igual — no se justificó para este único caso.
- Apps nativas de Android y Windows.
- Facturación / planes de suscripción SaaS.
- Escalar `apps/mcp-gateway`/`apps/rest-api` a múltiples réplicas: hoy el catálogo de
  conectores vive en memoria (`InMemoryConnectorRepository`) porque se reconstruye en
  cada boot desde los manifiestos; con más de una réplica conviene una versión
  respaldada en Postgres para que el catálogo sea consistente entre instancias.
- Terminar de enchufar `withTenantScope` en cada request para que las políticas RLS de
  `infra/migrations/0001_init.sql` estén realmente activas (ver la nota al inicio de
  ese archivo) — hoy la protección real es el filtrado explícito por `tenant_id` en
  cada repositorio, que sí está completo.
- HTTPS en el Droplet: el servicio `caddy` (`docker-compose.yml`) y la guía
  (`docs/domain-https.md`) ya existen en el repo — falta que alguien compre un
  dominio, apunte el DNS, y lo levante en el Droplet. Hasta entonces, el panel y
  `rest-api` siguen sirviendo por HTTP directo a la IP, y ChatGPT Actions (que
  exige HTTPS) no puede conectarse todavía.
- `connectors/facebook-pages` y `connectors/whatsapp-business` ahora pueden mandar
  imágenes (`upload_photo`, `send_image_message`); publicar/enviar audio o
  documentos sigue sin implementarse en ninguno de los dos.

### Conectores diferidos (no implementados a propósito, con la razón concreta)

- **Pinterest**, **Reddit** y **Mercado Libre**: ya no están acá — el flujo
  genérico ahora soporta `tokenAuthMethod: "basic"`, `authorizationExtraParams`
  y `refreshTokenRotates`, ver la lista de arriba.
- **Amazon (Selling Partner API)**: no es solo OAuth — cada request además tiene
  que firmarse con AWS Signature Version 4 (credenciales de un IAM Role/usuario de
  AWS, distintas de las de LWA/Login with Amazon), un esquema de auth
  cualitativamente distinto a los `api_key`/`oauth2` que soporta hoy
  `packages/core-domain/src/entities/connector.ts`. Necesita su propio tipo de
  auth en el contrato de conector antes de poder implementarse.
