import { jsonResult, startConnector } from "@omnimcp/connector-sdk-ts";
import { z } from "zod";
import { twilioRequest } from "./twilio-client.js";

const listMessagesSchema = z.object({ limit: z.number().default(20) });
const sendSmsSchema = z.object({ to: z.string(), from: z.string(), body: z.string() });
const sendWhatsappMessageSchema = z.object({ to: z.string(), from: z.string(), body: z.string() });

await startConnector({
  name: "twilio",
  version: "0.1.0",
  tools: [
    {
      name: "list_messages",
      description: "List recent SMS/WhatsApp messages on the account.",
      inputSchema: listMessagesSchema,
      async handler({ limit }) {
        const { messages } = await twilioRequest<{ messages: unknown[] }>("/Messages.json", { PageSize: String(limit) });
        return jsonResult(messages);
      },
    },
    {
      name: "send_sms",
      description: "Send an SMS text message.",
      inputSchema: sendSmsSchema,
      async handler({ to, from, body }) {
        const { sid } = await twilioRequest<{ sid: string }>("/Messages.json", { To: to, From: from, Body: body }, "POST");
        return jsonResult({ messageSid: sid });
      },
    },
    {
      name: "send_whatsapp_message",
      description: "Send a WhatsApp message via Twilio.",
      inputSchema: sendWhatsappMessageSchema,
      async handler({ to, from, body }) {
        const { sid } = await twilioRequest<{ sid: string }>(
          "/Messages.json",
          { To: `whatsapp:${to}`, From: `whatsapp:${from}`, Body: body },
          "POST",
        );
        return jsonResult({ messageSid: sid });
      },
    },
  ],
});
