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

describe("list_my_videos", () => {
  const tool = () => tools.get("list_my_videos")!;

  it("lists videos uploaded by the authenticated channel", async () => {
    mockFetchResponses({ body: { items: [{ id: { videoId: "v1" } }] } });

    const result = await tool().handler({ maxResults: 25 });

    const [url, init] = (fetch as any).mock.calls[0];
    expect(String(url)).toContain("/search?part=id,snippet&forMine=true");
    expect(init.headers.Authorization).toBe("Bearer test-access-token");
    expect(jsonOf(result)).toEqual([{ id: { videoId: "v1" } }]);
  });

  it("surfaces a YouTube API error as an error result", async () => {
    mockFetchResponses({ body: { error: { message: "The request is missing a valid API key" } }, ok: false });

    const result = await tool().handler({ maxResults: 25 });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("valid API key");
  });
});

describe("get_video_stats", () => {
  const tool = () => tools.get("get_video_stats")!;

  it("gets stats and snippet metadata for a video", async () => {
    mockFetchResponses({ body: { items: [{ id: "v1", statistics: { viewCount: "100" } }] } });

    const result = await tool().handler({ videoId: "v1" });

    expect((fetch as any).mock.calls[0][0].toString()).toContain("/videos?part=statistics,snippet&id=v1");
    expect(jsonOf(result)).toEqual({ id: "v1", statistics: { viewCount: "100" } });
  });

  it("returns null when the video doesn't exist", async () => {
    mockFetchResponses({ body: { items: [] } });

    const result = await tool().handler({ videoId: "missing" });

    expect(jsonOf(result)).toBeNull();
  });
});

describe("update_video_metadata", () => {
  const tool = () => tools.get("update_video_metadata")!;

  it("fetches the current snippet, then merges in the given title/description", async () => {
    mockFetchResponses(
      { body: { items: [{ snippet: { title: "Old title", categoryId: "22" } }] } },
      { body: { id: "v1", snippet: { title: "New title", categoryId: "22" } } },
    );

    const result = await tool().handler({ videoId: "v1", title: "New title" });

    expect(fetch).toHaveBeenCalledTimes(2);
    const [, updateInit] = (fetch as any).mock.calls[1];
    expect(updateInit.method).toBe("PUT");
    const body = JSON.parse(updateInit.body);
    expect(body.snippet).toMatchObject({ title: "New title", categoryId: "22" });
    expect(jsonOf(result)).toEqual({ id: "v1", snippet: { title: "New title", categoryId: "22" } });
  });

  it("surfaces an error when the video isn't found", async () => {
    mockFetchResponses({ body: { items: [] } });

    const result = await tool().handler({ videoId: "missing", title: "New title" });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("not found");
  });
});

describe("upload_video", () => {
  const tool = () => tools.get("upload_video")!;

  it("uploads a video as a multipart request", async () => {
    mockFetchResponses({ body: { id: "v2" } });

    const result = await tool().handler({
      title: "My video",
      description: "Nice",
      contentBase64: Buffer.from("video-bytes").toString("base64"),
      mimeType: "video/mp4",
      privacyStatus: "private",
    });

    const [url, init] = (fetch as any).mock.calls[0];
    expect(String(url)).toContain("/upload/youtube/v3/videos?uploadType=multipart");
    expect(init.method).toBe("POST");
    expect(init.body).toContain("My video");
    expect(textOf(result)).toContain("Uploaded video v2");
  });
});
