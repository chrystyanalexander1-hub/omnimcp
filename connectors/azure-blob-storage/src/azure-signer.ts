import { createHmac } from "node:crypto";
import { requireEnv } from "@omnimcp/connector-sdk-ts";

const API_VERSION = "2021-08-06";

interface ParsedConnectionString {
  readonly accountName: string;
  readonly accountKey: string;
  readonly endpointSuffix: string;
}

function parseConnectionString(): ParsedConnectionString {
  const raw = requireEnv("AZURE_STORAGE_CONNECTION_STRING");
  const parts = Object.fromEntries(
    raw.split(";").filter(Boolean).map((pair) => {
      const idx = pair.indexOf("=");
      return [pair.slice(0, idx), pair.slice(idx + 1)];
    }),
  );
  const accountName = parts.AccountName;
  const accountKey = parts.AccountKey;
  if (!accountName || !accountKey) {
    throw new Error("AZURE_STORAGE_CONNECTION_STRING is missing AccountName or AccountKey");
  }
  return { accountName, accountKey, endpointSuffix: parts.EndpointSuffix ?? "core.windows.net" };
}

/**
 * Azure Blob's REST API doesn't accept a simple bearer token from a connection
 * string — it requires each request to be signed with the account key using the
 * "Shared Key" scheme (https://learn.microsoft.com/rest/api/storageservices/authorize-with-shared-key).
 * This builds that signature from scratch since there's no lightweight official
 * client for it; the alternative (Azure AD app registration + OAuth) is more setup
 * for a first version of this connector.
 */
export function buildSignedRequest(
  method: string,
  containerAndBlobPath: string,
  queryParams: Record<string, string> = {},
  extraHeaders: Record<string, string> = {},
): { url: string; headers: Record<string, string> } {
  const { accountName, accountKey, endpointSuffix } = parseConnectionString();
  const dateHeader = new Date().toUTCString();

  const canonicalHeaders: Record<string, string> = {
    "x-ms-date": dateHeader,
    "x-ms-version": API_VERSION,
    ...extraHeaders,
  };
  const msHeaderNames = Object.keys(canonicalHeaders)
    .filter((k) => k.toLowerCase().startsWith("x-ms-"))
    .sort();
  const canonicalizedHeaders = msHeaderNames.map((k) => `${k.toLowerCase()}:${canonicalHeaders[k]}\n`).join("");

  const sortedQueryKeys = Object.keys(queryParams).sort();
  const canonicalizedResource =
    `/${accountName}/${containerAndBlobPath}` +
    sortedQueryKeys.map((k) => `\n${k.toLowerCase()}:${queryParams[k]}`).join("");

  const contentLength = extraHeaders["Content-Length"] ?? "";
  const stringToSign = [
    method,
    "", // Content-Encoding
    "", // Content-Language
    contentLength,
    "", // Content-MD5
    extraHeaders["Content-Type"] ?? "",
    "", // Date (using x-ms-date instead)
    "", // If-Modified-Since
    "", // If-Match
    "", // If-None-Match
    "", // If-Unmodified-Since
    "", // Range
    canonicalizedHeaders + canonicalizedResource,
  ].join("\n");

  const signature = createHmac("sha256", Buffer.from(accountKey, "base64")).update(stringToSign, "utf8").digest("base64");

  const url = new URL(`https://${accountName}.blob.${endpointSuffix}/${containerAndBlobPath}`);
  for (const [key, value] of Object.entries(queryParams)) url.searchParams.set(key, value);

  return {
    url: url.toString(),
    headers: {
      ...extraHeaders,
      "x-ms-date": dateHeader,
      "x-ms-version": API_VERSION,
      Authorization: `SharedKey ${accountName}:${signature}`,
    },
  };
}
