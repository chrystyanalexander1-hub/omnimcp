import { errorResult, jsonResult, startConnector } from "@omnimcp/connector-sdk-ts";
import { z } from "zod";
import { StripeApiError, stripeRequest } from "./stripe-client.js";

const listCustomersSchema = z.object({ limit: z.number().default(10) });
const createCustomerSchema = z.object({ email: z.string(), name: z.string().optional() });
const listChargesSchema = z.object({ limit: z.number().default(10) });
const createRefundSchema = z.object({ chargeId: z.string(), amount: z.number().optional() });

async function safe<T>(fn: () => Promise<T>) {
  try {
    return { ok: true as const, value: await fn() };
  } catch (err) {
    const message = err instanceof StripeApiError || err instanceof Error ? err.message : String(err);
    return { ok: false as const, message };
  }
}

await startConnector({
  name: "stripe",
  version: "0.1.0",
  tools: [
    {
      name: "list_customers",
      description: "List customers.",
      inputSchema: listCustomersSchema,
      async handler({ limit }) {
        const result = await safe(() => stripeRequest<{ data: unknown[] }>("/customers", { limit }));
        return result.ok ? jsonResult(result.value.data) : errorResult(result.message);
      },
    },
    {
      name: "create_customer",
      description: "Create a new customer.",
      inputSchema: createCustomerSchema,
      async handler({ email, name }) {
        const result = await safe(() =>
          stripeRequest<{ id: string }>("/customers", { email, ...(name ? { name } : {}) }, "POST"),
        );
        return result.ok ? jsonResult({ customerId: result.value.id }) : errorResult(result.message);
      },
    },
    {
      name: "list_charges",
      description: "List recent charges.",
      inputSchema: listChargesSchema,
      async handler({ limit }) {
        const result = await safe(() => stripeRequest<{ data: unknown[] }>("/charges", { limit }));
        return result.ok ? jsonResult(result.value.data) : errorResult(result.message);
      },
    },
    {
      name: "create_refund",
      description: "Refund a charge, in full or in part.",
      inputSchema: createRefundSchema,
      async handler({ chargeId, amount }) {
        const result = await safe(() =>
          stripeRequest<{ id: string; status: string }>(
            "/refunds",
            { charge: chargeId, ...(amount !== undefined ? { amount } : {}) },
            "POST",
          ),
        );
        return result.ok ? jsonResult({ refundId: result.value.id, status: result.value.status }) : errorResult(result.message);
      },
    },
  ],
});
