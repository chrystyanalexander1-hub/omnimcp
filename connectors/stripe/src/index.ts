import { jsonResult, startConnector } from "@omnimcp/connector-sdk-ts";
import { z } from "zod";
import { stripeRequest } from "./stripe-client.js";

const listCustomersSchema = z.object({ limit: z.number().default(10) });
const createCustomerSchema = z.object({ email: z.string(), name: z.string().optional() });
const listChargesSchema = z.object({ limit: z.number().default(10) });
const createRefundSchema = z.object({ chargeId: z.string(), amount: z.number().optional() });

await startConnector({
  name: "stripe",
  version: "0.1.0",
  tools: [
    {
      name: "list_customers",
      description: "List customers.",
      inputSchema: listCustomersSchema,
      async handler({ limit }) {
        const { data } = await stripeRequest<{ data: unknown[] }>("/customers", { limit });
        return jsonResult(data);
      },
    },
    {
      name: "create_customer",
      description: "Create a new customer.",
      inputSchema: createCustomerSchema,
      async handler({ email, name }) {
        const { id } = await stripeRequest<{ id: string }>("/customers", { email, ...(name ? { name } : {}) }, "POST");
        return jsonResult({ customerId: id });
      },
    },
    {
      name: "list_charges",
      description: "List recent charges.",
      inputSchema: listChargesSchema,
      async handler({ limit }) {
        const { data } = await stripeRequest<{ data: unknown[] }>("/charges", { limit });
        return jsonResult(data);
      },
    },
    {
      name: "create_refund",
      description: "Refund a charge, in full or in part.",
      inputSchema: createRefundSchema,
      async handler({ chargeId, amount }) {
        const { id, status } = await stripeRequest<{ id: string; status: string }>(
          "/refunds",
          { charge: chargeId, ...(amount !== undefined ? { amount } : {}) },
          "POST",
        );
        return jsonResult({ refundId: id, status });
      },
    },
  ],
});
