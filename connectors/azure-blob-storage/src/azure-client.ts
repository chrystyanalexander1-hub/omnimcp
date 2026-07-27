import { buildSignedRequest } from "./azure-signer.js";

export class AzureBlobApiError extends Error {}

async function throwIfError(res: Response): Promise<void> {
  if (!res.ok) {
    const body = await res.text();
    throw new AzureBlobApiError(`Azure Blob Storage error: HTTP ${res.status} ${body.slice(0, 500)}`);
  }
}

/** Azure's List Blobs API returns XML, not JSON. Rather than pull in a full XML parser for one field, this pulls blob names out with a targeted regex — good enough for a name listing, not a general XML parser. */
function extractBlobNames(xml: string): string[] {
  const matches = xml.matchAll(/<Blob>[\s\S]*?<Name>(.*?)<\/Name>/g);
  return [...matches].map((m) => m[1]).filter((name): name is string => name !== undefined);
}

export async function listBlobs(container: string, prefix?: string): Promise<string[]> {
  const { url, headers } = buildSignedRequest("GET", container, {
    restype: "container",
    comp: "list",
    ...(prefix ? { prefix } : {}),
  });
  const res = await fetch(url, { headers });
  await throwIfError(res);
  return extractBlobNames(await res.text());
}

export async function uploadBlob(container: string, blobName: string, bytes: Buffer, contentType: string): Promise<void> {
  const { url, headers } = buildSignedRequest(
    "PUT",
    `${container}/${blobName}`,
    {},
    { "x-ms-blob-type": "BlockBlob", "Content-Type": contentType, "Content-Length": String(bytes.length) },
  );
  const res = await fetch(url, { method: "PUT", headers, body: bytes });
  await throwIfError(res);
}

export async function downloadBlob(container: string, blobName: string): Promise<Buffer> {
  const { url, headers } = buildSignedRequest("GET", `${container}/${blobName}`);
  const res = await fetch(url, { headers });
  await throwIfError(res);
  return Buffer.from(await res.arrayBuffer());
}

export async function deleteBlob(container: string, blobName: string): Promise<void> {
  const { url, headers } = buildSignedRequest("DELETE", `${container}/${blobName}`);
  const res = await fetch(url, { method: "DELETE", headers });
  await throwIfError(res);
}
