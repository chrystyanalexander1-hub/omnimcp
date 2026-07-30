# Propuestas de mejora para conectores

Relevamiento de qué le falta a los conectores de mensajería/medios frente a lo que sus APIs realmente ofrecen. Empieza por WhatsApp Business (el más incompleto de los tres conectores de mensajería) y sigue con mejoras transversales aplicables a los 45 conectores.

Ninguno de estos cambios está implementado todavía — es la lista para decidir qué priorizar.

---

## 1. WhatsApp Business (`connectors/whatsapp-business`)

Hoy tiene 5 tools: `get_business_profile`, `list_message_templates`, `send_text_message`, `send_template_message`, `send_image_message`. La API de WhatsApp Cloud (Graph API, la misma que ya usa este conector) soporta bastante más de lo que está expuesto.

### 1.1 Enviar audio — ✅ implementado
`send_audio_message` acepta `link`, `mediaId`, o `contentBase64` + `mimeType` (sube automáticamente vía `upload_media` antes de enviar). Sin `caption` — WhatsApp no lo permite en audio.

### 1.2 Enviar video — ✅ implementado
`send_video_message`, mismo patrón que audio, con `caption` opcional. Límite de tamaño de Meta: 16 MB (no validado del lado del conector, lo rechaza la API si se excede).

### 1.3 Enviar documentos — falta por completo
`type: "document"` con `link`/`id`, `filename` y `caption` opcional. Útil para PDFs, facturas, catálogos — un caso de uso muy pedido en negocios que ya usan WhatsApp Business.

### 1.4 Subir media propia (`upload_media`) — ✅ implementado
Nueva función `uploadMedia()` en `graph-client.ts` (multipart/form-data a `POST /{phoneNumberId}/media`) expuesta como tool standalone `upload_media` (devuelve `{ mediaId }` reutilizable en varios sends) y usada internamente por `send_audio_message`/`send_video_message` cuando se pasa `contentBase64` + `mimeType`.

`send_image_message` también se actualizó para aceptar `contentBase64` + `mimeType` (mismo `resolveMediaId` compartido) — las tres tools de envío de media (`send_image_message`, `send_audio_message`, `send_video_message`) ya son consistentes entre sí.

### 1.5 Descargar media entrante — falta por completo
Cuando un cliente manda un audio/imagen/video al negocio, WhatsApp solo entrega un `mediaId` vía webhook. Hoy no hay ninguna tool para resolverlo a contenido. Se necesitan dos pasos encadenados:
1. `GET /{mediaId}` → devuelve `{ url, mime_type, sha256, file_size }` (la URL expira y requiere el mismo Bearer token).
2. `GET <url>` con el mismo `Authorization` header → bytes del archivo.

Propuesta: `download_media(mediaId)` que hace ambos pasos y devuelve `{ contentBase64, mimeType }`, siguiendo el mismo patrón que `azure-blob-storage.download_blob` o `google-cloud-storage.download_object`.

### 1.6 Marcar mensaje como leído — falta
`send_read_receipt(phoneNumberId, messageId)`:
```json
{ "messaging_product": "whatsapp", "status": "read", "message_id": "..." }
```
Mejora la experiencia del cliente (deja de ver el mensaje como "no leído") y es requisito informal de Meta para mantener buena calidad de cuenta.

### 1.7 Mensajes interactivos (botones / listas) — falta
`type: "interactive"` con `action.buttons` (hasta 3 botones) o listas desplegables. Es la forma estándar de dar opciones sin depender de que el usuario escriba texto libre — muy usado en bots de atención al cliente.

### 1.8 Ubicación y contactos — falta
`type: "location"` y `type: "contacts"`. Menor prioridad que lo anterior, pero son tipos de mensaje nativos de la API que hoy no están cubiertos.

**Orden sugerido de implementación:** 1.4 (upload_media) primero porque desbloquea a todo el resto → luego 1.1/1.2/1.3 (audio/video/documento, reusan el mismo cliente) → 1.5 (download_media) → 1.6 (read receipt, es una sola línea) → 1.7/1.8 si hay caso de uso concreto.

---

## 2. Mejoras transversales (todos los conectores)

### 2.1 Cero tests
Ningún conector (0 de 45) tiene test unitario. Dado que la mayoría comparte el patrón `safe()` + cliente HTTP propio, un solo helper de test (mockear `fetch`/el cliente) cubriría el patrón común rápido. Prioridad sugerida: los que mueven dinero o son irreversibles primero (Stripe, Twilio, WhatsApp, Meta/Google/TikTok/Snapchat Ads).

### 2.2 `safe()` duplicado en 44 archivos — ✅ implementado
Cada conector reimplementaba el mismo helper `safe<T>()` para envolver errores — pero `connector-sdk-ts` (`startConnector`) ya envuelve cada `handler` en su propio try/catch y lo convierte a `errorResult` (`packages/connector-sdk-ts/src/index.ts:60-66`). Era lógica duplicada sin efecto funcional adicional.

Se eliminó `safe()` (y el try/catch manual de `github`) de los 44 conectores afectados, dejando que los handlers devuelvan/lancen directamente y que el catch central del SDK haga el resto. Las clases `*ApiError` y los helpers `handle()`/`*Request()` de cada cliente se mantuvieron intactos (siguen siendo los que transforman una respuesta HTTP fallida en un error con mensaje útil). `whatsapp-business` quedó afuera de este pase a propósito.

### 2.3 Sin paginación real en `list_*`
Varios `list_*` (Airtable, ActiveCampaign, HubSpot, Shopify, Trello) devuelven un límite fijo (`maxRecords`/`limit` con default) pero no exponen cursor/`offset`/`page_info` de la API subyacente — así que no hay forma de traer "la página siguiente" de una lista larga.

### 2.4 Sin retry/backoff ante rate limiting
Ningún `*-client.ts` reintenta ante un 429. Con conectores de ads (Meta, Google, TikTok, Snapchat) que sí tienen rate limits agresivos, esto puede traducirse en fallos intermitentes bajo uso real.

### 2.5 Manejo de media inconsistente entre conectores
Telegram y Slack ya aceptan `contentBase64` además de URL; WhatsApp, Instagram, Facebook Pages y Pinterest solo aceptan URL pública. Vale la pena unificar el criterio (idealmente vía un helper compartido en `connector-sdk-ts` para "subir base64 → obtener referencia", ya que la lógica de multipart se repetiría en cada conector que lo necesite).
