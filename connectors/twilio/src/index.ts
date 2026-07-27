import { errorResult, jsonResult, startConnector } from "@omnimcp/connector-sdk-ts";
import { z } from "zod";
import { TwilioApiError, twilioRequest } from "./twilio-client.js";

const listMessagesSchema = z.object({ limit: z.number().default(20) });
const sendSmsSchema = z.object({ to: z.string(), from: z.string(), body: z.string() });
const sendWhatsappMessageSchema = z.object({ to: z.string(), from: z.string(), body: z.string() });

async function safe<T>(fn: () => Promise<T>) {
  try {
    return { ok: true as const, value: await fn() };
  } catch (err) {
    const message = err instanceof TwilioApiError || err instanceof Error ? err.message : String(err);
    return { ok: false as const, message };
  }
}

await startConnector({
  name: "twilio",
  version: "0.1.0",
  tools: [
    {
      name: "list_messages",
      description: "List recent SMS/WhatsApp messages on the account.",
      inputSchema: listMessagesSchema,
      async handler({ limit }) {
        const result = await safe(() =>
          twilioRequest<{ messages: unknown[] }>("/Messages.json", { PageSize: String(limit) }),
        );
        return result.ok ? jsonResult(result.value.messages) : errorResult(result.message);
      },
    },
    {
      name: "send_sms",
      description: "Send an SMS text message.",
      inputSchema: sendSmsSchema,
      async handler({ to, from, body }) {
        const result = await safe(() =>
          twilioRequest<{ sid: string }>("/Messages.json", { To: to, From: from, Body: body }, "POST"),
        );
        return result.ok ? jsonResult({ messageSid: result.value.sid }) : errorResult(result.message);
      },
    },
    {
      name: "send_whatsapp_message",
      description: "Send a WhatsApp message via Twilio.",
      inputSchema: sendWhatsappMessageSchema,
      async handler({ to, from, body }) {
        const result = await safe(() =>
          twilioRequest<{ sid: string }>(
            "/Messages.json",
            { To: `whatsapp:${to}`, From: `whatsapp:${from}`, Body: body },
            "POST",
          ),
        );
        return result.ok ? jsonResult({ messageSid: result.value.sid }) : errorResult(result.message);
      },
    },
  ],
});
