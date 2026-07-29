# Qué puede hacer cada conector de OmniMCP

Generado a partir de los `connector.manifest.json` de cada conector en `connectors/`. La columna **Confirmación** refleja el flag `sensitive` de cada herramienta:

- **Sin confirmación** — `executeTool` la ejecuta directamente. Esto NO significa que sea de solo lectura: varias de estas herramientas crean o actualizan datos (ver la descripción), pero el conector las considera lo bastante seguras/reversibles como para no bloquear.
- **⚠️ Requiere confirmación** — `executeTool` responde `428` la primera vez; hay que confirmar en la conversación y reenviar con `confirmationToken: "confirmed-via-chatgpt"` (o el diálogo "Permitir" equivalente, como en un GPT de ChatGPT). Son acciones que envían mensajes reales, gastan dinero, publican contenido públicamente, o borran/sobrescriben datos sin poder deshacerlo.

Total: 45 conectores.

---

## ActiveCampaign (`activecampaign`)
Autenticación: API Key

| Herramienta | Qué hace | Confirmación |
|---|---|---|
| `list_contacts` | List contacts in the account. | No requerida |
| `create_contact` | Create a new contact record. Does not enroll them in any automation by itself. | No requerida |
| `list_automations` | List marketing automations configured in the account. | No requerida |
| `add_contact_to_automation` | Enroll a contact into an automation — can immediately send real emails or trigger other live steps. | ⚠️ Requerida |

## Airtable (`airtable`)
Autenticación: API Key

| Herramienta | Qué hace | Confirmación |
|---|---|---|
| `list_records` | List records in a table. | No requerida |
| `create_record` | Create a new record in a table. | No requerida |
| `update_record` | Update specific fields of an existing record, leaving other fields untouched. | No requerida |
| `delete_record` | Delete a record. Cannot be undone. | ⚠️ Requerida |

## Azure Blob Storage (`azure-blob-storage`)
Autenticación: API Key

| Herramienta | Qué hace | Confirmación |
|---|---|---|
| `list_blobs` | List blobs in a container, optionally filtered by prefix. | No requerida |
| `upload_blob` | Upload a blob to a container. | No requerida |
| `download_blob` | Download a blob's content as base64. | No requerida |
| `delete_blob` | Permanently delete a blob from a container. Irreversible. | ⚠️ Requerida |

## Calendly (`calendly`)
Autenticación: API Key

| Herramienta | Qué hace | Confirmación |
|---|---|---|
| `get_my_user` | Get the authenticated user's own info and URI — needed as input for the other tools. | No requerida |
| `list_event_types` | List bookable event types (meeting templates) for a user. | No requerida |
| `list_scheduled_events` | List scheduled meetings for a user. | No requerida |
| `cancel_scheduled_event` | Cancel a scheduled meeting and notify the invitee. Cannot be undone. | ⚠️ Requerida |

## Discord (`discord`)
Autenticación: API Key

| Herramienta | Qué hace | Confirmación |
|---|---|---|
| `list_guild_channels` | List channels in a server (guild) the bot belongs to. | No requerida |
| `get_channel_messages` | Fetch recent messages from a channel. | No requerida |
| `send_message` | Send a text message to a channel. | ⚠️ Requerida |

## DocuSign (`docusign`)
Autenticación: OAuth2

| Herramienta | Qué hace | Confirmación |
|---|---|---|
| `get_user_info` | Get the authenticated user's DocuSign accounts, including each account's id and API base URI — needed as input for every other tool, since both vary per account. | No requerida |
| `list_envelopes` | List envelopes (documents sent for signature) created since a date. | No requerida |
| `get_envelope_status` | Get the current status (sent, delivered, completed, declined, voided) of an envelope. | No requerida |
| `send_envelope` | Send a document to a signer for electronic signature. Delivers immediately as a real, legally binding signature request. | ⚠️ Requerida |

## Facebook Pages (`facebook-pages`)
Autenticación: API Key

| Herramienta | Qué hace | Confirmación |
|---|---|---|
| `list_pages` | List Facebook Pages the authenticated token can manage. | No requerida |
| `get_page_insights` | Get performance metrics for a Page (e.g. page_impressions, page_engaged_users). | No requerida |
| `create_post` | Publish a text post to a Page's feed. Goes live publicly immediately. | ⚠️ Requerida |
| `upload_video` | Upload and publish a video to a Page, fetched from a public URL. Goes live publicly immediately. | ⚠️ Requerida |
| `upload_photo` | Upload and publish a photo to a Page's feed, fetched from a public URL. Goes live publicly immediately. | ⚠️ Requerida |

