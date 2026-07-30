import { errorResult, jsonResult, startConnector } from "@omnimcp/connector-sdk-ts";
import { z } from "zod";
import { WhatsAppApiError, graphRequest, uploadMedia } from "./graph-client.js";

const getBusinessProfileSchema = z.object({ phoneNumberId: z.string() });
const listMessageTemplatesSchema = z.object({ wabaId: z.string() });

const uploadMediaSchema = z.object({
  phoneNumberId: z.string(),
  contentBase64: z.string(),
  mimeType: z.string(),
  filename: z.string().optional(),
});

const sendTextMessageSchema = z.object({
  phoneNumberId: z.string(),
  to: z.string(),
  body: z.string(),
});

const sendTemplateMessageSchema = z.object({
  phoneNumberId: z.string(),
  to: z.string(),
  templateName: z.string(),
  languageCode: z.string(),
  bodyParameters: z.array(z.string()).default([]),
});

const sendImageMessageSchema = z.object({
  phoneNumberId: z.string(),
  to: z.string(),
  link: z.string().optional(),
  mediaId: z.string().optional(),
  contentBase64: z.string().optional(),
  mimeType: z.string().optional(),
  caption: z.string().optional(),
});

const sendAudioMessageSchema = z.object({
  phoneNumberId: z.string(),
  to: z.string(),
  link: z.string().optional(),
  mediaId: z.string().optional(),
  contentBase64: z.string().optional(),
  mimeType: z.string().optional(),
});

const sendVideoMessageSchema = z.object({
  phoneNumberId: z.string(),
  to: z.string(),
  link: z.string().optional(),
  mediaId: z.string().optional(),
  contentBase64: z.string().optional(),
  mimeType: z.string().optional(),
  caption: z.string().optional(),
});

async function safe<T>(fn: () => Promise<T>) {
  try {
    return { ok: true as const, value: await fn() };
  } catch (err) {
    const message = err instanceof WhatsAppApiError || err instanceof Error ? err.message : String(err);
    return { ok: false as const, message };
  }
}

/** Resolves a `send_*_message` tool's media reference to a media id, uploading contentBase64 first if that's what was given. `link` needs no resolution — it's passed straight to the messages endpoint. */
async function resolveMediaId(
  phoneNumberId: string,
  opts: { mediaId?: string; contentBase64?: string; mimeType?: string },
): Promise<string | undefined> {
  if (opts.mediaId) return opts.mediaId;
  if (opts.contentBase64) {
    if (!opts.mimeType) throw new WhatsAppApiError("mimeType is required when sending contentBase64.");
    return (await uploadMedia(phoneNumberId, opts.contentBase64, opts.mimeType)).id;
  }
  return undefined;
}

