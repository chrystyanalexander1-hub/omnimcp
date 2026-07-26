import { ApiKeyId, TenantId, UserId, type ApiKey } from "@omnimcp/core-domain";
import type { ApiKeyRepository } from "../ports/repositories.js";
import type { Clock, CryptoService, IdGenerator } from "../ports/services.js";

export interface IssueApiKeyInput {
  readonly tenantId: TenantId;
  readonly createdByUserId: UserId;
  readonly name: string;
}

export interface IssueApiKeyOutput {
  readonly apiKey: ApiKey;
  /** The raw key value. Shown to the caller exactly once — only the hash is persisted. */
  readonly rawKey: string;
}

export class IssueApiKey {
  constructor(
    private readonly apiKeys: ApiKeyRepository,
    private readonly crypto: Pick<CryptoService, "sha256">,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(input: IssueApiKeyInput): Promise<IssueApiKeyOutput> {
    const rawKey = `omk_${this.ids.newId()}${this.ids.newId()}`.replace(/-/g, "");
    const apiKey: ApiKey = Object.freeze({
      id: ApiKeyId(this.ids.newId()),
      tenantId: input.tenantId,
      createdByUserId: input.createdByUserId,
      name: input.name,
      keyHash: this.crypto.sha256(rawKey),
      createdAt: this.clock.now(),
      revokedAt: null,
    });
    await this.apiKeys.save(apiKey);
    return { apiKey, rawKey };
  }
}