## Firebase Firestore (`firebase-firestore`)
Autenticación: OAuth2

| Herramienta | Qué hace | Confirmación |
|---|---|---|
| `list_documents` | List documents in a Firestore collection. | No requerida |
| `get_document` | Get a single document by its full path. | No requerida |
| `create_document` | Create a new document in a collection with the given fields. | No requerida |
| `delete_document` | Permanently delete a document. Irreversible. | ⚠️ Requerida |

## GitHub (`github`)
Autenticación: API Key

| Herramienta | Qué hace | Confirmación |
|---|---|---|
| `list_repos` | List repositories owned by or accessible to the authenticated GitHub account. | No requerida |
| `create_issue` | Create an issue in a GitHub repository. | No requerida |
| `create_pull_request` | Open a pull request in a GitHub repository. | No requerida |
| `delete_repository` | Permanently delete a GitHub repository. Irreversible. | ⚠️ Requerida |

## Gmail (`gmail`)
Autenticación: OAuth2

| Herramienta | Qué hace | Confirmación |
|---|---|---|
| `list_messages` | List message IDs matching a Gmail search query. | No requerida |
| `get_message` | Get a message's subject, sender, date, and plain-text body. | No requerida |
| `send_message` | Send an email from the authenticated account. Delivers immediately. | ⚠️ Requerida |

## Google Ads (`google-ads`)
Autenticación: OAuth2

| Herramienta | Qué hace | Confirmación |
|---|---|---|
| `list_accessible_customers` | List Google Ads customer account IDs accessible to the authenticated token. | No requerida |
| `search_campaigns` | Run a GAQL query against a customer's campaigns (read-only). Defaults to listing id/name/status if no query is given. | No requerida |
| `create_campaign` | Create a new campaign budget and campaign. Spends real budget once enabled. | ⚠️ Requerida |
| `update_campaign_status` | Pause, enable, or remove an existing campaign, immediately changing whether it spends budget. | ⚠️ Requerida |

## Google Analytics (`google-analytics`)
Autenticación: OAuth2

| Herramienta | Qué hace | Confirmación |
|---|---|---|
| `list_account_summaries` | List GA4 accounts and properties accessible to the authenticated token. | No requerida |
| `run_report` | Run a GA4 report: dimensions x metrics over a date range. | No requerida |

## Google Calendar (`google-calendar`)
Autenticación: OAuth2

| Herramienta | Qué hace | Confirmación |
|---|---|---|
| `list_events` | List upcoming events on a calendar. | No requerida |
| `create_event` | Create a new calendar event. Does not notify attendees unless sendUpdates is set. | No requerida |
| `delete_event` | Delete a calendar event. Notifies attendees of the cancellation and cannot be undone. | ⚠️ Requerida |

## Google Cloud Storage (`google-cloud-storage`)
Autenticación: OAuth2

| Herramienta | Qué hace | Confirmación |
|---|---|---|
| `list_objects` | List objects in a bucket, optionally filtered by prefix. | No requerida |
| `upload_object` | Upload an object to a bucket. | No requerida |
| `download_object` | Download an object's content as base64. | No requerida |
| `delete_object` | Permanently delete an object from a bucket. Irreversible. | ⚠️ Requerida |

## Google Drive (`google-drive`)
Autenticación: OAuth2

| Herramienta | Qué hace | Confirmación |
|---|---|---|
| `list_files` | List files in the authenticated user's Google Drive. | No requerida |
| `upload_file` | Upload a file to Google Drive. | No requerida |
| `download_file` | Download a file's content from Google Drive as base64. | No requerida |

## Google Sheets (`google-sheets`)
Autenticación: OAuth2

| Herramienta | Qué hace | Confirmación |
|---|---|---|
| `get_values` | Read a range of cell values from a spreadsheet. | No requerida |
| `append_values` | Append rows after the last row with data in the range — does not overwrite anything existing. | No requerida |
| `update_values` | Overwrite the cells in a range with new values. Cannot be undone through the API. | ⚠️ Requerida |

## HubSpot (`hubspot`)
Autenticación: API Key

| Herramienta | Qué hace | Confirmación |
|---|---|---|
| `list_contacts` | List CRM contacts. | No requerida |
| `create_contact` | Create a new CRM contact. | No requerida |
| `search_deals` | Search deals by name (read-only). | No requerida |
| `update_deal_stage` | Move a deal to a different pipeline stage — can trigger downstream sales automations/notifications. | ⚠️ Requerida |

