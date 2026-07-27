import { errorResult, jsonResult, requireEnv, startConnector } from "@omnimcp/connector-sdk-ts";
import { z } from "zod";

const OPENAI_API = "https://api.openai.com/v1";

export class OpenAiApiError extends Error {}

const chatCompletionSchema = z.object({
  model: z.string().default("gpt-4o-mini"),
  messages: z.array(z.object({ role: z.enum(["system", "user", "assistant"]), content: z.string() })),
  maxTokens: z.number().optional(),
});
const generateImageSchema = z.object({
  prompt: z.string(),
  size: z.enum(["1024x1024", "1024x1792", "1792x1024"]).default("1024x1024"),
  n: z.number().default(1),
});

async function safe<T>(fn: () => Promise<T>) {
  try {
    return { ok: true as const, value: await fn() };
  } catch (err) {
    const message = err instanceof OpenAiApiError || err instanceof Error ? err.message : String(err);
    return { ok: false as const, message };
  }
}

async function openaiRequest<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const apiKey = requireEnv("OPENAI_API_KEY");
  const res = await fetch(`${OPENAI_API}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as { error?: { message?: string } };
  if (!res.ok) {
    throw new OpenAiApiError(json.error?.message ?? `OpenAI API error: HTTP ${res.status}`);
  }
  return json as T;
}

await startConnector({
  name: "openai",
  version: "0.1.0",
  tools: [
    {
      name: "chat_completion",
      description: "Get a chat completion from an OpenAI model.",
      inputSchema: chatCompletionSchema,
      async handler({ model, messages, maxTokens }) {
        const result = await safe(() =>
          openaiRequest<{ choices: Array<{ message: { content: string } }> }>("/chat/completions", {
            model,
            messages,
            ...(maxTokens !== undefined ? { max_tokens: maxTokens } : {}),
          }),
        );
        return result.ok ? jsonResult({ content: result.value.choices[0]?.message.content }) : errorResult(result.message);
      },
    },
    {
      name: "generate_image",
      description: "Generate an image from a text prompt.",
      inputSchema: generateImageSchema,
      async handler({ prompt, size, n }) {
        const result = await safe(() =>
          openaiRequest<{ data: Array<{ url?: string }> }>("/images/generations", {
            model: "dall-e-3",
            prompt,
            size,
            n,
          }),
        );
        return result.ok ? jsonResult(result.value.data.map((d) => d.url)) : errorResult(result.message);
      },
    },
  ],
});
