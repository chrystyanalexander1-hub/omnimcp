import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ToolDefinition } from "@omnimcp/connector-sdk-ts";

const tools = new Map<string, ToolDefinition<any>>();

vi.mock("@omnimcp/connector-sdk-ts", async () => {
  const actual = await vi.importActual<typeof import("@omnimcp/connector-sdk-ts")>("@omnimcp/connector-sdk-ts");
  return {
    ...actual,
    startConnector: vi.fn(async (definition: { tools: ReadonlyArray<ToolDefinition<any>> }) => {
      // Wraps each handler the same way the real startConnector does, so a thrown
      // error surfaces as an errorResult here too instead of failing the test.
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
  process.env.CALENDLY_API_KEY = "test-api-key";
  await import("../index.js");
});

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

describe("get_my_user", () => {
  const tool = () => tools.get("get_my_user")!;

  it("fetches the authenticated user's own info", async () => {
    mockFetchResponses({ body: { resource: { uri: "https://api.calendly.com/users/1", name: "Ada" } } });

    const result = await tool().handler({});

    const [url, init] = (fetch as any).mock.calls[0];
    expect(String(url)).toContain("/users/me");
    expect(init.headers.Authorization).toBe("Bearer test-api-key");
    expect(jsonOf(result)).toEqual({ uri: "https://api.calendly.com/users/1", name: "Ada" });
  });

  it("surfaces a Calendly API error as an error result", async () => {
    mockFetchResponses({ body: { message: "Invalid token" }, ok: false });

    const result = await tool().handler({});

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("Invalid token");
  });
});

describe("list_event_types", () => {
  const tool = () => tools.get("list_event_types")!;

  it("lists event types for a user", async () => {
    mockFetchResponses({ body: { collection: [{ name: "30 Minute Meeting" }] } });

    const result = await tool().handler({ userUri: "https://api.calendly.com/users/1" });

    const [url] = (fetch as any).mock.calls[0];
    expect((url as URL).searchParams.get("user")).toBe("https://api.calendly.com/users/1");
    expect(jsonOf(result)).toEqual([{ name: "30 Minute Meeting" }]);
  });
});

describe("list_scheduled_events", () => {
  const tool = () => tools.get("list_scheduled_events")!;

  it("lists scheduled events, optionally filtered by status", async () => {
    mockFetchResponses({ body: { collection: [{ uri: "event-1" }] } });

    const result = await tool().handler({ userUri: "https://api.calendly.com/users/1", status: "active" });

    const [url] = (fetch as any).mock.calls[0];
    expect((url as URL).searchParams.get("status")).toBe("active");
    expect(jsonOf(result)).toEqual([{ uri: "event-1" }]);
  });
});

describe("cancel_scheduled_event", () => {
  const tool = () => tools.get("cancel_scheduled_event")!;

  it("cancels an event by uuid, extracting it from a full URI", async () => {
    mockFetchResponses({ body: {} });

    const result = await tool().handler({
      eventUuid: "https://api.calendly.com/scheduled_events/abc-123",
      reason: "No longer needed",
    });

    const [url, init] = (fetch as any).mock.calls[0];
    expect(String(url)).toContain("/scheduled_events/abc-123/cancellation");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ reason: "No longer needed" });
    expect(textOf(result)).toContain("canceled");
  });

  it("surfaces a Calendly API error as an error result", async () => {
    mockFetchResponses({ body: { title: "Not Found" }, ok: false });

    const result = await tool().handler({ eventUuid: "missing" });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("Not Found");
  });
});
