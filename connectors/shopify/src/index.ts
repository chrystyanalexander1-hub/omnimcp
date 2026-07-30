import { jsonResult, startConnector, textResult } from "@omnimcp/connector-sdk-ts";
import { z } from "zod";
import { shopifyRequest } from "./shopify-client.js";

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

await startConnector({
  name: "shopify",
  version: "0.1.0",
  tools: [
    {
      name: "list_products",
      description: "List products in a Shopify store.",
      inputSchema: listProductsSchema,
      async handler({ shopDomain, limit }) {
        const { products } = await shopifyRequest<{ products: unknown[] }>(shopDomain, `/products.json?limit=${limit}`);
        return jsonResult(products);
      },
    },
    {
      name: "get_order",
      description: "Get details of a specific order.",
      inputSchema: getOrderSchema,
      async handler({ shopDomain, orderId }) {
        const { order } = await shopifyRequest<{ order: unknown }>(shopDomain, `/orders/${orderId}.json`);
        return jsonResult(order);
      },
    },
    {
      name: "create_product",
      description: "Create a new product.",
      inputSchema: createProductSchema,
      async handler({ shopDomain, title, bodyHtml, price, status }) {
        const { product } = await shopifyRequest<{ product: { id: number } }>(
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
        );
        return jsonResult({ productId: product.id });
      },
    },
    {
      name: "fulfill_order",
      description: "Mark an order as fulfilled/shipped.",
      inputSchema: fulfillOrderSchema,
      async handler({ shopDomain, orderId, trackingNumber, notifyCustomer }) {
        await shopifyRequest(
          shopDomain,
          `/orders/${orderId}/fulfillments.json`,
          {
            fulfillment: {
              notify_customer: notifyCustomer,
              ...(trackingNumber ? { tracking_number: trackingNumber } : {}),
            },
          },
          "POST",
        );
        return textResult(`Order ${orderId} fulfilled`);
      },
    },
  ],
});
