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

vi.mock("../reddit-auth.js", () => ({
  getAccessToken: vi.fn().mockResolvedValue("test-access-token"),
  REDDIT_USER_AGENT: "web:omnimcp-ai:v0.1.0 (by /u/omnimcp)",
}));

function textOf(result: { content: Array<{ type: "text"; text: string }> }): string {
  return result.content[0]!.text;
}

function jsonOf(result: { content: Array<{ type: "text"; text: string }> }): unknown {
  return JSON.parse(textOf(result));
}

beforeAll(async () => {
  await import("../index.js");
});

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

describe("list_subreddit_posts", () => {
  const tool = () => tools.get("list_subreddit_posts")!;

  it("lists posts from a subreddit", async () => {
    (fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { children: [{ data: { id: "p1", title: "Hello" } }] } }),
    });

    const result = await tool().handler({ subreddit: "typescript", sort: "hot", limit: 10 });

    const [url, init] = (fetch as any).mock.calls[0];
    expect(String(url)).toContain("/r/typescript/hot");
    expect(init.headers.Authorization).toBe("Bearer test-access-token");
    expect(init.headers["User-Agent"]).toContain("omnimcp");
    expect(jsonOf(result)).toEqual([{ id: "p1", title: "Hello" }]);
  });

  it("surfaces a Reddit API error as an error result", async () => {
    (fetch as any).mockResolvedValueOnce({ ok: false, status: 403, text: async () => "Forbidden" });

    const result = await tool().handler({ subreddit: "private", sort: "hot", limit: 10 });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("HTTP 403");
  });
});

describe("submit_post", () => {
  const tool = () => tools.get("submit_post")!;

  it("submits a self post when text is given", async () => {
    (fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ json: { errors: [], data: { id: "t3_abc", name: "t3_abc" } } }),
    });

    const result = await tool().handler({ subreddit: "typescript", title: "My post", text: "Body text" });

    const [, init] = (fetch as any).mock.calls[0];
    const body = init.body as URLSearchParams;
    expect(body.get("kind")).toBe("self");
    expect(body.get("text")).toBe("Body text");
    expect(jsonOf(result)).toEqual({ id: "t3_abc", name: "t3_abc" });
  });

  it("submits a link post when url is given", async () => {
    (fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ json: { errors: [], data: { id: "t3_def" } } }),
    });

    await tool().handler({ subreddit: "typescript", title: "My link", url: "https://example.com" });

    const [, init] = (fetch as any).mock.calls[0];
    expect((init.body as URLSearchParams).get("kind")).toBe("link");
  });

  it("surfaces Reddit-reported errors as an error result", async () => {
    (fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ json: { errors: [["RATELIMIT", "you are doing that too much"]], data: {} } }),
    });

    const result = await tool().handler({ subreddit: "typescript", title: "Spam" });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("you are doing that too much");
  });
});

describe("submit_comment", () => {
  const tool = () => tools.get("submit_comment")!;

  it("replies to a post or comment", async () => {
    (fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ json: { errors: [], data: { things: [{ data: { id: "c1" } }] } } }),
    });

    const result = await tool().handler({ parentFullname: "t3_abc", text: "Nice post!" });

    const [, init] = (fetch as any).mock.calls[0];
    expect((init.body as URLSearchParams).get("thing_id")).toBe("t3_abc");
    expect(jsonOf(result)).toEqual({ things: [{ data: { id: "c1" } }] });
  });
});
