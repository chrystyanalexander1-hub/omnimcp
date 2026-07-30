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
  process.env.TRELLO_KEY_AND_TOKEN = "test-key:test-token";
  await import("../index.js");
});

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

describe("list_boards", () => {
  const tool = () => tools.get("list_boards")!;

  it("lists boards the authenticated member belongs to", async () => {
    mockFetchResponses({ body: [{ id: "b1", name: "Roadmap" }] });

    const result = await tool().handler({});

    const [url] = (fetch as any).mock.calls[0];
    expect(String(url)).toContain("/members/me/boards");
    expect((url as URL).searchParams.get("key")).toBe("test-key");
    expect((url as URL).searchParams.get("token")).toBe("test-token");
    expect(jsonOf(result)).toEqual([{ id: "b1", name: "Roadmap" }]);
  });

  it("surfaces a Trello API error as an error result", async () => {
    (fetch as any).mockResolvedValueOnce({ ok: false, status: 401, json: async () => "invalid key" });

    const result = await tool().handler({});

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("invalid key");
  });
});

describe("list_cards", () => {
  const tool = () => tools.get("list_cards")!;

  it("lists cards on a board", async () => {
    mockFetchResponses({ body: [{ id: "c1", name: "Fix bug" }] });

    const result = await tool().handler({ boardId: "b1" });

    expect((fetch as any).mock.calls[0][0].toString()).toContain("/boards/b1/cards");
    expect(jsonOf(result)).toEqual([{ id: "c1", name: "Fix bug" }]);
  });
});

describe("create_card", () => {
  const tool = () => tools.get("create_card")!;

  it("creates a new card in a list", async () => {
    mockFetchResponses({ body: { id: "c2", url: "https://trello.com/c/c2" } });

    const result = await tool().handler({ listId: "l1", name: "New task", desc: "Details" });

    const [url, init] = (fetch as any).mock.calls[0];
    expect(String(url)).toContain("/cards");
    expect(init.method).toBe("POST");
    expect((url as URL).searchParams.get("idList")).toBe("l1");
    expect((url as URL).searchParams.get("name")).toBe("New task");
    expect(jsonOf(result)).toEqual({ cardId: "c2", url: "https://trello.com/c/c2" });
  });
});
