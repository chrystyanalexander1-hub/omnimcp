# Conectar ChatGPT a OmniMCP AI (Custom GPT + Actions)

## Requisito: HTTPS

ChatGPT no acepta un servidor `http://` para Actions — tiene que ser `https://`
con un certificado válido. Si tu servidor todavía está en `http://<IP>:3000`,
seguí primero la guía de dominio + HTTPS antes de este paso.

## 1. Conseguir una API key para el GPT

Misma idea que con Claude Desktop — logueate y emitila:

```bash
curl -X POST https://tu-dominio/auth/login \
  -H "Content-Type: application/json" \
  -d '{"tenantId":"<tu tenantId>","email":"<tu email>","password":"<tu password>"}'

curl -X POST https://tu-dominio/api-keys \
  -H "Authorization: Bearer <accessToken de arriba>" -H "Content-Type: application/json" \
  -d '{"name":"chatgpt-actions"}'
```

Guardá el `key` que te devuelve — se muestra una sola vez.

## 2. Crear el GPT

1. En ChatGPT (necesitás plan Plus, Team, o Enterprise): **Explorar GPTs → Crear**.
2. Ponele nombre y una descripción corta.
3. En **Instrucciones**, pegá algo así:

   > Tenés acceso a herramientas reales de GitHub, Meta Ads, Shopify, Slack,
   > Stripe y otras plataformas a través de las Actions de OmniMCP. Antes de
   > ejecutar algo que no conozcas, llamá a `listTools` para ver los nombres
   > exactos disponibles. Si una tool viene marcada `sensitive: true`, explicále
   > al usuario qué va a hacer esa acción en palabras simples y pedile
   > confirmación explícita antes de llamar a `executeTool` con
   > `confirmationToken: "confirmed-via-chatgpt"`. Nunca inventes parámetros que
   > no te dio el usuario — preguntá.

4. En **Actions → Create new action**, pegá el contenido de
   `docs/chatgpt-actions-openapi.yaml` (cambiando la URL del `servers:` por tu
   dominio real).
5. En **Authentication**, elegí **API Key**, tipo **Bearer**, y pegá la key del
   paso 1.
6. Guardá y probá: "Listame mis repos de GitHub" o "Creá un cliente nuevo en
   Stripe llamado Juan Pérez".

## Notas

- El GPT ve **todos** los conectores instalados para tu tenant — mismo alcance
  que el panel web o Claude Desktop, es la misma cuenta.
- Las acciones marcadas `sensitive` (borrar algo, gastar plata, publicar
  contenido) van a fallar la primera vez con un pedido de confirmación — es
  intencional, no un error: el modelo tiene que volver a llamar con
  `confirmationToken` después de que el usuario confirme.
- La API key no expira sola — si alguna vez la querés invalidar, hay que
  agregar un endpoint de revocación (hoy no existe uno específico para API
  keys, solo para credenciales de conectores) o rotarla borrando el registro
  directo en la base.