await startConnector({
  name: "whatsapp-business",
  version: "0.1.0",
  tools: [
    {
      name: "get_business_profile",
      description: "Get the WhatsApp Business profile for a phone number.",
      inputSchema: getBusinessProfileSchema,
      async handler({ phoneNumberId }) {
        const result = await safe(() =>
          graphRequest(`${phoneNumberId}/whatsapp_business_profile`, {
            fields: "about,address,description,email,profile_picture_url,websites,vertical",
          }),
        );
        return result.ok ? jsonResult(result.value) : errorResult(result.message);
      },
    },
    {
      name: "list_message_templates",
      description: "List approved message templates for a WhatsApp Business Account.",
      inputSchema: listMessageTemplatesSchema,
      async handler({ wabaId }) {
        const result = await safe(() => graphRequest<{ data: unknown[] }>(`${wabaId}/message_templates`));
        return result.ok ? jsonResult(result.value.data) : errorResult(result.message);
      },
    },
    {
      name: "send_text_message",
      description: "Send a free-form text message to a specific recipient.",
      inputSchema: sendTextMessageSchema,
      async handler({ phoneNumberId, to, body }) {
        const result = await safe(() =>
          graphRequest<{ messages: Array<{ id: string }> }>(
            `${phoneNumberId}/messages`,
            { messaging_product: "whatsapp", to, type: "text", text: { body } },
            "POST",
          ),
        );
        return result.ok ? jsonResult({ messageId: result.value.messages[0]?.id }) : errorResult(result.message);
      },
    },
    {
      name: "send_template_message",
      description: "Send a pre-approved message template to a recipient.",
      inputSchema: sendTemplateMessageSchema,
      async handler({ phoneNumberId, to, templateName, languageCode, bodyParameters }) {
        const result = await safe(() =>
          graphRequest<{ messages: Array<{ id: string }> }>(
            `${phoneNumberId}/messages`,
            {
              messaging_product: "whatsapp",
              to,
              type: "template",
              template: {
                name: templateName,
                language: { code: languageCode },
                ...(bodyParameters.length > 0
                  ? { components: [{ type: "body", parameters: bodyParameters.map((text: string) => ({ type: "text", text })) }] }
                  : {}),
              },
            },
            "POST",
          ),
        );
        return result.ok ? jsonResult({ messageId: result.value.messages[0]?.id }) : errorResult(result.message);
      },
    },
    {
      name: "send_image_message",
      description: "Send an image to a specific recipient, from a public URL, an already-uploaded media ID, or raw base64 content.",
      inputSchema: sendImageMessageSchema,
      async handler({ phoneNumberId, to, link, mediaId, contentBase64, mimeType, caption }) {
        if (!link && !mediaId && !contentBase64) return errorResult("Provide link, mediaId, or contentBase64.");
        const result = await safe(async () => {
          const resolvedId = await resolveMediaId(phoneNumberId, { mediaId, contentBase64, mimeType });
          return graphRequest<{ messages: Array<{ id: string }> }>(
            `${phoneNumberId}/messages`,
            {
              messaging_product: "whatsapp",
              to,
              type: "image",
              image: { ...(resolvedId ? { id: resolvedId } : { link }), ...(caption ? { caption } : {}) },
            },
            "POST",
          );
        });
        return result.ok ? jsonResult({ messageId: result.value.messages[0]?.id }) : errorResult(result.message);
      },
    },
    {
      name: "upload_media",
      description: "Upload media bytes to WhatsApp ahead of sending, returning a media id reusable across multiple send_*_message calls.",
      inputSchema: uploadMediaSchema,
      async handler({ phoneNumberId, contentBase64, mimeType, filename }) {
        const result = await safe(() => uploadMedia(phoneNumberId, contentBase64, mimeType, filename));
        return result.ok ? jsonResult({ mediaId: result.value.id }) : errorResult(result.message);
      },
    },
    {
      name: "send_audio_message",
      description: "Send an audio message to a specific recipient, from a public URL, an already-uploaded media ID, or raw base64 content.",
      inputSchema: sendAudioMessageSchema,
      async handler({ phoneNumberId, to, link, mediaId, contentBase64, mimeType }) {
        if (!link && !mediaId && !contentBase64) return errorResult("Provide link, mediaId, or contentBase64.");
        const result = await safe(async () => {
          const resolvedId = await resolveMediaId(phoneNumberId, { mediaId, contentBase64, mimeType });
          return graphRequest<{ messages: Array<{ id: string }> }>(
            `${phoneNumberId}/messages`,
            { messaging_product: "whatsapp", to, type: "audio", audio: resolvedId ? { id: resolvedId } : { link } },
            "POST",
          );
        });
        return result.ok ? jsonResult({ messageId: result.value.messages[0]?.id }) : errorResult(result.message);
      },
    },
    {
      name: "send_video_message",
      description: "Send a video to a specific recipient, from a public URL, an already-uploaded media ID, or raw base64 content.",
      inputSchema: sendVideoMessageSchema,
      async handler({ phoneNumberId, to, link, mediaId, contentBase64, mimeType, caption }) {
        if (!link && !mediaId && !contentBase64) return errorResult("Provide link, mediaId, or contentBase64.");
        const result = await safe(async () => {
          const resolvedId = await resolveMediaId(phoneNumberId, { mediaId, contentBase64, mimeType });
          return graphRequest<{ messages: Array<{ id: string }> }>(
            `${phoneNumberId}/messages`,
            {
              messaging_product: "whatsapp",
              to,
              type: "video",
              video: { ...(resolvedId ? { id: resolvedId } : { link }), ...(caption ? { caption } : {}) },
            },
            "POST",
          );
        });
        return result.ok ? jsonResult({ messageId: result.value.messages[0]?.id }) : errorResult(result.message);
      },
    },
  ],
});
