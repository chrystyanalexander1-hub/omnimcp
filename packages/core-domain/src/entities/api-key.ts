import { ApiKeyId, TenantId, UserId } from "../ids.js";

export interface ApiKey {
  readonly id: ApiKeyId;
  readonly tenantId: TenantId;
  readonly createdByUserId: UserId;
  readonly name: string;
  /** SHA-256 hash of the raw key; the raw value is shown to the user exactly once at creation. */
  readonly keyHash: string;
  readonly createdAt: Date;
  readonly revokedAt: Date | null;
}

export function isApiKeyActive(apiKey: ApiKey): boolean {
  return apiKey.revokedAt === null;
}
