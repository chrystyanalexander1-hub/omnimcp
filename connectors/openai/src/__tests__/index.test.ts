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

function mockFetchResponses(...responses: Array<{ body: unknown; ok?: boolean; status?: number }>) {
  const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
  for (const { body, ok = true, status = ok ? 200 : 400 } of responses) {
    fetchMock.mockResolvedValueOnce({ ok, status, json: async () => body });
  }
}

beforeAll(async () => {
  process.env.OPENAI_API_KEY = "test-api-key";
  await import("../index.js");
});

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

describe("chat_completion", () => {
  const tool = () => tools.get("chat_completion")!;

  it("gets a chat completion", async () => {
    mockFetchResponses({ body: { choices: [{ message: { content: "Hi there!" } }] } });

    const result = await tool().handler({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: "Hello" }],
    });

    const [url, init] = (fetch as any).mock.calls[0];
    expect(String(url)).toContain("/chat/completions");
    expect(init.headers.Authorization).toBe("Bearer test-api-key");
    const body = JSON.parse(init.body);
    expect(body.model).toBe("gpt-4o-mini");
    expect(body.messages).toEqual([{ role: "user", content: "Hello" }]);
    expect(jsonOf(result)).toEqual({ content: "Hi there!" });
  });

  it("surfaces an OpenAI API error as an error result", async () => {
    mockFetchResponses({ body: { error: { message: "Incorrect API key provided" } }, ok: false });

    const result = await tool().handler({ model: "gpt-4o-mini", messages: [{ role: "user", content: "Hi" }] });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("Incorrect API key provided");
  });
});

describe("generate_image", () => {
  const tool = () => tools.get("generate_image")!;

  it("generates an image from a prompt", async () => {
    mockFetchResponses({ body: { data: [{ url: "https://example.com/img.png" }] } });

    const result = await tool().handler({ prompt: "a red panda", size: "1024x1024", n: 1 });

    const [url, init] = (fetch as any).mock.calls[0];
    expect(String(url)).toContain("/images/generations");
    const body = JSON.parse(init.body);
    expect(body.prompt).toBe("a red panda");
    expect(body.model).toBe("dall-e-3");
    expect(jsonOf(result)).toEqual(["https://example.com/img.png"]);
  });
});
