import { errorResult, jsonResult, startConnector } from "@omnimcp/connector-sdk-ts";
import { z } from "zod";
import { getAccessToken } from "./pinterest-auth.js";

const PINTEREST_API = "https://api.pinterest.com/v5";

export class PinterestApiError extends Error {}

const listBoardsSchema = z.object({});
const listPinsSchema = z.object({ boardId: z.string() });
const createPinSchema = z.object({
  boardId: z.string(),
  imageUrl: z.string(),
  title: z.string().optional(),
  description: z.string().optional(),
  link: z.string().optional(),
});

async function safe<T>(fn: () => Promise<T>) {
  try {
    return { ok: true as const, value: await fn() };
  } catch (err) {
    const message = err instanceof PinterestApiError || err instanceof Error ? err.message : String(err);
    return { ok: false as const, message };
  }
}

async function handle<T>(res: Response): Promise<T> {
  const json = (await res.json()) as { message?: string } & T;
  if (!res.ok) {
    throw new PinterestApiError(json.message ?? `Pinterest API error: HTTP ${res.status}`);
  }
  return json;
}

await startConnector({
  name: "pinterest",
  version: "0.1.0",
  tools: [
    {
      name: "list_boards",
      description: "List boards owned by the authenticated account.",
      inputSchema: listBoardsSchema,
      async handler() {
        const result = await safe(async () => {
          const token = await getAccessToken();
          const res = await fetch(`${PINTEREST_API}/boards`, { headers: { Authorization: `Bearer ${token}` } });
          return handle<{ items?: unknown[] }>(res);
        });
        return result.ok ? jsonResult(result.value.items ?? []) : errorResult(result.message);
      },
    },
    {
      name: "list_pins",
      description: "List pins on a board.",
      inputSchema: listPinsSchema,
      async handler({ boardId }) {
        const result = await safe(async () => {
          const token = await getAccessToken();
          const res = await fetch(`${PINTEREST_API}/boards/${boardId}/pins`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          return handle<{ items?: unknown[] }>(res);
        });
        return result.ok ? jsonResult(result.value.items ?? []) : errorResult(result.message);
      },
    },
    {
      name: "create_pin",
      description: "Create a new pin from an image URL and publish it to a board.",
      inputSchema: createPinSchema,
      async handler({ boardId, imageUrl, title, description, link }) {
        const result = await safe(async () => {
          const token = await getAccessToken();
          const res = await fetch(`${PINTEREST_API}/pins`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              board_id: boardId,
              media_source: { source_type: "image_url", url: imageUrl },
              ...(title ? { title } : {}),
              ...(description ? { description } : {}),
              ...(link ? { link } : {}),
            }),
          });
          return handle<{ id: string }>(res);
        });
        return result.ok ? jsonResult({ pinId: result.value.id }) : errorResult(result.message);
      },
    },
  ],
});
