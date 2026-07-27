import { errorResult, jsonResult, startConnector, textResult } from "@omnimcp/connector-sdk-ts";
import { z } from "zod";
import { ShopifyApiError, shopifyRequest } from "./shopify-client.js";

const listProductsSchema = z.object({ shopDomain: z.string(), limit: z.number().default(20) });
const getOrderSchema = z.object({ shopDomain: z.string(), orderId: z.string() });
const createProductSchema = z.object({
  shopDomain: z.string(),
  title: z.string(),
  bodyHtml: z.string().optional(),
  price: z.string().optional(),
  status: z.enum(["active", "draft"]).default("draft"),
});
const fulfillOrderSchema = z.object({
  shopDomain: z.string(),
  orderId: z.string(),
  trackingNumber: z.string().optional(),
  notifyCustomer: z.boolean().default(true),
});

async function safe<T>(fn: () => Promise<T>) {
  try {
    return { ok: true as const, value: await fn() };
  } catch (err) {
    const message = err instanceof ShopifyApiError || err instanceof Error ? err.message : String(err);
    return { ok: false as const, message };
  }
}

await startConnector({
  name: "shopify",
  version: "0.1.0",
  tools: [
    {
      name: "list_products",
      description: "List products in a Shopify store.",
      inputSchema: listProductsSchema,
      async handler({ shopDomain, limit }) {
        const result = await safe(() =>
          shopifyRequest<{ products: unknown[] }>(shopDomain, `/products.json?limit=${limit}`),
        );
        return result.ok ? jsonResult(result.value.products) : errorResult(result.message);
      },
    },
    {
      name: "get_order",
      description: "Get details of a specific order.",
      inputSchema: getOrderSchema,
      async handler({ shopDomain, orderId }) {
        const result = await safe(() => shopifyRequest<{ order: unknown }>(shopDomain, `/orders/${orderId}.json`));
        return result.ok ? jsonResult(result.value.order) : errorResult(result.message);
      },
    },
    {
      name: "create_product",
      description: "Create a new product.",
      inputSchema: createProductSchema,
      async handler({ shopDomain, title, bodyHtml, price, status }) {
        const result = await safe(() =>
          shopifyRequest<{ product: { id: number } }>(
            shopDomain,
            "/products.json",
            {
              product: {
                title,
                status,
                ...(bodyHtml ? { body_html: bodyHtml } : {}),
                ...(price ? { variants: [{ price }] } : {}),
              },
            },
            "POST",
          ),
        );
        return result.ok ? jsonResult({ productId: result.value.product.id }) : errorResult(result.message);
      },
    },
    {
      name: "fulfill_order",
      description: "Mark an order as fulfilled/shipped.",
      inputSchema: fulfillOrderSchema,
      async handler({ shopDomain, orderId, trackingNumber, notifyCustomer }) {
        const result = await safe(() =>
          shopifyRequest(
            shopDomain,
            `/orders/${orderId}/fulfillments.json`,
            {
              fulfillment: {
                notify_customer: notifyCustomer,
                ...(trackingNumber ? { tracking_number: trackingNumber } : {}),
              },
            },
            "POST",
          ),
        );
        return result.ok ? textResult(`Order ${orderId} fulfilled`) : errorResult(result.message);
      },
    },
  ],
});
