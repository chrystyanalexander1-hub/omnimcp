import { errorResult, jsonResult, startConnector, textResult } from "@omnimcp/connector-sdk-ts";
import { z } from "zod";
import { documentToPlainObject, toFirestoreValue } from "./firestore-values.js";
import { getAccessToken } from "./google-auth.js";

const FIRESTORE_API = "https://firestore.googleapis.com/v1";

export class FirestoreApiError extends Error {}

const listDocumentsSchema = z.object({ projectId: z.string(), collectionPath: z.string() });
const getDocumentSchema = z.object({ projectId: z.string(), documentPath: z.string() });
const createDocumentSchema = z.object({
  projectId: z.string(),
  collectionPath: z.string(),
  fields: z.record(z.unknown()),
});
const deleteDocumentSchema = z.object({ projectId: z.string(), documentPath: z.string() });

async function safe<T>(fn: () => Promise<T>) {
  try {
    return { ok: true as const, value: await fn() };
  } catch (err) {
    const message = err instanceof FirestoreApiError || err instanceof Error ? err.message : String(err);
    return { ok: false as const, message };
  }
}

async function handle<T>(res: Response): Promise<T> {
  const json = (await res.json()) as { error?: { message?: string } } & T;
  if (!res.ok) {
    throw new FirestoreApiError(json.error?.message ?? `Firestore API error: HTTP ${res.status}`);
  }
  return json;
}

function documentsUrl(projectId: string, path: string): string {
  return `${FIRESTORE_API}/projects/${projectId}/databases/(default)/documents/${path}`;
}

await startConnector({
  name: "firebase-firestore",
  version: "0.1.0",
  tools: [
    {
      name: "list_documents",
      description: "List documents in a Firestore collection.",
      inputSchema: listDocumentsSchema,
      async handler({ projectId, collectionPath }) {
        const result = await safe(async () => {
          const token = await getAccessToken();
          const res = await fetch(documentsUrl(projectId, collectionPath), {
            headers: { Authorization: `Bearer ${token}` },
          });
          return handle<{ documents?: Array<{ name?: string; fields?: Record<string, Record<string, unknown>> }> }>(res);
        });
        return result.ok
          ? jsonResult((result.value.documents ?? []).map(documentToPlainObject))
          : errorResult(result.message);
      },
    },
    {
      name: "get_document",
      description: "Get a single document by its full path.",
      inputSchema: getDocumentSchema,
      async handler({ projectId, documentPath }) {
        const result = await safe(async () => {
          const token = await getAccessToken();
          const res = await fetch(documentsUrl(projectId, documentPath), {
            headers: { Authorization: `Bearer ${token}` },
          });
          return handle<{ name?: string; fields?: Record<string, Record<string, unknown>> }>(res);
        });
        return result.ok ? jsonResult(documentToPlainObject(result.value)) : errorResult(result.message);
      },
    },
    {
      name: "create_document",
      description: "Create a new document in a collection.",
      inputSchema: createDocumentSchema,
      async handler({ projectId, collectionPath, fields }) {
        const result = await safe(async () => {
          const token = await getAccessToken();
          const firestoreFields = Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, toFirestoreValue(v)]));
          const res = await fetch(documentsUrl(projectId, collectionPath), {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ fields: firestoreFields }),
          });
          return handle<{ name?: string; fields?: Record<string, Record<string, unknown>> }>(res);
        });
        return result.ok ? jsonResult(documentToPlainObject(result.value)) : errorResult(result.message);
      },
    },
    {
      name: "delete_document",
      description: "Permanently delete a document.",
      inputSchema: deleteDocumentSchema,
      async handler({ projectId, documentPath }) {
        const result = await safe(async () => {
          const token = await getAccessToken();
          const res = await fetch(documentsUrl(projectId, documentPath), {
            method: "DELETE",
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!res.ok) throw new FirestoreApiError(`Firestore API error: HTTP ${res.status}`);
        });
        return result.ok ? textResult(`Deleted ${documentPath}`) : errorResult(result.message);
      },
    },
  ],
});
