import { errorResult, jsonResult, startConnector } from "@omnimcp/connector-sdk-ts";
import { z } from "zod";
import { getAccessToken } from "./docusign-auth.js";

export class DocuSignApiError extends Error {}

const getUserInfoSchema = z.object({});
const listEnvelopesSchema = z.object({ baseUri: z.string(), accountId: z.string(), fromDate: z.string().optional() });
const getEnvelopeStatusSchema = z.object({ baseUri: z.string(), accountId: z.string(), envelopeId: z.string() });
const sendEnvelopeSchema = z.object({
  baseUri: z.string(),
  accountId: z.string(),
  emailSubject: z.string(),
  documentBase64: z.string(),
  documentName: z.string(),
  fileExtension: z.string().default("pdf"),
  signerEmail: z.string(),
  signerName: z.string(),
});

async function safe<T>(fn: () => Promise<T>) {
  try {
    return { ok: true as const, value: await fn() };
  } catch (err) {
    const message = err instanceof DocuSignApiError || err instanceof Error ? err.message : String(err);
    return { ok: false as const, message };
  }
}

async function handle<T>(res: Response): Promise<T> {
  const json = (await res.json()) as { message?: string } & T;
  if (!res.ok) {
    throw new DocuSignApiError(json.message ?? `DocuSign API error: HTTP ${res.status}`);
  }
  return json;
}

await startConnector({
  name: "docusign",
  version: "0.1.0",
  tools: [
    {
      /** DocuSign's API base URI and account id vary per account (like Mailchimp's
       * datacenter suffix, but resolved via a call instead of parsed from the token) —
       * this is the one call that doesn't need either, since it's how you get them. */
      name: "get_user_info",
      description: "Get the authenticated user's DocuSign accounts, base URIs, and account ids.",
      inputSchema: getUserInfoSchema,
      async handler() {
        const result = await safe(async () => {
          const token = await getAccessToken();
          const res = await fetch("https://account.docusign.com/oauth/userinfo", {
            headers: { Authorization: `Bearer ${token}` },
          });
          return handle<{ accounts: unknown[] }>(res);
        });
        return result.ok ? jsonResult(result.value.accounts) : errorResult(result.message);
      },
    },
    {
      name: "list_envelopes",
      description: "List envelopes created since a date.",
      inputSchema: listEnvelopesSchema,
      async handler({ baseUri, accountId, fromDate }) {
        const result = await safe(async () => {
          const token = await getAccessToken();
          const url = new URL(`${baseUri}/restapi/v2.1/accounts/${accountId}/envelopes`);
          const defaultFrom = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
          url.searchParams.set("from_date", fromDate ?? defaultFrom);
          const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
          return handle<{ envelopes?: unknown[] }>(res);
        });
        return result.ok ? jsonResult(result.value.envelopes ?? []) : errorResult(result.message);
      },
    },
    {
      name: "get_envelope_status",
      description: "Get the current status of an envelope.",
      inputSchema: getEnvelopeStatusSchema,
      async handler({ baseUri, accountId, envelopeId }) {
        const result = await safe(async () => {
          const token = await getAccessToken();
          const res = await fetch(`${baseUri}/restapi/v2.1/accounts/${accountId}/envelopes/${envelopeId}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          return handle<{ status: string }>(res);
        });
        return result.ok ? jsonResult(result.value) : errorResult(result.message);
      },
    },
    {
      /**
       * Places the signature tab at a fixed position (page 1, top-left area) rather
       * than an anchorString search — a generic "send any document" tool has no
       * reliable way to know the document's actual layout ahead of time. Documented
       * simplification: for documents where that spot isn't appropriate, the signer
       * can still drag the tab in DocuSign's own signing UI before completing.
       */
      name: "send_envelope",
      description: "Send a document to a signer for electronic signature.",
      inputSchema: sendEnvelopeSchema,
      async handler({ baseUri, accountId, emailSubject, documentBase64, documentName, fileExtension, signerEmail, signerName }) {
        const result = await safe(async () => {
          const token = await getAccessToken();
          const res = await fetch(`${baseUri}/restapi/v2.1/accounts/${accountId}/envelopes`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              emailSubject,
              status: "sent",
              documents: [{ documentBase64, name: documentName, fileExtension, documentId: "1" }],
              recipients: {
                signers: [
                  {
                    email: signerEmail,
                    name: signerName,
                    recipientId: "1",
                    tabs: {
                      signHereTabs: [{ documentId: "1", pageNumber: "1", xPosition: "100", yPosition: "100" }],
                    },
                  },
                ],
              },
            }),
          });
          return handle<{ envelopeId: string }>(res);
        });
        return result.ok ? jsonResult({ envelopeId: result.value.envelopeId }) : errorResult(result.message);
      },
    },
  ],
});