## Instagram (`instagram`)
Autenticación: API Key

| Herramienta | Qué hace | Confirmación |
|---|---|---|
| `list_media` | List media (photos/videos) already published to an Instagram Business account. | No requerida |
| `create_media_container` | Create a draft media container from an image or video URL — a staging step. Nothing is public yet; call publish_media to actually post it. | No requerida |
| `publish_media` | Publish a previously created media container. Goes live publicly immediately. | ⚠️ Requerida |

## Klaviyo (`klaviyo`)
Autenticación: API Key

| Herramienta | Qué hace | Confirmación |
|---|---|---|
| `list_lists` | List subscriber lists in the account. | No requerida |
| `create_profile` | Create or update a customer profile. Does not subscribe them to anything by itself. | No requerida |
| `track_event` | Record a custom event for a profile — can trigger real Klaviyo flows (automated emails/SMS) configured to react to that event. | ⚠️ Requerida |

## LinkedIn (`linkedin`)
Autenticación: API Key

| Herramienta | Qué hace | Confirmación |
|---|---|---|
| `get_profile` | Get the authenticated member's basic profile. | No requerida |
| `create_post` | Publish a text post to the authenticated member's LinkedIn feed. Goes live publicly immediately. | ⚠️ Requerida |

## Mailchimp (`mailchimp`)
Autenticación: API Key

| Herramienta | Qué hace | Confirmación |
|---|---|---|
| `list_audiences` | List audiences (mailing lists) in the account. | No requerida |
| `list_campaigns` | List email campaigns in the account. | No requerida |
| `add_list_member` | Add or update a subscriber on an audience. Can trigger the audience's welcome automation for the recipient. | ⚠️ Requerida |

## Make (`make`)
Autenticación: API Key

| Herramienta | Qué hace | Confirmación |
|---|---|---|
| `trigger_scenario` | Trigger a Make (Integromat) scenario by POSTing a JSON payload to its custom webhook trigger URL. What actually happens next is whatever the scenario itself does — this connector has no visibility into it. | ⚠️ Requerida |

## Mercado Libre (`mercado-libre`)
Autenticación: OAuth2

| Herramienta | Qué hace | Confirmación |
|---|---|---|
| `get_my_user` | Get the authenticated seller's own user info (id, nickname, site_id) — needed as input for other tools like list_orders. | No requerida |
| `list_orders` | List orders for a seller. | No requerida |
| `update_item_stock` | Update a listing's available stock quantity. Changes what's really for sale immediately. | ⚠️ Requerida |

## Meta Ads (`meta-ads`)
Autenticación: API Key

| Herramienta | Qué hace | Confirmación |
|---|---|---|
| `list_ad_accounts` | List Meta Ads accounts accessible to the authenticated token. | No requerida |
| `list_campaigns` | List campaigns in a Meta Ads account. | No requerida |
| `get_campaign_insights` | Get performance metrics (impressions, clicks, spend, ctr) for a campaign. | No requerida |
| `create_campaign` | Create a new advertising campaign. Spends real budget once activated — irreversible in the sense that ad spend already delivered cannot be recovered. | ⚠️ Requerida |
| `update_campaign_status` | Pause or reactivate an existing campaign, immediately changing whether it spends budget. | ⚠️ Requerida |

## MongoDB (`mongodb`)
Autenticación: API Key

| Herramienta | Qué hace | Confirmación |
|---|---|---|
| `list_collections` | List collections in a database. | No requerida |
| `find_documents` | Find documents in a collection matching an optional filter. | No requerida |
| `run_command` | Run a raw MongoDB database command against the tenant's own database. Always requires explicit confirmation — commands can write or drop data just as easily as read it, and that can't be told apart reliably from the command object alone. | ⚠️ Requerida |

## n8n (`n8n`)
Autenticación: API Key

| Herramienta | Qué hace | Confirmación |
|---|---|---|
| `list_workflows` | List workflows on a self-hosted n8n instance. | No requerida |
| `trigger_webhook` | Trigger an n8n workflow by POSTing a JSON payload to its Webhook node URL. What actually happens next is whatever the workflow itself does — this connector has no visibility into it. | ⚠️ Requerida |

## Notion (`notion`)
Autenticación: API Key

| Herramienta | Qué hace | Confirmación |
|---|---|---|
| `search` | Search pages and databases the integration has access to. | No requerida |
| `get_page` | Get a page's properties by ID. | No requerida |
| `create_page` | Create a new page under a parent page or database. | No requerida |
| `update_page` | Update a page's title property. | No requerida |

