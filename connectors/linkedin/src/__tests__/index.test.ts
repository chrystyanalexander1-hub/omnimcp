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
  process.env.LINKEDIN_ACCESS_TOKEN = "test-token";
  await import("../index.js");
});

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

describe("get_profile", () => {
  const tool = () => tools.get("get_profile")!;

  it("gets the authenticated member's profile", async () => {
    (fetch as any).mockResolvedValueOnce({ ok: true, json: async () => ({ id: "member-1", localizedFirstName: "Ada" }) });

    const result = await tool().handler({});

    const [url, init] = (fetch as any).mock.calls[0];
    expect(String(url)).toContain("/me");
    expect(init.headers.Authorization).toBe("Bearer test-token");
    expect(jsonOf(result)).toEqual({ id: "member-1", localizedFirstName: "Ada" });
  });

  it("surfaces a LinkedIn API error as an error result", async () => {
    (fetch as any).mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({ message: "Invalid access token" }) });

    const result = await tool().handler({});

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("Invalid access token");
  });
});

describe("create_post", () => {
  const tool = () => tools.get("create_post")!;

  it("fetches the profile first, then publishes a post as that member", async () => {
    (fetch as any)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: "member-1" }) })
      .mockResolvedValueOnce({ ok: true, headers: { get: () => "urn:li:share:12345" } });

    const result = await tool().handler({ text: "Hello LinkedIn", visibility: "PUBLIC" });

    expect(fetch).toHaveBeenCalledTimes(2);
    const [, postInit] = (fetch as any).mock.calls[1];
    const body = JSON.parse(postInit.body);
    expect(body.author).toBe("urn:li:person:member-1");
    expect(body.specificContent["com.linkedin.ugc.ShareContent"].shareCommentary.text).toBe("Hello LinkedIn");
    expect(jsonOf(result)).toEqual({ postId: "urn:li:share:12345" });
  });

  it("surfaces a LinkedIn API error as an error result when publishing fails", async () => {
    (fetch as any)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: "member-1" }) })
      .mockResolvedValueOnce({ ok: false, status: 422, json: async () => ({ message: "Duplicate post" }) });

    const result = await tool().handler({ text: "Hello LinkedIn", visibility: "PUBLIC" });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("Duplicate post");
  });
});
