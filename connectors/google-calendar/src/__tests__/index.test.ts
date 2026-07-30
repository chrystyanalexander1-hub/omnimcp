import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ToolDefinition } from "@omnimcp/connector-sdk-ts";

const tools = new Map<string, ToolDefinition<any>>();

vi.mock("@omnimcp/connector-sdk-ts", async () => {
  const actual = await vi.importActual<typeof import("@omnimcp/connector-sdk-ts")>("@omnimcp/connector-sdk-ts");
  return {
    ...actual,
    startConnector: vi.fn(async (definition: { tools: ReadonlyArray<ToolDefinition<any>> }) => {
      for (const tool of definition.tools) {
        tools.set(tool.name, {
          ...tool,
          async handler(input: any) {
            try {
              return await tool.handler(input);
            } catch (err) {
              return actual.errorResult(err instanceof Error ? err.message : String(err));
            }
          },
        });
      }
    }),
  };
});

vi.mock("../google-auth.js", () => ({
  getAccessToken: vi.fn().mockResolvedValue("test-access-token"),
}));

function textOf(result: { content: Array<{ type: "text"; text: string }> }): string {
  return result.content[0]!.text;
}

function jsonOf(result: { content: Array<{ type: "text"; text: string }> }): unknown {
  return JSON.parse(textOf(result));
}

function mockFetchResponses(...responses: Array<{ body: unknown; ok?: boolean; status?: number }>) {
  const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
  for (const { body, ok = true, status = ok ? 200 : 400 } of responses) {
    fetchMock.mockResolvedValueOnce({ ok, status, json: async () => body });
  }
}

beforeAll(async () => {
  await import("../index.js");
});

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

describe("list_events", () => {
  const tool = () => tools.get("list_events")!;

  it("lists upcoming events on the primary calendar by default", async () => {
    mockFetchResponses({ body: { items: [{ id: "e1", summary: "Standup" }] } });

    const result = await tool().handler({ calendarId: "primary", maxResults: 20 });

    const [url] = (fetch as any).mock.calls[0];
    expect(String(url)).toContain("/calendars/primary/events");
    expect((url as URL).searchParams.get("singleEvents")).toBe("true");
    expect(jsonOf(result)).toEqual([{ id: "e1", summary: "Standup" }]);
  });

  it("surfaces a Google Calendar API error as an error result", async () => {
    mockFetchResponses({ body: { error: { message: "Calendar not found" } }, ok: false });

    const result = await tool().handler({ calendarId: "missing", maxResults: 20 });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("Calendar not found");
  });
});

describe("create_event", () => {
  const tool = () => tools.get("create_event")!;

  it("creates an event with attendees", async () => {
    mockFetchResponses({ body: { id: "e2", htmlLink: "https://calendar.google.com/event?e2" } });

    const result = await tool().handler({
      calendarId: "primary",
      summary: "Planning",
      startDateTime: "2026-01-01T10:00:00Z",
      endDateTime: "2026-01-01T11:00:00Z",
      attendeeEmails: ["a@b.com"],
      sendUpdates: "none",
    });

    const [url, init] = (fetch as any).mock.calls[0];
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body);
    expect(body.summary).toBe("Planning");
    expect(body.attendees).toEqual([{ email: "a@b.com" }]);
    expect((url as URL).searchParams.get("sendUpdates")).toBe("none");
    expect(jsonOf(result)).toEqual({ eventId: "e2", url: "https://calendar.google.com/event?e2" });
  });
});

describe("delete_event", () => {
  const tool = () => tools.get("delete_event")!;

  it("deletes an event", async () => {
    (fetch as any).mockResolvedValueOnce({ ok: true, status: 204 });

    const result = await tool().handler({ calendarId: "primary", eventId: "e1" });

    const [url, init] = (fetch as any).mock.calls[0];
    expect(String(url)).toContain("/events/e1");
    expect(init.method).toBe("DELETE");
    expect(textOf(result)).toContain("Deleted event e1");
  });

  it("treats HTTP 410 (already deleted) as success, not an error", async () => {
    (fetch as any).mockResolvedValueOnce({ ok: false, status: 410 });

    const result = await tool().handler({ calendarId: "primary", eventId: "e1" });

    expect(result.isError).toBeUndefined();
    expect(textOf(result)).toContain("Deleted event e1");
  });
});