## OpenAI (`openai`)
Autenticación: API Key

| Herramienta | Qué hace | Confirmación |
|---|---|---|
| `chat_completion` | Get a chat completion from an OpenAI model. | No requerida |
| `generate_image` | Generate an image from a text prompt. | No requerida |

## Pinterest (`pinterest`)
Autenticación: OAuth2

| Herramienta | Qué hace | Confirmación |
|---|---|---|
| `list_boards` | List boards owned by the authenticated account. | No requerida |
| `list_pins` | List pins on a board. | No requerida |
| `create_pin` | Create a new pin from an image URL and publish it to a board. Goes live publicly immediately. | ⚠️ Requerida |

## PostgreSQL (`postgres`)
Autenticación: API Key

| Herramienta | Qué hace | Confirmación |
|---|---|---|
| `list_tables` | List tables in the connected database's public schema. | No requerida |
| `describe_table` | List a table's columns, types, and nullability. | No requerida |
| `run_query` | Run a raw SQL statement against the tenant's own connected database. Always requires explicit confirmation — even for a plain SELECT — because this connects to a database the tenant owns and controls outside OmniMCP, and reliably telling a safe read apart from a disguised write (e.g. a SELECT that calls a mutating function) from the query text alone isn't safe to automate. | ⚠️ Requerida |

## Reddit (`reddit`)
Autenticación: OAuth2

| Herramienta | Qué hace | Confirmación |
|---|---|---|
| `list_subreddit_posts` | List posts from a subreddit. | No requerida |
| `submit_post` | Submit a new post to a subreddit — a text (self) post if `text` is given, a link post if `url` is given. Goes live publicly immediately. | ⚠️ Requerida |
| `submit_comment` | Reply to a post or comment. Goes live publicly immediately. | ⚠️ Requerida |

## Shopify (`shopify`)
Autenticación: API Key

| Herramienta | Qué hace | Confirmación |
|---|---|---|
| `list_products` | List products in a Shopify store. | No requerida |
| `get_order` | Get details of a specific order. | No requerida |
| `create_product` | Create a new product (as a draft by default). | No requerida |
| `fulfill_order` | Mark an order as fulfilled/shipped — notifies the real customer and cannot be undone. | ⚠️ Requerida |

## Slack (`slack`)
Autenticación: API Key

| Herramienta | Qué hace | Confirmación |
|---|---|---|
| `list_channels` | List channels the bot can see. | No requerida |
| `send_message` | Send a text message to a channel. | ⚠️ Requerida |
| `upload_file` | Upload a file to a channel. | ⚠️ Requerida |

## Snapchat Ads (`snapchat-ads`)
Autenticación: OAuth2

| Herramienta | Qué hace | Confirmación |
|---|---|---|
| `list_organizations` | List Snapchat Ads organizations accessible to the authenticated account. | No requerida |
| `list_ad_accounts` | List ad accounts within an organization. | No requerida |
| `list_campaigns` | List campaigns in an ad account. | No requerida |
| `create_campaign` | Create a new advertising campaign. Spends real budget once activated. | ⚠️ Requerida |
| `update_campaign_status` | Pause or reactivate an existing campaign, immediately changing whether it spends budget. | ⚠️ Requerida |

## Stripe (`stripe`)
Autenticación: API Key

| Herramienta | Qué hace | Confirmación |
|---|---|---|
| `list_customers` | List customers. | No requerida |
| `create_customer` | Create a new customer. | No requerida |
| `list_charges` | List recent charges. | No requerida |
| `create_refund` | Refund a charge, in full or in part. Moves real money back to the customer and cannot be undone. | ⚠️ Requerida |

## Telegram (`telegram`)
Autenticación: API Key

| Herramienta | Qué hace | Confirmación |
|---|---|---|
| `get_me` | Get basic information about the bot itself. | No requerida |
| `get_chat` | Get information about a chat (user, group, or channel) by its ID or @username. | No requerida |
| `get_updates` | Fetch recent messages/events sent to the bot (long-poll style, non-destructive). | No requerida |
| `send_message` | Send a text message to a chat, group, or channel. | ⚠️ Requerida |
| `send_video` | Send a video to a chat, group, or channel — either fetched by Telegram from a URL, or uploaded directly as base64 content. | ⚠️ Requerida |

## TikTok Ads (`tiktok-ads`)
Autenticación: API Key

