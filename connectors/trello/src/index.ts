import { errorResult, jsonResult, startConnector } from "@omnimcp/connector-sdk-ts";
import { z } from "zod";
import { TrelloApiError, trelloRequest } from "./trello-client.js";

const listBoardsSchema = z.object({});
const listCardsSchema = z.object({ boardId: z.string() });
const createCardSchema = z.object({ listId: z.string(), name: z.string(), desc: z.string().optional() });

async function safe<T>(fn: () => Promise<T>) {
  try {
    return { ok: true as const, value: await fn() };
  } catch (err) {
    const message = err instanceof TrelloApiError || err instanceof Error ? err.message : String(err);
    return { ok: false as const, message };
  }
}

await startConnector({
  name: "trello",
  version: "0.1.0",
  tools: [
    {
      name: "list_boards",
      description: "List boards the authenticated member belongs to.",
      inputSchema: listBoardsSchema,
      async handler() {
        const result = await safe(() => trelloRequest("/members/me/boards"));
        return result.ok ? jsonResult(result.value) : errorResult(result.message);
      },
    },
    {
      name: "list_cards",
      description: "List cards on a board.",
      inputSchema: listCardsSchema,
      async handler({ boardId }) {
        const result = await safe(() => trelloRequest(`/boards/${boardId}/cards`));
        return result.ok ? jsonResult(result.value) : errorResult(result.message);
      },
    },
    {
      name: "create_card",
      description: "Create a new card in a list.",
      inputSchema: createCardSchema,
      async handler({ listId, name, desc }) {
        const result = await safe(() =>
          trelloRequest<{ id: string; url: string }>(
            "/cards",
            { idList: listId, name, ...(desc ? { desc } : {}) },
            "POST",
          ),
        );
        return result.ok ? jsonResult({ cardId: result.value.id, url: result.value.url }) : errorResult(result.message);
      },
    },
  ],
});
