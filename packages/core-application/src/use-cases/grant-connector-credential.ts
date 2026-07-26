import {
  canManageConnectors,
  CredentialGrantId,
  NotFoundError,
  PermissionDeniedError,
  type ConnectorId,
  type CredentialGrant,
  type Role,
  type TenantId,
  type UserId,
} from "@omnimcp/core-domain";
import type { ConnectorRepository, CredentialGrantRepository } from "../ports/repositories.js";
import type { Clock, CryptoService, IdGenerator } from "../ports/services.js";

export interface GrantConnectorCredentialInput {
  readonly tenantId: TenantId;
  readonly connectorId: ConnectorId;
  readonly grantedByUserId: UserId;
  readonly grantedByRole: Role;
  /** Plaintext secret (PAT or OAuth token). Encrypted before it ever touches a repository. */
  readonly secret: string;
  readonly expiresAt?: Date | null;
}

export class GrantConnectorCredential {
  constructor(
    private readonly connectors: ConnectorRepository,
    private readonly grants: CredentialGrantRepository,
    private readonly crypto: CryptoService,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(input: GrantConnectorCredentialInput): Promise<CredentialGrant> {
    if (!canManageConnectors(input.grantedByRole)) {
      throw new PermissionDeniedError("Only tenant owners/admins can grant connector credentials");
    }
    const connector = await this.connectors.findById(input.connectorId);
    if (!connector) {
      throw new NotFoundError(`Unknown connector: ${input.connectorId}`);
    }

    const encrypted = this.crypto.encrypt(input.tenantId, input.secret);
    const grant: CredentialGrant = Object.freeze({
      id: CredentialGrantId(this.ids.newId()),
      tenantId: input.tenantId,
      connectorId: input.connectorId,
      grantedByUserId: input.grantedByUserId,
      ciphertext: encrypted.ciphertext,
      iv: encrypted.iv,
      authTag: encrypted.authTag,
      expiresAt: input.expiresAt ?? null,
      createdAt: this.clock.now(),
      revokedAt: null,
    });
    await this.grants.save(grant);
    return grant;
  }
}
