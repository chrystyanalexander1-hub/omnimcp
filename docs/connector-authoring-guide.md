# Cómo escribir un conector nuevo

Un conector es un servidor MCP standalone más un manifiesto declarativo. No requiere
tocar `apps/mcp-gateway`, `apps/rest-api` ni ningún paquete de `packages/`.

## 1. Estructura de carpeta

```
connectors/<mi-conector>/
├─ connector.manifest.json   ← leído por el gateway sin ejecutar el proceso
├─ package.json
└─ src/index.ts               ← el servidor MCP en sí (cualquier lenguaje vale;
                                  aquí se muestra TypeScript con connector-sdk-ts)
```

## 2. El manifiesto

```json
{
  "id": "mi-conector",
  "displayName": "Mi Conector",
  "version": "0.1.0",
  "transport": { "type": "stdio", "command": "node", "args": ["dist/index.js"] },
  "auth": { "type": "api_key", "envVar": "MI_CONECTOR_TOKEN" },
  "tools": [
    {
      "name": "hacer_algo",
      "description": "Descripción clara — la IA la usa para decidir cuándo llamar esta tool.",
      "inputSchema": { "type": "object", "properties": { "x": { "type": "string" } }, "required": ["x"] },
      "sensitive": false
    }
  ]
}
```

Reglas:
- `id`: minúsculas, kebab o snake_case. Es el prefijo con el que la tool queda
  namespaced (`mi-conector.hacer_algo`).
- `transport.command`/`args`: para `stdio`, las rutas relativas en `args` se resuelven
  contra la carpeta del conector — no hace falta escribir la ruta absoluta.
- `auth.type`:
  - `"api_key"`: `envVar` es el nombre de variable de entorno donde el gateway
    inyecta el secreto **del tenant que está llamando** (nunca uno compartido). Usá
    este tipo también para plataformas cuyo OAuth no emite un `refresh_token`
    estándar (Meta es el caso de referencia: emite tokens de larga duración o de
    "usuario del sistema" pensados justo para uso servidor-a-servidor) — forzar esas
    plataformas por el flujo OAuth genérico de abajo rompe o necesita un caso
    especial; tratarlas como un token de larga vida, igual que GitHub, es más simple
    y es literalmente la forma recomendada por esas plataformas. Ver
    `connectors/meta-ads/connector.manifest.json`.
  - `"oauth2"`: además de `envVar` (donde llega el refresh token del tenant), se
    declara `oauth.clientIdEnvVar`/`oauth.clientSecretEnvVar` — esas SÍ son
    compartidas entre tenants (son las credenciales de la app OAuth de OmniMCP), y se
    configuran una sola vez en el entorno del gateway/REST API. Ver
    `connectors/google-drive/connector.manifest.json` como referencia completa,
    incluyendo el flujo de authorization code + PKCE ya implementado de forma genérica
    en `apps/rest-api/src/routes/oauth.ts` — no hay que reescribirlo por conector.
  - `"none"`: sin credencial (poco común).
- `auth.sharedEnvVars` (opcional, cualquier `auth.type`): lista de nombres de
  variables de entorno que el gateway copia tal cual desde su propio proceso al del
  conector — para config estática de plataforma que **no** es un secreto por-tenant
  ni un client id/secret de OAuth. El caso de referencia es el "developer token" fijo
  que exige la API de Google Ads además del OAuth normal del usuario. Ver
  `connectors/google-ads/connector.manifest.json`. Usalo solo cuando de verdad haga
  falta — la mayoría de los conectores no lo necesitan.
- `sensitive: true` en cualquier tool obliga a que el llamador confirme
  explícitamente antes de que `ExecuteTool` la despache — usalo para todo lo
  destructivo o irreversible (borrar, enviar dinero, publicar en público, etc.). No
  hay que implementar la confirmación en el conector: el gateway ya la exige antes de
  invocarlo.

## 3. El código del conector (TypeScript)

```ts
import { startConnector, textResult, requireEnv } from "@omnimcp/connector-sdk-ts";
import { z } from "zod";

const token = requireEnv("MI_CONECTOR_TOKEN");

await startConnector({
  name: "mi-conector",
  version: "0.1.0",
  tools: [
    {
      name: "hacer_algo",
      description: "Descripción clara.",
      inputSchema: z.object({ x: z.string() }),
      async handler({ x }) {
        // llamar a la API real de la plataforma acá, usando `token`
        return textResult(`hecho: ${x}`);
      },
    },
  ],
});
```

Notar que el `inputSchema` se declara dos veces — una vez como JSON Schema en el
manifiesto (para que el gateway pueda listar tools sin levantar el proceso) y otra vez
como schema de zod en el código (para validar en runtime). Es una duplicación
deliberada, no un descuido: mantiene al gateway liviano sin depender de poder
ejecutar cada conector solo para preguntarle su catálogo.

Si el conector no es TypeScript, cualquier SDK oficial de MCP sirve igual — el
contrato es el protocolo MCP por stdio, no `connector-sdk-ts`.

## 4. Probarlo aislado

```bash
cd connectors/mi-conector
npm install && npm run build
MI_CONECTOR_TOKEN=xxx node dist/index.js
# stdin/stdout hablan JSON-RPC de MCP — usá un cliente MCP de prueba, o
# `npx @modelcontextprotocol/inspector node dist/index.js`
```

## 5. Registrarlo en la plataforma

1. Asegurate de que `CONNECTORS_DIR` (por defecto `./connectors`) apunte a una
   carpeta que contenga la tuya. El gateway/REST API lo carga solo con reiniciar el
   proceso — no hace falta ningún paso manual de "registro" en base de datos.
2. Un owner/admin del tenant lo instala: `POST /connectors/mi-conector/install`.
3. Le otorga credencial: `POST /connectors/mi-conector/credentials` (api_key) o el
   flujo `GET /connectors/mi-conector/oauth/start` (oauth2).
4. Ya aparece en `GET /tools` y en `tools/list` del gateway MCP, namespaced como
   `mi-conector.hacer_algo`.
