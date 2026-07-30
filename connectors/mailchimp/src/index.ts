import { jsonResult, startConnector, textResult } from "@omnimcp/connector-sdk-ts";
import { z } from "zod";
import { mailchimpRequest, subscriberHash } from "./mailchimp-client.js";

const listAudiencesSchema = z.object({});
const listCampaignsSchema = z.object({});
const addListMemberSchema = z.object({
  listId: z.string(),
  email: z.string(),
  status: z.enum(["subscribed", "unsubscribed", "pending", "cleaned"]).default("subscribed"),
});

await startConnector({
  name: "mailchimp",
  version: "0.1.0",
  tools: [
    {
      name: "list_audiences",
      description: "List audiences (mailing lists) in the account.",
      inputSchema: listAudiencesSchema,
      async handler() {
        const { lists } = await mailchimpRequest<{ lists: unknown[] }>("/lists");
        return jsonResult(lists);
      },
    },
    {
      name: "list_campaigns",
      description: "List email campaigns in the account.",
      inputSchema: listCampaignsSchema,
      async handler() {
        const { campaigns } = await mailchimpRequest<{ campaigns: unknown[] }>("/campaigns");
        return jsonResult(campaigns);
      },
    },
    {
      name: "add_list_member",
      description: "Add or update a subscriber on an audience.",
      inputSchema: addListMemberSchema,
      async handler({ listId, email, status }) {
        await mailchimpRequest(
          `/lists/${listId}/members/${subscriberHash(email)}`,
          { email_address: email, status_if_new: status, status },
          "PUT",
        );
        return textResult(`${email} added to list ${listId} with status ${status}`);
      },
    },
  ],
});