| Herramienta | Qué hace | Confirmación |
|---|---|---|
| `list_campaigns` | List campaigns for a TikTok advertiser account. | No requerida |
| `get_campaign_report` | Get performance metrics (impressions, clicks, spend, ctr) for one or more campaigns over a date range. | No requerida |
| `create_campaign` | Create a new TikTok advertising campaign. Spends real budget once activated. | ⚠️ Requerida |
| `update_campaign_status` | Pause, enable, or delete one or more campaigns, immediately changing whether they spend budget. | ⚠️ Requerida |

## TikTok Content Posting (`tiktok-content`)
Autenticación: API Key

| Herramienta | Qué hace | Confirmación |
|---|---|---|
| `get_creator_info` | Get the creator's posting eligibility, privacy options, and duet/stitch/comment settings — TikTok requires querying this before every publish. | No requerida |
| `publish_video_from_url` | Publish a video TikTok fetches from a public URL. Goes live publicly (or per the chosen privacy level) immediately. | ⚠️ Requerida |
| `get_publish_status` | Check the processing/publish status of a previously submitted video. | No requerida |

## Trello (`trello`)
Autenticación: API Key

| Herramienta | Qué hace | Confirmación |
|---|---|---|
| `list_boards` | List boards the authenticated member belongs to. | No requerida |
| `list_cards` | List cards on a board. | No requerida |
| `create_card` | Create a new card in a list. | No requerida |

## Twilio (`twilio`)
Autenticación: API Key

| Herramienta | Qué hace | Confirmación |
|---|---|---|
| `list_messages` | List recent SMS/WhatsApp messages sent or received on the account. | No requerida |
| `send_sms` | Send an SMS text message. Delivers immediately and costs real money. | ⚠️ Requerida |
| `send_whatsapp_message` | Send a WhatsApp message via Twilio's WhatsApp API. Delivers immediately. | ⚠️ Requerida |

## WhatsApp Business (`whatsapp-business`)
Autenticación: API Key

| Herramienta | Qué hace | Confirmación |
|---|---|---|
| `get_business_profile` | Get the WhatsApp Business profile (about, description, email, websites) for a phone number. | No requerida |
| `list_message_templates` | List approved message templates for a WhatsApp Business Account. | No requerida |
| `send_text_message` | Send a free-form text message to a specific recipient. Only works within the 24h customer service window unless the recipient messaged first. | ⚠️ Requerida |
| `send_template_message` | Send a pre-approved message template to a recipient — the only way to start a conversation outside the 24h window. | ⚠️ Requerida |
| `send_image_message` | Send an image to a specific recipient, from a public URL or a media ID already uploaded to WhatsApp. Only works within the 24h customer service window unless the recipient messaged first. | ⚠️ Requerida |

## WooCommerce (`woocommerce`)
Autenticación: API Key

| Herramienta | Qué hace | Confirmación |
|---|---|---|
| `list_products` | List products in a WooCommerce store. | No requerida |
| `list_orders` | List orders in a WooCommerce store. | No requerida |
| `update_order_status` | Change an order's status — can trigger customer notification emails and fulfillment workflows depending on store configuration. | ⚠️ Requerida |

## X (Twitter) (`x`)
Autenticación: API Key

| Herramienta | Qué hace | Confirmación |
|---|---|---|
| `get_me` | Get the authenticated account's profile. | No requerida |
| `create_tweet` | Publish a new post. Goes live publicly immediately. | ⚠️ Requerida |
| `delete_tweet` | Delete a post. Irreversible. | ⚠️ Requerida |

## YouTube (`youtube`)
Autenticación: OAuth2

| Herramienta | Qué hace | Confirmación |
|---|---|---|
| `list_my_videos` | List videos uploaded by the authenticated channel. | No requerida |
| `get_video_stats` | Get view/like/comment counts and snippet metadata for a video. | No requerida |
| `update_video_metadata` | Update a video's public title/description/category — changes what viewers see immediately. | ⚠️ Requerida |
| `upload_video` | Upload and publish a new video. Public once published. | ⚠️ Requerida |

## Zapier (`zapier`)
Autenticación: API Key

| Herramienta | Qué hace | Confirmación |
|---|---|---|
| `trigger_zap` | Trigger a Zap by POSTing a JSON payload to its "Webhooks by Zapier" trigger URL. What actually happens next is whatever the Zap itself does — sending emails, creating records, charging money, etc. — which this connector has no visibility into. | ⚠️ Requerida |
