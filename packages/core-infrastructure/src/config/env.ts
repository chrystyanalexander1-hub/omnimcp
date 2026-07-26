import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  /** 32-byte key, base64-encoded, used as the root for per-tenant AES-256-GCM key derivation. */
  MASTER_ENCRYPTION_KEY: z.string().min(44, "MASTER_ENCRYPTION_KEY must be a base64-encoded 32-byte key"),
  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(120),
  CONNECTORS_DIR: z.string().default("./connectors"),
  /** Base URL the REST API is reachable at, used to build OAuth2 redirect_uri values (e.g. https://api.omnimcp.ai). */
  OAUTH_REDIRECT_BASE_URL: z.string().url().default("http://localhost:3000"),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

/** Parses and validates process.env once per process; throws immediately on a missing/malformed variable rather than failing later inside a request. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  if (cached) return cached;
  cached = envSchema.parse(source);
  return cached;
}
