import { errorResult, jsonResult, startConnector } from "@omnimcp/connector-sdk-ts";
import { z } from "zod";
import { ActiveCampaignApiError, acRequest } from "./activecampaign-client.js";

const listContactsSchema = z.object({ search: z.string().optional() });
const createContactSchema = z.object({ email: z.string(), firstName: z.string().optional(), lastName: z.string().optional() });
const listAutomationsSchema = z.object({});
const addContactToAutomationSchema = z.object({ contactId: z.string(), automationId: z.string() });

async function safe<T>(fn: () => Promise<T>) {
  try {
    return { ok: true as const, value: await fn() };
  } catch (err) {
    const message = err instanceof ActiveCampaignApiError || err instanceof Error ? err.message : String(err);
    return { ok: false as const, message };
  }
}

await startConnector({
  name: "activecampaign",
  version: "0.1.0",
  tools: [
    {
      name: "list_contacts",
      description: "List contacts in the account.",
      inputSchema: listContactsSchema,
      async handler({ search }) {
        const result = await safe(() =>
          acRequest<{ contacts: unknown[] }>("/contacts", search ? { search } : {}),
        );
        return result.ok ? jsonResult(result.value.contacts) : errorResult(result.message);
      },
    },
    {
      name: "create_contact",
      description: "Create a new contact record.",
      inputSchema: createContactSchema,
      async handler({ email, firstName, lastName }) {
        const result = await safe(() =>
          acRequest<{ contact: { id: string } }>(
            "/contacts",
            { contact: { email, ...(firstName ? { firstName } : {}), ...(lastName ? { lastName } : {}) } },
            "POST",
          ),
        );
        return result.ok ? jsonResult({ contactId: result.value.contact.id }) : errorResult(result.message);
      },
    },
    {
      name: "list_automations",
      description: "List marketing automations configured in the account.",
      inputSchema: listAutomationsSchema,
      async handler() {
        const result = await safe(() => acRequest<{ automations: unknown[] }>("/automations"));
        return result.ok ? jsonResult(result.value.automations) : errorResult(result.message);
      },
    },
    {
      name: "add_contact_to_automation",
      description: "Enroll a contact into an automation.",
      inputSchema: addContactToAutomationSchema,
      async handler({ contactId, automationId }) {
        const result = await safe(() =>
          acRequest<{ contactAutomation: { id: string } }>(
            "/contactAutomations",
            { contactAutomation: { contact: contactId, automation: automationId } },
            "POST",
          ),
        );
        return result.ok
          ? jsonResult({ contactAutomationId: result.value.contactAutomation.id })
          : errorResult(result.message);
      },
    },
  ],
});
