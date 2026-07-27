import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { ConnectorManifest } from "@omnimcp/core-application";
import type { ConnectorAuth } from "@omnimcp/core-domain";

const toolSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  inputSchema: z.record(z.unknown()).default({}),
  sensitive: z.boolean().default(false),
});

const transportSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("stdio"), command: z.string().min(1), args: z.array(z.string()).default([]) }),
  z.object({ type: z.literal("http"), baseUrl: z.string().url() }),
]);

const authSchema = z.object({
  type: z.enum(["api_key", "oauth2", "none"]),
  envVar: z.string().optional(),
  oauth: z
    .object({
      authorizationUrl: z.string().url(),
      tokenUrl: z.string().url(),
      scopes: z.array(z.string()).default([]),
      clientIdEnvVar: z.string(),
      clientSecretEnvVar: z.string(),
    })
    .optional(),
  sharedEnvVars: z.array(z.string()).optional(),
});

const manifestSchema = z.object({
  id: z
    .string()
    .regex(/^[a-z][a-z0-9_-]*$/, "connector id must be lowercase kebab/snake case, e.g. \"github\""),
  displayName: z.string().min(1),
  version: z.string().min(1),
  transport: transportSchema,
  auth: authSchema,
  tools: z.array(toolSchema).min(1),
});

/** Reads and validates every `connector.manifest.json` directly under `connectorsDir`, resolving stdio command/args relative to each connector's own directory. */
export async function loadConnectorManifests(connectorsDir: string): Promise<ConnectorManifest[]> {
  const entries = await readdir(connectorsDir, { withFileTypes: true });
  const manifests: ConnectorManifest[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const manifestPath = path.join(connectorsDir, entry.name, "connector.manifest.json");
    let raw: string;
    try {
      raw = await readFile(manifestPath, "utf8");
    } catch {
      continue; // not every subdirectory has to be a connector
    }

    const parsed = manifestSchema.parse(JSON.parse(raw));
    const transport =
      parsed.transport.type === "stdio"
        ? {
            type: "stdio" as const,
            command: parsed.transport.command,
            args: parsed.transport.args.map((arg) =>
              arg.startsWith("-") ? arg : path.resolve(connectorsDir, entry.name, arg),
            ),
          }
        : parsed.transport;

    // Built key-by-key (rather than spreading `parsed.auth` directly) so an absent
    // optional field is simply missing from the object, not present with value
    // `undefined` — required under the domain type's `exactOptionalPropertyTypes`.
    const auth: ConnectorAuth = {
      type: parsed.auth.type,
      ...(parsed.auth.envVar !== undefined ? { envVar: parsed.auth.envVar } : {}),
      ...(parsed.auth.oauth !== undefined ? { oauth: parsed.auth.oauth } : {}),
      ...(parsed.auth.sharedEnvVars !== undefined ? { sharedEnvVars: parsed.auth.sharedEnvVars } : {}),
    };

    manifests.push({
      id: parsed.id,
      displayName: parsed.displayName,
      version: parsed.version,
      transport,
      auth,
      tools: parsed.tools,
    });
  }

  return manifests;
}
