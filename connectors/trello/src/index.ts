import { jsonResult, startConnector } from "@omnimcp/connector-sdk-ts";
import { z } from "zod";
import { trelloRequest } from "./trello-client.js";

const listBoardsSchema = z.object({});
const listCardsSchema = z.object({ boardId: z.string() });
const createCardSchema = z.object({ listId: z.string(), name: z.string(), desc: z.string().optional() });

await startConnector({
  name: "trello",
  version: "0.1.0",
  tools: [
    {
      name: "list_boards",
      description: "List boards the authenticated member belongs to.",
      inputSchema: listBoardsSchema,
      async handler() {
        return jsonResult(await trelloRequest("/members/me/boards"));
      },
    },
    {
      name: "list_cards",
      description: "List cards on a board.",
      inputSchema: listCardsSchema,
      async handler({ boardId }) {
        return jsonResult(await trelloRequest(`/boards/${boardId}/cards`));
      },
    },
    {
      name: "create_card",
      description: "Create a new card in a list.",
      inputSchema: createCardSchema,
      async handler({ listId, name, desc }) {
        const { id, url } = await trelloRequest<{ id: string; url: string }>(
          "/cards",
          { idList: listId, name, ...(desc ? { desc } : {}) },
          "POST",
        );
        return jsonResult({ cardId: id, url });
      },
    },
  ],
});
