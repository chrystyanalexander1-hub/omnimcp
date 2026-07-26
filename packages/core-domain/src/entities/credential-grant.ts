import { ConnectorId, CredentialGrantId, TenantId, UserId } from "../ids.js";

/**
 * A tenant's secret for a connector (PAT, OAuth access/refresh token, ...), always
 * stored encrypted (AES-256-GCM) — this entity never carries plaintext. `ciphertext`,
 * `iv` and `authTag` are base64. Decryption happens only inside core-infrastructure's
 * CryptoService, immediately before a tool call is dispatched to the connector process.
 */
export interface CredentialGrant {
  readonly id: CredentialGrantId;
  readonly tenantId: TenantId;
  readonly connectorId: ConnectorId;
  readonly grantedByUserId: UserId;
  readonly ciphertext: string;
  readonly iv: string;
  readonly authTag: string;
  readonly expiresAt: Date | null;
  readonly createdAt: Date;
  readonly revokedAt: Date | null;
}

export function isCredentialGrantActive(grant: CredentialGrant, now: Date = new Date()): boolean {
  if (grant.revokedAt !== null) return false;
  if (grant.expiresAt !== null && grant.expiresAt <= now) return false;
  return true;
}
