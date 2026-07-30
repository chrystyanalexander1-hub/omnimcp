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
  process.env.N8N_API_KEY = "test-api-key";
  await import("../index.js");
});

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

describe("list_workflows", () => {
  const tool = () => tools.get("list_workflows")!;

  it("lists workflows on a self-hosted instance", async () => {
    (fetch as any).mockResolvedValueOnce({ ok: true, json: async () => ({ data: [{ id: "1", name: "My workflow" }] }) });

    const result = await tool().handler({ baseUrl: "https://n8n.example.com" });

    const [url, init] = (fetch as any).mock.calls[0];
    expect(url).toBe("https://n8n.example.com/api/v1/workflows");
    expect(init.headers["X-N8N-API-KEY"]).toBe("test-api-key");
    expect(jsonOf(result)).toEqual([{ id: "1", name: "My workflow" }]);
  });

  it("strips a trailing slash from baseUrl", async () => {
    (fetch as any).mockResolvedValueOnce({ ok: true, json: async () => ({ data: [] }) });

    await tool().handler({ baseUrl: "https://n8n.example.com/" });

    expect((fetch as any).mock.calls[0][0]).toBe("https://n8n.example.com/api/v1/workflows");
  });

  it("surfaces an n8n API error as an error result", async () => {
    (fetch as any).mockResolvedValueOnce({ ok: false, status: 401, text: async () => "Unauthorized" });

    const result = await tool().handler({ baseUrl: "https://n8n.example.com" });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("HTTP 401");
  });
});

describe("trigger_webhook", () => {
  const tool = () => tools.get("trigger_webhook")!;

  it("posts the payload to the workflow's webhook url", async () => {
    (fetch as any).mockResolvedValueOnce({ ok: true });

    const result = await tool().handler({ webhookUrl: "https://n8n.example.com/webhook/abc", payload: { event: "ping" } });

    const [url, init] = (fetch as any).mock.calls[0];
    expect(url).toBe("https://n8n.example.com/webhook/abc");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ event: "ping" });
    expect(textOf(result)).toContain("Workflow triggered");
  });

  it("surfaces a webhook failure as an error result", async () => {
    (fetch as any).mockResolvedValueOnce({ ok: false, status: 404, text: async () => "not registered" });

    const result = await tool().handler({ webhookUrl: "https://n8n.example.com/webhook/missing", payload: {} });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("HTTP 404");
  });
});
