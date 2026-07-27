import type { Connector, TenantId } from "@omnimcp/core-domain";

export interface PasswordHasher {
  hash(plaintext: string): Promise<string>;
  verify(plaintext: string, hash: string): Promise<boolean>;
}

export interface AccessTokenClaims {
  readonly tenantId: string;
  readonly userId: string;
  readonly role: string;
}

export interface TokenService {
  issueAccessToken(claims: AccessTokenClaims): string;
  verifyAccessToken(token: string): AccessTokenClaims;
  /** Opaque random token; the caller hashes it before persisting via SessionRepository. */
  generateRefreshToken(): string;
}

export interface EncryptedPayload {
  readonly ciphertext: string;
  readonly iv: string;
  readonly authTag: string;
}

/** AES-256-GCM envelope encryption, keyed per tenant so a leaked master key alone can't decrypt without also deriving the tenant key. */
export interface CryptoService {
  encrypt(tenantId: TenantId, plaintext: string): EncryptedPayload;
  decrypt(tenantId: TenantId, payload: EncryptedPayload): string;
  sha256(value: string): string;
}

export interface Clock {
  now(): Date;
}

export interface IdGenerator {
  newId(): string;
}

export interface RateLimiter {
  /** Returns true if the call is allowed, false if the tenant has exceeded its budget. */
  consume(key: string, cost?: number): Promise<boolean>;
}

export interface ConnectorToolResult {
  readonly isError: boolean;
  readonly content: unknown;
}

/**
 * Dispatches a validated, permitted tool call to the connector's own MCP process and
 * returns its raw result. `tenantId` is required (not just the secret) because the
 * implementation pools one child process per tenant+connector — never one shared
 * process for the whole platform — so one tenant's credential can never leak into
 * another tenant's call. Implemented in core-infrastructure by ConnectorProcessManager.
 */
export interface ConnectorInvoker {
  invoke(
    tenantId: TenantId,
    connector: Connector,
    toolName: string,
    params: Record<string, unknown>,
    credentialSecret: string | null,
  ): Promise<ConnectorToolResult>;
}

/** Parses/evaluates cron expressions for scheduled workflows. Kept as a port because the domain layer must not depend on a cron-parsing library. */
export interface CronScheduler {
  isValid(cronExpression: string): boolean;
  /** Throws if `cronExpression` is invalid — callers should check `isValid` first when they need to reject bad input gracefully. */
  nextRunAt(cronExpression: string, after: Date): Date;
}
