import { errorResult, jsonResult, startConnector } from "@omnimcp/connector-sdk-ts";
import { z } from "zod";
import { WhatsAppApiError, graphRequest } from "./graph-client.js";

const getBusinessProfileSchema = z.object({ phoneNumberId: z.string() });
const listMessageTemplatesSchema = z.object({ wabaId: z.string() });

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
      description: "Send an image to a specific recipient, from a public URL or an already-uploaded media ID.",
      inputSchema: sendImageMessageSchema,
      async handler({ phoneNumberId, to, link, mediaId, caption }) {
        if (!link && !mediaId) return errorResult("Provide either link or mediaId.");
        const result = await safe(() =>
          graphRequest<{ messages: Array<{ id: string }> }>(
            `${phoneNumberId}/messages`,
            {
              messaging_product: "whatsapp",
              to,
              type: "image",
              image: {
                ...(link ? { link } : { id: mediaId }),
                ...(caption ? { caption } : {}),
              },
            },
            "POST",
          ),
        );
        return result.ok ? jsonResult({ messageId: result.value.messages[0]?.id }) : errorResult(result.message);
      },
    },
  ],
});
