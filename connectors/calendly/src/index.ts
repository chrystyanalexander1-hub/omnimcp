import { jsonResult, startConnector, textResult } from "@omnimcp/connector-sdk-ts";
import { z } from "zod";
import { calendlyRequest } from "./calendly-client.js";

const getMyUserSchema = z.object({});
const listEventTypesSchema = z.object({ userUri: z.string() });
const listScheduledEventsSchema = z.object({ userUri: z.string(), status: z.enum(["active", "canceled"]).optional() });
const cancelScheduledEventSchema = z.object({ eventUuid: z.string(), reason: z.string().optional() });

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
        const { resource } = await calendlyRequest<{ resource: unknown }>("/users/me");
        return jsonResult(resource);
      },
    },
    {
      name: "list_event_types",
      description: "List bookable event types for a user.",
      inputSchema: listEventTypesSchema,
      async handler({ userUri }) {
        const { collection } = await calendlyRequest<{ collection: unknown[] }>("/event_types", { user: userUri });
        return jsonResult(collection);
      },
    },
    {
      name: "list_scheduled_events",
      description: "List scheduled meetings for a user.",
      inputSchema: listScheduledEventsSchema,
      async handler({ userUri, status }) {
        const { collection } = await calendlyRequest<{ collection: unknown[] }>("/scheduled_events", {
          user: userUri,
          ...(status ? { status } : {}),
        });
        return jsonResult(collection);
      },
    },
    {
      name: "cancel_scheduled_event",
      description: "Cancel a scheduled meeting and notify the invitee.",
      inputSchema: cancelScheduledEventSchema,
      async handler({ eventUuid, reason }) {
        await calendlyRequest(
          `/scheduled_events/${uuidFromUriOrValue(eventUuid)}/cancellation`,
          reason ? { reason } : {},
          "POST",
        );
        return textResult(`Event ${eventUuid} canceled`);
      },
    },
  ],
});
