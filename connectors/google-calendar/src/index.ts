import { jsonResult, startConnector, textResult } from "@omnimcp/connector-sdk-ts";
import { z } from "zod";
import { getAccessToken } from "./google-auth.js";

const CALENDAR_API = "https://www.googleapis.com/calendar/v3";

export class GoogleCalendarApiError extends Error {}

const listEventsSchema = z.object({
  calendarId: z.string().default("primary"),
  timeMin: z.string().optional(),
  timeMax: z.string().optional(),
  maxResults: z.number().default(20),
});
const createEventSchema = z.object({
  calendarId: z.string().default("primary"),
  summary: z.string(),
  description: z.string().optional(),
  startDateTime: z.string(),
  endDateTime: z.string(),
  attendeeEmails: z.array(z.string()).default([]),
  sendUpdates: z.enum(["all", "externalOnly", "none"]).default("none"),
});
const deleteEventSchema = z.object({ calendarId: z.string().default("primary"), eventId: z.string() });

async function handle<T>(res: Response): Promise<T> {
  const json = (await res.json()) as { error?: { message?: string } } & T;
  if (!res.ok) {
    throw new GoogleCalendarApiError(json.error?.message ?? `Google Calendar API error: HTTP ${res.status}`);
  }
  return json;
}

await startConnector({
  name: "google-calendar",
  version: "0.1.0",
  tools: [
    {
      name: "list_events",
      description: "List upcoming events on a calendar.",
      inputSchema: listEventsSchema,
      async handler({ calendarId, timeMin, timeMax, maxResults }) {
        const token = await getAccessToken();
        const url = new URL(`${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events`);
        url.searchParams.set("maxResults", String(maxResults));
        url.searchParams.set("singleEvents", "true");
        url.searchParams.set("orderBy", "startTime");
        url.searchParams.set("timeMin", timeMin ?? new Date().toISOString());
        if (timeMax) url.searchParams.set("timeMax", timeMax);
        const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        const { items } = await handle<{ items?: unknown[] }>(res);
        return jsonResult(items ?? []);
      },
    },
    {
      name: "create_event",
      description: "Create a new calendar event.",
      inputSchema: createEventSchema,
      async handler({ calendarId, summary, description, startDateTime, endDateTime, attendeeEmails, sendUpdates }) {
        const token = await getAccessToken();
        const url = new URL(`${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events`);
        url.searchParams.set("sendUpdates", sendUpdates);
        const res = await fetch(url, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            summary,
            ...(description ? { description } : {}),
            start: { dateTime: startDateTime },
            end: { dateTime: endDateTime },
            ...(attendeeEmails.length > 0 ? { attendees: attendeeEmails.map((email: string) => ({ email })) } : {}),
          }),
        });
        const { id, htmlLink } = await handle<{ id: string; htmlLink: string }>(res);
        return jsonResult({ eventId: id, url: htmlLink });
      },
    },
    {
      name: "delete_event",
      description: "Delete a calendar event.",
      inputSchema: deleteEventSchema,
      async handler({ calendarId, eventId }) {
        const token = await getAccessToken();
        const res = await fetch(
          `${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
          { method: "DELETE", headers: { Authorization: `Bearer ${token}` } },
        );
        if (!res.ok && res.status !== 410) throw new GoogleCalendarApiError(`Google Calendar API error: HTTP ${res.status}`);
        return textResult(`Deleted event ${eventId}`);
      },
    },
  ],
});
