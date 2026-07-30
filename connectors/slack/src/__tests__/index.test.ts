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
  process.env.SLACK_BOT_TOKEN = "xoxb-test-token";
  await import("../index.js");
});

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

describe("list_channels", () => {
  const tool = () => tools.get("list_channels")!;

  it("lists channels the bot can see", async () => {
    mockFetchResponses({ body: { ok: true, channels: [{ id: "C1", name: "general" }] } });

    const result = await tool().handler({});

    const [url, init] = (fetch as any).mock.calls[0];
    expect(String(url)).toContain("/conversations.list");
    expect(init.headers.Authorization).toBe("Bearer xoxb-test-token");
    expect(jsonOf(result)).toEqual([{ id: "C1", name: "general" }]);
  });

  it("surfaces a Slack API error as an error result", async () => {
    mockFetchResponses({ body: { ok: false, error: "invalid_auth" } });

    const result = await tool().handler({});

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("invalid_auth");
  });
});

describe("send_message", () => {
  const tool = () => tools.get("send_message")!;

  it("sends a text message to a channel", async () => {
    mockFetchResponses({ body: { ok: true, ts: "1234.5678", channel: "C1" } });

    const result = await tool().handler({ channel: "C1", text: "Hello" });

    const [url, init] = (fetch as any).mock.calls[0];
    expect(String(url)).toContain("/chat.postMessage");
    expect(JSON.parse(init.body)).toEqual({ channel: "C1", text: "Hello" });
    expect(jsonOf(result)).toEqual({ ok: true, ts: "1234.5678", channel: "C1" });
  });
});

describe("upload_file", () => {
  const tool = () => tools.get("upload_file")!;

  it("reserves an upload URL, PUTs the bytes, then completes the upload", async () => {
    (fetch as any)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, upload_url: "https://files.slack.com/upload/v1/abc", file_id: "F1" }),
      })
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, files: [{ id: "F1", title: "report" }] }) });

    const result = await tool().handler({
      channel: "C1",
      filename: "report.txt",
      contentBase64: Buffer.from("hello").toString("base64"),
      title: "report",
    });

    expect(fetch).toHaveBeenCalledTimes(3);

    const [reserveUrl, reserveInit] = (fetch as any).mock.calls[0];
    expect(String(reserveUrl)).toContain("/files.getUploadURLExternal");
    expect((reserveInit.body as URLSearchParams).get("filename")).toBe("report.txt");

    const [uploadUrl, uploadInit] = (fetch as any).mock.calls[1];
    expect(uploadUrl).toBe("https://files.slack.com/upload/v1/abc");
    expect(uploadInit.body).toBeInstanceOf(FormData);

    const [completeUrl, completeInit] = (fetch as any).mock.calls[2];
    expect(String(completeUrl)).toContain("/files.completeUploadExternal");
    const completeBody = JSON.parse(completeInit.body);
    expect(completeBody.channel_id).toBe("C1");
    expect(completeBody.files).toEqual([{ id: "F1", title: "report" }]);

    expect(jsonOf(result)).toEqual([{ id: "F1", title: "report" }]);
  });

  it("surfaces a Slack API error when reserving the upload URL fails", async () => {
    (fetch as any).mockResolvedValueOnce({ ok: true, json: async () => ({ ok: false, error: "invalid_auth" }) });

    const result = await tool().handler({ channel: "C1", filename: "report.txt", contentBase64: "aGVsbG8=" });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("invalid_auth");
  });
});
