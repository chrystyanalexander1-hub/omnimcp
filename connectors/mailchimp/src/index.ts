import { errorResult, jsonResult, startConnector, textResult } from "@omnimcp/connector-sdk-ts";
import { z } from "zod";
import { MailchimpApiError, mailchimpRequest, subscriberHash } from "./mailchimp-client.js";

const listAudiencesSchema = z.object({});
const listCampaignsSchema = z.object({});
const addListMemberSchema = z.object({
  listId: z.string(),
  email: z.string(),
  status: z.enum(["subscribed", "unsubscribed", "pending", "cleaned"]).default("subscribed"),
});

async function safe<T>(fn: () => Promise<T>) {
  try {
    return { ok: true as const, value: await fn() };
  } catch (err) {
    const message = err instanceof MailchimpApiError || err instanceof Error ? err.message : String(err);
    return { ok: false as const, message };
  }
}

await startConnector({
  name: "mailchimp",
  version: "0.1.0",
  tools: [
    {
      name: "list_audiences",
      description: "List audiences (mailing lists) in the account.",
      inputSchema: listAudiencesSchema,
      async handler() {
        const result = await safe(() => mailchimpRequest<{ lists: unknown[] }>("/lists"));
        return result.ok ? jsonResult(result.value.lists) : errorResult(result.message);
      },
    },
    {
      name: "list_campaigns",
      description: "List email campaigns in the account.",
      inputSchema: listCampaignsSchema,
      async handler() {
        const result = await safe(() => mailchimpRequest<{ campaigns: unknown[] }>("/campaigns"));
        return result.ok ? jsonResult(result.value.campaigns) : errorResult(result.message);
      },
    },
    {
      name: "add_list_member",
      description: "Add or update a subscriber on an audience.",
      inputSchema: addListMemberSchema,
      async handler({ listId, email, status }) {
        const result = await safe(() =>
          mailchimpRequest(
            `/lists/${listId}/members/${subscriberHash(email)}`,
            { email_address: email, status_if_new: status, status },
            "PUT",
          ),
        );
        return result.ok ? textResult(`${email} added to list ${listId} with status ${status}`) : errorResult(result.message);
      },
    },
  ],
});
