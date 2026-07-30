import { jsonResult, startConnector, textResult } from "@omnimcp/connector-sdk-ts";
import { z } from "zod";
import { klaviyoRequest } from "./klaviyo-client.js";

const listListsSchema = z.object({});
const createProfileSchema = z.object({ email: z.string(), firstName: z.string().optional(), lastName: z.string().optional() });
const trackEventSchema = z.object({
  profileEmail: z.string(),
  metricName: z.string(),
  properties: z.record(z.unknown()).default({}),
});

await startConnector({
  name: "klaviyo",
  version: "0.1.0",
  tools: [
    {
      name: "list_lists",
      description: "List subscriber lists in the account.",
      inputSchema: listListsSchema,
      async handler() {
        const { data } = await klaviyoRequest<{ data: unknown[] }>("/lists");
        return jsonResult(data);
      },
    },
    {
      name: "create_profile",
      description: "Create or update a customer profile.",
      inputSchema: createProfileSchema,
      async handler({ email, firstName, lastName }) {
        const { data } = await klaviyoRequest<{ data: { id: string } }>(
          "/profiles",
          {
            data: {
              type: "profile",
              attributes: {
                email,
                ...(firstName ? { first_name: firstName } : {}),
                ...(lastName ? { last_name: lastName } : {}),
              },
            },
          },
          "POST",
        );
        return jsonResult({ profileId: data.id });
      },
    },
    {
      name: "track_event",
      description: "Record a custom event for a profile.",
      inputSchema: trackEventSchema,
      async handler({ profileEmail, metricName, properties }) {
        await klaviyoRequest(
          "/events",
          {
            data: {
              type: "event",
              attributes: {
                properties,
                metric: { data: { type: "metric", attributes: { name: metricName } } },
                profile: { data: { type: "profile", attributes: { email: profileEmail } } },
              },
            },
          },
          "POST",
        );
        return textResult(`Tracked "${metricName}" for ${profileEmail}`);
      },
    },
  ],
});
