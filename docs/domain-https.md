# Dominio + HTTPS

Referenciada desde `docs/chatgpt-actions-guide.md` y el README ("sin HTTPS
todavía"). Sin esto, todo lo demás (panel web, Claude Desktop, curl) funciona
igual por HTTP directo a la IP — HTTPS solo hace falta para ChatGPT Actions,
que lo exige.

## 1. Comprar un dominio

Cualquier registrador sirve, el gateway (`caddy`, sección 4) no depende de
cuál elijas. Tres opciones razonables:

- **Cloudflare Registrar** — vende al precio de costo (sin markup), sin
  necesidad de usar el resto de su producto (proxy/CDN). La opción más barata
  a largo plazo si vas a renovar varios años.
- **Porkbun** — precios muy similares a Cloudflare, panel simple, WHOIS
  privacy gratis incluido.
- **Namecheap** — el más conocido, panel de DNS un poco más cargado que los
  anteriores pero igual de funcional, WHOIS privacy gratis también.

Evitá GoDaddy: precio de renovación mucho más alto que el de alta, y venta
agresiva de upsells en el checkout. Un dominio `.com` ronda 8-12 USD/año en
cualquiera de las tres opciones de arriba.

No hace falta hosting de DNS separado — el DNS que trae el registrador
alcanza para los dos registros que necesitás en el paso 2.

## 2. Apuntar el DNS al Droplet

En el panel de DNS del dominio que compraste, crear dos registros **A**
apuntando a la IP del Droplet (`167.71.99.75`):

| Tipo | Host | Valor |
|---|---|---|
| A | `api` | `167.71.99.75` |
| A | `app` | `167.71.99.75` |

Esto da `api.tu-dominio.com` (para `rest-api`) y `app.tu-dominio.com` (para
`web-panel`). Puede tardar de minutos a un par de horas en propagar; probá con
`nslookup api.tu-dominio.com` hasta que devuelva la IP del Droplet.

## 3. Abrir los puertos 80 y 443 en el Droplet

Caddy necesita el puerto 80 (validación HTTP-01 de Let's Encrypt + redirect a
HTTPS) y el 443 (HTTPS) accesibles desde internet. Si el Droplet tiene un
firewall de DigitalOcean asignado, agregar reglas de entrada para TCP 80 y
443 desde `0.0.0.0/0` (Networking → Firewalls, en el panel de DigitalOcean).
Si en vez de eso usás `ufw` en el propio Droplet: `ufw allow 80,443/tcp`.

## 4. Configurar y levantar `caddy`

En el `.env` del Droplet (el mismo que ya usan `rest-api`/`web-panel`),
agregar:

```bash
DOMAIN_API=api.tu-dominio.com
DOMAIN_APP=app.tu-dominio.com
ACME_EMAIL=tu-email@ejemplo.com
PUBLIC_API_URL=https://api.tu-dominio.com
```

Luego, desde el directorio del proyecto en el Droplet:

```bash
docker compose up -d --build web-panel caddy
```

`caddy` (definido en `docker-compose.yml`, config en `infra/caddy/Caddyfile`)
hace de reverse proxy hacia `rest-api:3000` y `web-panel:3300`, y pide/renueva
el certificado de Let's Encrypt solo — no hay `certbot` que correr a mano ni
cron de renovación que mantener.

`web-panel` necesita reconstruirse (`--build`) porque
`NEXT_PUBLIC_API_BASE_URL` se hornea en el bundle del navegador en build time
— por eso el comando de arriba lo incluye junto con `caddy`.

## 5. Verificar

```bash
curl https://api.tu-dominio.com/healthz
```

Si devuelve respuesta (no error de certificado), HTTPS está andando. Abrir
`https://app.tu-dominio.com` en el navegador debería mostrar el panel.

A partir de acá, `docs/chatgpt-actions-guide.md` ya puede usar
`https://api.tu-dominio.com` como `servers:` en
`docs/chatgpt-actions-openapi.yaml`.

## Nota sobre el puerto 3000/3300 directo

Una vez que `caddy` está sirviendo en 80/443, los puertos publicados
`3000`/`3300` directos a la IP siguen abiertos (no se cerraron en este
cambio) — quedan como acceso HTTP de respaldo. Si se quiere forzar todo el
tráfico por HTTPS, hay que sacar los `ports:` de `rest-api` y `web-panel` en
`docker-compose.yml` y dejar que solo `caddy` los exponga externamente.
