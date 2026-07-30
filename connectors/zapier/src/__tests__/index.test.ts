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

beforeAll(async () => {
  process.env.ZAPIER_WEBHOOK_URL = "https://hooks.zapier.com/hooks/catch/123/abc";
  await import("../index.js");
});

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

describe("trigger_zap", () => {
  const tool = () => tools.get("trigger_zap")!;

  it("posts the payload to the configured webhook url", async () => {
    (fetch as any).mockResolvedValueOnce({ ok: true });

    const result = await tool().handler({ payload: { event: "order.created", id: 1 } });

    const [url, init] = (fetch as any).mock.calls[0];
    expect(url).toBe("https://hooks.zapier.com/hooks/catch/123/abc");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ event: "order.created", id: 1 });
    expect(textOf(result)).toContain("Zap triggered");
  });

  it("surfaces a webhook failure as an error result", async () => {
    (fetch as any).mockResolvedValueOnce({ ok: false, status: 500, text: async () => "internal error" });

    const result = await tool().handler({ payload: {} });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("HTTP 500");
  });
});
