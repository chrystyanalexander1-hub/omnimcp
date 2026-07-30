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

vi.mock("../pinterest-auth.js", () => ({
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

describe("list_boards", () => {
  const tool = () => tools.get("list_boards")!;

  it("lists boards owned by the authenticated account", async () => {
    mockFetchResponses({ body: { items: [{ id: "board-1", name: "Recipes" }] } });

    const result = await tool().handler({});

    const [url, init] = (fetch as any).mock.calls[0];
    expect(String(url)).toContain("/boards");
    expect(init.headers.Authorization).toBe("Bearer test-access-token");
    expect(jsonOf(result)).toEqual([{ id: "board-1", name: "Recipes" }]);
  });

  it("surfaces a Pinterest API error as an error result", async () => {
    mockFetchResponses({ body: { message: "Invalid token" }, ok: false });

    const result = await tool().handler({});

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("Invalid token");
  });
});

describe("list_pins", () => {
  const tool = () => tools.get("list_pins")!;

  it("lists pins on a board", async () => {
    mockFetchResponses({ body: { items: [{ id: "pin-1" }] } });

    const result = await tool().handler({ boardId: "board-1" });

    expect((fetch as any).mock.calls[0][0].toString()).toContain("/boards/board-1/pins");
    expect(jsonOf(result)).toEqual([{ id: "pin-1" }]);
  });
});

describe("create_pin", () => {
  const tool = () => tools.get("create_pin")!;

  it("creates a pin from an image url and publishes it to a board", async () => {
    mockFetchResponses({ body: { id: "pin-2" } });

    const result = await tool().handler({
      boardId: "board-1",
      imageUrl: "https://example.com/i.jpg",
      title: "Nice recipe",
      link: "https://example.com/recipe",
    });

    const [url, init] = (fetch as any).mock.calls[0];
    expect(String(url)).toContain("/pins");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body);
    expect(body.board_id).toBe("board-1");
    expect(body.media_source).toEqual({ source_type: "image_url", url: "https://example.com/i.jpg" });
    expect(jsonOf(result)).toEqual({ pinId: "pin-2" });
  });
});
