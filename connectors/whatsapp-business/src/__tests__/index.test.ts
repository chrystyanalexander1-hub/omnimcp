import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ToolDefinition } from "@omnimcp/connector-sdk-ts";

const tools = new Map<string, ToolDefinition<any>>();

vi.mock("@omnimcp/connector-sdk-ts", async () => {
  const actual = await vi.importActual<typeof import("@omnimcp/connector-sdk-ts")>("@omnimcp/connector-sdk-ts");
  return {
    ...actual,
    // Captures the tool definitions instead of actually booting an MCP stdio server,
    // so handlers can be invoked directly against a mocked fetch.
    startConnector: vi.fn(async (definition: { tools: ReadonlyArray<ToolDefinition<any>> }) => {
      for (const tool of definition.tools) tools.set(tool.name, tool);
    }),
  };
});

function textOf(result: { content: Array<{ type: "text"; text: string }> }): string {
  return result.content[0]!.text;
}

function jsonOf(result: { content: Array<{ type: "text"; text: string }> }): unknown {
  return JSON.parse(textOf(result));
}

function mockFetchResponses(...responses: Array<{ body: unknown; ok?: boolean }>) {
  const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
  for (const { body, ok = true } of responses) {
    fetchMock.mockResolvedValueOnce({ ok, json: async () => body });
  }
}

beforeAll(async () => {
  process.env.WHATSAPP_ACCESS_TOKEN = "test-token";
  await import("../index.js");
});

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

describe("send_audio_message", () => {
  const tool = () => tools.get("send_audio_message")!;

  it("sends by link without uploading anything", async () => {
    mockFetchResponses({ body: { messages: [{ id: "wamid.audio-link" }] } });

    const result = await tool().handler({
      phoneNumberId: "123",
      to: "5491122334455",
      link: "https://example.com/a.mp3",
    });

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = (fetch as any).mock.calls[0];
    expect(String(url)).toContain("/123/messages");
    expect(JSON.parse(init.body)).toMatchObject({
      type: "audio",
      audio: { link: "https://example.com/a.mp3" },
    });
    expect(jsonOf(result)).toEqual({ messageId: "wamid.audio-link" });
  });

  it("uploads contentBase64 first, then sends using the returned media id", async () => {
    mockFetchResponses({ body: { id: "media-audio-1" } }, { body: { messages: [{ id: "wamid.audio-upload" }] } });

    const result = await tool().handler({
      phoneNumberId: "123",
      to: "5491122334455",
      contentBase64: Buffer.from("fake audio bytes").toString("base64"),
      mimeType: "audio/mpeg",
    });

    expect(fetch).toHaveBeenCalledTimes(2);

    const [uploadUrl, uploadInit] = (fetch as any).mock.calls[0];
    expect(String(uploadUrl)).toContain("/123/media");
    expect(uploadInit.body).toBeInstanceOf(FormData);
    expect((uploadInit.body as FormData).get("type")).toBe("audio/mpeg");

    const [messagesUrl, messagesInit] = (fetch as any).mock.calls[1];
    expect(String(messagesUrl)).toContain("/123/messages");
    expect(JSON.parse(messagesInit.body)).toMatchObject({ type: "audio", audio: { id: "media-audio-1" } });

    expect(jsonOf(result)).toEqual({ messageId: "wamid.audio-upload" });
  });

  it("returns an error result when no media reference is given", async () => {
    const result = await tool().handler({ phoneNumberId: "123", to: "5491122334455" });
    expect(result.isError).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns an error result when contentBase64 is given without mimeType", async () => {
    const result = await tool().handler({ phoneNumberId: "123", to: "5491122334455", contentBase64: "aGVsbG8=" });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("mimeType is required");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("surfaces a WhatsApp API error as an error result", async () => {
    mockFetchResponses({ body: { error: { message: "Invalid parameter" } }, ok: false });

    const result = await tool().handler({ phoneNumberId: "123", to: "5491122334455", link: "https://example.com/a.mp3" });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("Invalid parameter");
  });
});

describe("send_video_message", () => {
  const tool = () => tools.get("send_video_message")!;

  it("sends by link with an optional caption", async () => {
    mockFetchResponses({ body: { messages: [{ id: "wamid.video-link" }] } });

    const result = await tool().handler({
      phoneNumberId: "123",
      to: "5491122334455",
      link: "https://example.com/v.mp4",
      caption: "Check this out",
    });

    const [url, init] = (fetch as any).mock.calls[0];
    expect(String(url)).toContain("/123/messages");
    expect(JSON.parse(init.body)).toMatchObject({
      type: "video",
      video: { link: "https://example.com/v.mp4", caption: "Check this out" },
    });
    expect(jsonOf(result)).toEqual({ messageId: "wamid.video-link" });
  });

  it("uploads contentBase64 first, then sends using the returned media id", async () => {
    mockFetchResponses({ body: { id: "media-video-1" } }, { body: { messages: [{ id: "wamid.video-upload" }] } });

    const result = await tool().handler({
      phoneNumberId: "123",
      to: "5491122334455",
      contentBase64: Buffer.from("fake video bytes").toString("base64"),
      mimeType: "video/mp4",
    });

    expect(fetch).toHaveBeenCalledTimes(2);

    const [uploadUrl, uploadInit] = (fetch as any).mock.calls[0];
    expect(String(uploadUrl)).toContain("/123/media");
    expect((uploadInit.body as FormData).get("type")).toBe("video/mp4");

    const [, messagesInit] = (fetch as any).mock.calls[1];
    expect(JSON.parse(messagesInit.body)).toMatchObject({ type: "video", video: { id: "media-video-1" } });

    expect(jsonOf(result)).toEqual({ messageId: "wamid.video-upload" });
  });

  it("returns an error result when no media reference is given", async () => {
    const result = await tool().handler({ phoneNumberId: "123", to: "5491122334455" });
    expect(result.isError).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns an error result when contentBase64 is given without mimeType", async () => {
    const result = await tool().handler({ phoneNumberId: "123", to: "5491122334455", contentBase64: "aGVsbG8=" });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("mimeType is required");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("surfaces a WhatsApp API error as an error result", async () => {
    mockFetchResponses({ body: { error: { message: "Invalid parameter" } }, ok: false });

    const result = await tool().handler({ phoneNumberId: "123", to: "5491122334455", link: "https://example.com/v.mp4" });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("Invalid parameter");
  });
});
