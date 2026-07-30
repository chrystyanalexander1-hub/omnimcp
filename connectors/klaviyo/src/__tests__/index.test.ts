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

function textOf(result: { content: Array<{ type: "text"; text: string }> }): string {
  return result.content[0]!.text;
}

function jsonOf(result: { content: Array<{ type: "text"; text: string }> }): unknown {
  return JSON.parse(textOf(result));
}

beforeAll(async () => {
  process.env.KLAVIYO_API_KEY = "test-api-key";
  await import("../index.js");
});

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

describe("list_lists", () => {
  const tool = () => tools.get("list_lists")!;

  it("lists subscriber lists", async () => {
    (fetch as any).mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ data: [{ id: "list1" }] }) });

    const result = await tool().handler({});

    const [url, init] = (fetch as any).mock.calls[0];
    expect(String(url)).toContain("/lists");
    expect(init.headers.Authorization).toBe("Klaviyo-API-Key test-api-key");
    expect(init.headers.revision).toBeTruthy();
    expect(jsonOf(result)).toEqual([{ id: "list1" }]);
  });

  it("surfaces a Klaviyo API error as an error result", async () => {
    (fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => JSON.stringify({ errors: [{ detail: "Invalid API key" }] }),
    });

    const result = await tool().handler({});

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("Invalid API key");
  });
});

describe("create_profile", () => {
  const tool = () => tools.get("create_profile")!;

  it("creates or updates a customer profile", async () => {
    (fetch as any).mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({ data: { id: "profile-1" } }),
    });

    const result = await tool().handler({ email: "a@b.com", firstName: "Ada" });

    const [, init] = (fetch as any).mock.calls[0];
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body);
    expect(body.data.attributes).toMatchObject({ email: "a@b.com", first_name: "Ada" });
    expect(jsonOf(result)).toEqual({ profileId: "profile-1" });
  });
});

describe("track_event", () => {
  const tool = () => tools.get("track_event")!;

  it("records a custom event for a profile", async () => {
    (fetch as any).mockResolvedValueOnce({ ok: true, status: 202, json: async () => ({}) });

    const result = await tool().handler({
      profileEmail: "a@b.com",
      metricName: "Placed Order",
      properties: { total: 100 },
    });

    const [, init] = (fetch as any).mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body.data.attributes.metric.data.attributes.name).toBe("Placed Order");
    expect(body.data.attributes.profile.data.attributes.email).toBe("a@b.com");
    expect(textOf(result)).toContain('Tracked "Placed Order" for a@b.com');
  });
});
