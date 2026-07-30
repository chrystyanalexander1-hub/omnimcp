import { jsonResult, startConnector } from "@omnimcp/connector-sdk-ts";
import { z } from "zod";
import { getAccessToken } from "./mercadolibre-auth.js";

const ML_API = "https://api.mercadolibre.com";

export class MercadoLibreApiError extends Error {}

const getMyUserSchema = z.object({});
const listOrdersSchema = z.object({ sellerId: z.string() });
const updateItemStockSchema = z.object({ itemId: z.string(), quantity: z.number() });

async function handle<T>(res: Response): Promise<T> {
  const json = (await res.json()) as { message?: string } & T;
  if (!res.ok) {
    throw new MercadoLibreApiError(json.message ?? `Mercado Libre API error: HTTP ${res.status}`);
  }
  return json;
}

await startConnector({
  name: "mercado-libre",
  version: "0.1.0",
  tools: [
    {
      name: "get_my_user",
      description: "Get the authenticated seller's own user info.",
      inputSchema: getMyUserSchema,
      async handler() {
        const token = await getAccessToken();
        const res = await fetch(`${ML_API}/users/me`, { headers: { Authorization: `Bearer ${token}` } });
        return jsonResult(await handle<{ id: number; nickname: string; site_id: string }>(res));
      },
    },
    {
      name: "list_orders",
      description: "List orders for a seller.",
      inputSchema: listOrdersSchema,
      async handler({ sellerId }) {
        const token = await getAccessToken();
        const url = new URL(`${ML_API}/orders/search`);
        url.searchParams.set("seller", sellerId);
        const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        const { results } = await handle<{ results: unknown[] }>(res);
        return jsonResult(results);
      },
    },
    {
      name: "update_item_stock",
      description: "Update a listing's available stock quantity.",
      inputSchema: updateItemStockSchema,
      async handler({ itemId, quantity }) {
        const token = await getAccessToken();
        const res = await fetch(`${ML_API}/items/${itemId}`, {
          method: "PUT",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ available_quantity: quantity }),
        });
        const { id, available_quantity } = await handle<{ id: string; available_quantity: number }>(res);
        return jsonResult({ itemId: id, availableQuantity: available_quantity });
      },
    },
  ],
});
