import { errorResult, jsonResult, startConnector, textResult } from "@omnimcp/connector-sdk-ts";
import { z } from "zod";
import { KlaviyoApiError, klaviyoRequest } from "./klaviyo-client.js";

const listListsSchema = z.object({});
const createProfileSchema = z.object({ email: z.string(), firstName: z.string().optional(), lastName: z.string().optional() });
const trackEventSchema = z.object({
  profileEmail: z.string(),
  metricName: z.string(),
  properties: z.record(z.unknown()).default({}),
});

async function safe<T>(fn: () => Promise<T>) {
  try {
    return { ok: true as const, value: await fn() };
  } catch (err) {
    const message = err instanceof KlaviyoApiError || err instanceof Error ? err.message : String(err);
    return { ok: false as const, message };
  }
}

await startConnector({
  name: "klaviyo",
  version: "0.1.0",
  tools: [
    {
      name: "list_lists",
      description: "List subscriber lists in the account.",
      inputSchema: listListsSchema,
      async handler() {
        const result = await safe(() => klaviyoRequest<{ data: unknown[] }>("/lists"));
        return result.ok ? jsonResult(result.value.data) : errorResult(result.message);
      },
    },
    {
      name: "create_profile",
      description: "Create or update a customer profile.",
      inputSchema: createProfileSchema,
      async handler({ email, firstName, lastName }) {
        const result = await safe(() =>
          klaviyoRequest<{ data: { id: string } }>(
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
          ),
        );
        return result.ok ? jsonResult({ profileId: result.value.data.id }) : errorResult(result.message);
      },
    },
    {
      name: "track_event",
      description: "Record a custom event for a profile.",
      inputSchema: trackEventSchema,
      async handler({ profileEmail, metricName, properties }) {
        const result = await safe(() =>
          klaviyoRequest(
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
          ),
        );
        return result.ok ? textResult(`Tracked "${metricName}" for ${profileEmail}`) : errorResult(result.message);
      },
    },
  ],
});
