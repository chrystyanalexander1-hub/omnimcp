import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ToolDefinition } from "@omnimcp/connector-sdk-ts";

const tools = new Map<string, ToolDefinition<any>>();

vi.mock("@omnimcp/connector-sdk-ts", async () => {
  const actual = await vi.importActual<typeof import("@omnimcp/connector-sdk-ts")>("@omnimcp/connector-sdk-ts");
  return {
    ...actual,
    // Captures the tool definitions instead of actually booting an MCP stdio server,
    // wrapping each handler the same way the real startConnector does so a thrown
    // error surfaces as an errorResult here too instead of failing the test.
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

describe("send_image_message", () => {
  const tool = () => tools.get("send_image_message")!;

  it("sends by link with an optional caption", async () => {
    mockFetchResponses({ body: { messages: [{ id: "wamid.image-link" }] } });

    const result = await tool().handler({
      phoneNumberId: "123",
      to: "5491122334455",
      link: "https://example.com/i.jpg",
      caption: "Look at this",
    });

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = (fetch as any).mock.calls[0];
    expect(String(url)).toContain("/123/messages");
    expect(JSON.parse(init.body)).toMatchObject({
      type: "image",
      image: { link: "https://example.com/i.jpg", caption: "Look at this" },
    });
    expect(jsonOf(result)).toEqual({ messageId: "wamid.image-link" });
  });

  it("sends by an already-uploaded mediaId without uploading anything", async () => {
    mockFetchResponses({ body: { messages: [{ id: "wamid.image-media-id" }] } });

    const result = await tool().handler({ phoneNumberId: "123", to: "5491122334455", mediaId: "media-existing" });

    expect(fetch).toHaveBeenCalledTimes(1);
    const [, init] = (fetch as any).mock.calls[0];
    expect(JSON.parse(init.body)).toMatchObject({ type: "image", image: { id: "media-existing" } });
    expect(jsonOf(result)).toEqual({ messageId: "wamid.image-media-id" });
  });

  it("uploads contentBase64 first, then sends using the returned media id", async () => {
    mockFetchResponses({ body: { id: "media-image-1" } }, { body: { messages: [{ id: "wamid.image-upload" }] } });

    const result = await tool().handler({
      phoneNumberId: "123",
      to: "5491122334455",
      contentBase64: Buffer.from("fake image bytes").toString("base64"),
      mimeType: "image/jpeg",
    });

    expect(fetch).toHaveBeenCalledTimes(2);

    const [uploadUrl, uploadInit] = (fetch as any).mock.calls[0];
    expect(String(uploadUrl)).toContain("/123/media");
    expect((uploadInit.body as FormData).get("type")).toBe("image/jpeg");

    const [, messagesInit] = (fetch as any).mock.calls[1];
    expect(JSON.parse(messagesInit.body)).toMatchObject({ type: "image", image: { id: "media-image-1" } });

    expect(jsonOf(result)).toEqual({ messageId: "wamid.image-upload" });
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

    const result = await tool().handler({ phoneNumberId: "123", to: "5491122334455", link: "https://example.com/i.jpg" });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("Invalid parameter");
  });
});

describe("upload_media", () => {
  const tool = () => tools.get("upload_media")!;

  it("uploads bytes and returns the resulting media id", async () => {
    mockFetchResponses({ body: { id: "media-upload-1" } });

    const result = await tool().handler({
      phoneNumberId: "123",
      contentBase64: Buffer.from("fake bytes").toString("base64"),
      mimeType: "image/png",
      filename: "logo.png",
    });

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = (fetch as any).mock.calls[0];
    expect(String(url)).toContain("/123/media");

    const form = init.body as FormData;
    expect(form.get("messaging_product")).toBe("whatsapp");
    expect(form.get("type")).toBe("image/png");
    const file = form.get("file") as File;
    expect(file.name).toBe("logo.png");
    expect(file.type).toBe("image/png");

    expect(jsonOf(result)).toEqual({ mediaId: "media-upload-1" });
  });

  it('defaults the filename to "file" when none is given', async () => {
    mockFetchResponses({ body: { id: "media-upload-2" } });

    await tool().handler({
      phoneNumberId: "123",
      contentBase64: Buffer.from("fake bytes").toString("base64"),
      mimeType: "audio/mpeg",
    });

    const [, init] = (fetch as any).mock.calls[0];
    const file = (init.body as FormData).get("file") as File;
    expect(file.name).toBe("file");
  });

  it("surfaces a WhatsApp API error as an error result", async () => {
    mockFetchResponses({ body: { error: { message: "Invalid parameter" } }, ok: false });

    const result = await tool().handler({ phoneNumberId: "123", contentBase64: "aGVsbG8=", mimeType: "image/png" });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("Invalid parameter");
  });

  it("returns an error result when the API responds ok but without a media id", async () => {
    mockFetchResponses({ body: {} });

    const result = await tool().handler({ phoneNumberId: "123", contentBase64: "aGVsbG8=", mimeType: "image/png" });

    expect(result.isError).toBe(true);
  });
});

describe("get_business_profile", () => {
  const tool = () => tools.get("get_business_profile")!;

  it("fetches the profile fields for a phone number", async () => {
    mockFetchResponses({ body: { about: "We sell shoes", email: "hello@example.com" } });

    const result = await tool().handler({ phoneNumberId: "123" });

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = (fetch as any).mock.calls[0];
    expect((url as URL).pathname).toContain("/123/whatsapp_business_profile");
    expect((url as URL).searchParams.get("fields")).toBe(
      "about,address,description,email,profile_picture_url,websites,vertical",
    );
    expect(init.method).toBe("GET");

    expect(jsonOf(result)).toEqual({ about: "We sell shoes", email: "hello@example.com" });
  });

  it("surfaces a WhatsApp API error as an error result", async () => {
    mockFetchResponses({ body: { error: { message: "Unsupported get request" } }, ok: false });

    const result = await tool().handler({ phoneNumberId: "123" });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("Unsupported get request");
  });
});

describe("list_message_templates", () => {
  const tool = () => tools.get("list_message_templates")!;

  it("lists the account's approved templates", async () => {
    mockFetchResponses({ body: { data: [{ name: "order_confirmation" }, { name: "shipping_update" }] } });

    const result = await tool().handler({ wabaId: "waba-1" });

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url] = (fetch as any).mock.calls[0];
    expect((url as URL).pathname).toContain("/waba-1/message_templates");

    expect(jsonOf(result)).toEqual([{ name: "order_confirmation" }, { name: "shipping_update" }]);
  });

  it("surfaces a WhatsApp API error as an error result", async () => {
    mockFetchResponses({ body: { error: { message: "Invalid OAuth access token" } }, ok: false });

    const result = await tool().handler({ wabaId: "waba-1" });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("Invalid OAuth access token");
  });
});

describe("send_text_message", () => {
  const tool = () => tools.get("send_text_message")!;

  it("sends a text message", async () => {
    mockFetchResponses({ body: { messages: [{ id: "wamid.text-1" }] } });

    const result = await tool().handler({ phoneNumberId: "123", to: "5491122334455", body: "Hello there" });

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = (fetch as any).mock.calls[0];
    expect(String(url)).toContain("/123/messages");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toMatchObject({
      messaging_product: "whatsapp",
      to: "5491122334455",
      type: "text",
      text: { body: "Hello there" },
    });

    expect(jsonOf(result)).toEqual({ messageId: "wamid.text-1" });
  });

  it("surfaces a WhatsApp API error as an error result", async () => {
    mockFetchResponses({ body: { error: { message: "Recipient phone number not in allowed list" } }, ok: false });

    const result = await tool().handler({ phoneNumberId: "123", to: "5491122334455", body: "Hello there" });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("Recipient phone number not in allowed list");
  });
});

describe("send_template_message", () => {
  const tool = () => tools.get("send_template_message")!;

  it("sends a template message without body parameters", async () => {
    mockFetchResponses({ body: { messages: [{ id: "wamid.template-1" }] } });

    const result = await tool().handler({
      phoneNumberId: "123",
      to: "5491122334455",
      templateName: "order_confirmation",
      languageCode: "en_US",
      bodyParameters: [],
    });

    const [, init] = (fetch as any).mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({
      type: "template",
      template: { name: "order_confirmation", language: { code: "en_US" } },
    });
    expect(body.template.components).toBeUndefined();

    expect(jsonOf(result)).toEqual({ messageId: "wamid.template-1" });
  });

  it("includes body parameters as template components when given", async () => {
    mockFetchResponses({ body: { messages: [{ id: "wamid.template-2" }] } });

    const result = await tool().handler({
      phoneNumberId: "123",
      to: "5491122334455",
      templateName: "order_confirmation",
      languageCode: "en_US",
      bodyParameters: ["Alice", "#1234"],
    });

    const [, init] = (fetch as any).mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body.template.components).toEqual([
      {
        type: "body",
        parameters: [
          { type: "text", text: "Alice" },
          { type: "text", text: "#1234" },
        ],
      },
    ]);

    expect(jsonOf(result)).toEqual({ messageId: "wamid.template-2" });
  });

  it("surfaces a WhatsApp API error as an error result", async () => {
    mockFetchResponses({ body: { error: { message: "Template name does not exist" } }, ok: false });

    const result = await tool().handler({
      phoneNumberId: "123",
      to: "5491122334455",
      templateName: "does_not_exist",
      languageCode: "en_US",
      bodyParameters: [],
    });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("Template name does not exist");
  });
});
