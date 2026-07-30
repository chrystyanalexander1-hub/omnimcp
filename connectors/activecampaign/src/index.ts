import { jsonResult, startConnector } from "@omnimcp/connector-sdk-ts";
import { z } from "zod";
import { acRequest } from "./activecampaign-client.js";

const listContactsSchema = z.object({ search: z.string().optional() });
const createContactSchema = z.object({ email: z.string(), firstName: z.string().optional(), lastName: z.string().optional() });
const listAutomationsSchema = z.object({});
const addContactToAutomationSchema = z.object({ contactId: z.string(), automationId: z.string() });

await startConnector({
  name: "activecampaign",
  version: "0.1.0",
  tools: [
    {
      name: "list_contacts",
      description: "List contacts in the account.",
      inputSchema: listContactsSchema,
      async handler({ search }) {
        const { contacts } = await acRequest<{ contacts: unknown[] }>("/contacts", search ? { search } : {});
        return jsonResult(contacts);
      },
    },
    {
      name: "create_contact",
      description: "Create a new contact record.",
      inputSchema: createContactSchema,
      async handler({ email, firstName, lastName }) {
        const { contact } = await acRequest<{ contact: { id: string } }>(
          "/contacts",
          { contact: { email, ...(firstName ? { firstName } : {}), ...(lastName ? { lastName } : {}) } },
          "POST",
        );
        return jsonResult({ contactId: contact.id });
      },
    },
    {
      name: "list_automations",
      description: "List marketing automations configured in the account.",
      inputSchema: listAutomationsSchema,
      async handler() {
        const { automations } = await acRequest<{ automations: unknown[] }>("/automations");
        return jsonResult(automations);
      },
    },
    {
      name: "add_contact_to_automation",
      description: "Enroll a contact into an automation.",
      inputSchema: addContactToAutomationSchema,
      async handler({ contactId, automationId }) {
        const { contactAutomation } = await acRequest<{ contactAutomation: { id: string } }>(
          "/contactAutomations",
          { contactAutomation: { contact: contactId, automation: automationId } },
          "POST",
        );
        return jsonResult({ contactAutomationId: contactAutomation.id });
      },
    },
  ],
});
