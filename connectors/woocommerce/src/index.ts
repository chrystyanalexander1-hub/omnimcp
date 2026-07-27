import { errorResult, jsonResult, startConnector, textResult } from "@omnimcp/connector-sdk-ts";
import { z } from "zod";
import { WooCommerceApiError, wooRequest } from "./woocommerce-client.js";

const listProductsSchema = z.object({ storeUrl: z.string(), search: z.string().optional(), perPage: z.number().default(20) });
const listOrdersSchema = z.object({ storeUrl: z.string(), status: z.string().optional(), perPage: z.number().default(20) });
const updateOrderStatusSchema = z.object({ storeUrl: z.string(), orderId: z.number(), status: z.string() });

async function safe<T>(fn: () => Promise<T>) {
  try {
    return { ok: true as const, value: await fn() };
  } catch (err) {
    const message = err instanceof WooCommerceApiError || err instanceof Error ? err.message : String(err);
    return { ok: false as const, message };
  }
}

await startConnector({
  name: "woocommerce",
  version: "0.1.0",
  tools: [
    {
      name: "list_products",
      description: "List products in a WooCommerce store.",
      inputSchema: listProductsSchema,
      async handler({ storeUrl, search, perPage }) {
        const result = await safe(() =>
          wooRequest<unknown[]>(storeUrl, "products", { per_page: perPage, ...(search ? { search } : {}) }),
        );
        return result.ok ? jsonResult(result.value) : errorResult(result.message);
      },
    },
    {
      name: "list_orders",
      description: "List orders in a WooCommerce store.",
      inputSchema: listOrdersSchema,
      async handler({ storeUrl, status, perPage }) {
        const result = await safe(() =>
          wooRequest<unknown[]>(storeUrl, "orders", { per_page: perPage, ...(status ? { status } : {}) }),
        );
        return result.ok ? jsonResult(result.value) : errorResult(result.message);
      },
    },
    {
      name: "update_order_status",
      description: "Change an order's status.",
      inputSchema: updateOrderStatusSchema,
      async handler({ storeUrl, orderId, status }) {
        const result = await safe(() => wooRequest(storeUrl, `orders/${orderId}`, { status }, "PUT"));
        return result.ok ? textResult(`Order ${orderId} status set to ${status}`) : errorResult(result.message);
      },
    },
  ],
});
