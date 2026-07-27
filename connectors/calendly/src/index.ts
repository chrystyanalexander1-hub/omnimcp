import { errorResult, jsonResult, startConnector, textResult } from "@omnimcp/connector-sdk-ts";
import { z } from "zod";
import { CalendlyApiError, calendlyRequest } from "./calendly-client.js";

const getMyUserSchema = z.object({});
const listEventTypesSchema = z.object({ userUri: z.string() });
const listScheduledEventsSchema = z.object({ userUri: z.string(), status: z.enum(["active", "canceled"]).optional() });
const cancelScheduledEventSchema = z.object({ eventUuid: z.string(), reason: z.string().optional() });

async function safe<T>(fn: () => Promise<T>) {
  try {
    return { ok: true as const, value: await fn() };
  } catch (err) {
    const message = err instanceof CalendlyApiError || err instanceof Error ? err.message : String(err);
    return { ok: false as const, message };
  }
}

/** Calendly's URIs are full https://api.calendly.com/... links; the cancellation endpoint wants just the trailing UUID. Accepts either. */
function uuidFromUriOrValue(value: string): string {
  const parts = value.split("/");
  return parts[parts.length - 1] ?? value;
}

await startConnector({
  name: "calendly",
  version: "0.1.0",
  tools: [
    {
      name: "get_my_user",
      description: "Get the authenticated user's own info and URI.",
      inputSchema: getMyUserSchema,
      async handler() {
        const result = await safe(() => calendlyRequest<{ resource: unknown }>("/users/me"));
        return result.ok ? jsonResult(result.value.resource) : errorResult(result.message);
      },
    },
    {
      name: "list_event_types",
      description: "List bookable event types for a user.",
      inputSchema: listEventTypesSchema,
      async handler({ userUri }) {
        const result = await safe(() => calendlyRequest<{ collection: unknown[] }>("/event_types", { user: userUri }));
        return result.ok ? jsonResult(result.value.collection) : errorResult(result.message);
      },
    },
    {
      name: "list_scheduled_events",
      description: "List scheduled meetings for a user.",
      inputSchema: listScheduledEventsSchema,
      async handler({ userUri, status }) {
        const result = await safe(() =>
          calendlyRequest<{ collection: unknown[] }>("/scheduled_events", {
            user: userUri,
            ...(status ? { status } : {}),
          }),
        );
        return result.ok ? jsonResult(result.value.collection) : errorResult(result.message);
      },
    },
    {
      name: "cancel_scheduled_event",
      description: "Cancel a scheduled meeting and notify the invitee.",
      inputSchema: cancelScheduledEventSchema,
      async handler({ eventUuid, reason }) {
        const result = await safe(() =>
          calendlyRequest(
            `/scheduled_events/${uuidFromUriOrValue(eventUuid)}/cancellation`,
            reason ? { reason } : {},
            "POST",
          ),
        );
        return result.ok ? textResult(`Event ${eventUuid} canceled`) : errorResult(result.message);
      },
    },
  ],
});
