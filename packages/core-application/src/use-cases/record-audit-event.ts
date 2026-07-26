import { AuditEventId, type AuditEvent, type AuditOutcome, type TenantId, type UserId } from "@omnimcp/core-domain";
import type { AuditEventRepository } from "../ports/repositories.js";
import type { Clock, CryptoService, IdGenerator } from "../ports/services.js";

export interface RecordAuditEventInput {
  readonly tenantId: TenantId;
  readonly actorUserId: UserId;
  readonly qualifiedToolName: string;
  /** Raw params — hashed here so no use case caller has to remember to do it. */
  readonly params: Record<string, unknown>;
  readonly outcome: AuditOutcome;
  readonly errorMessage?: string | null;
}

/** Writes a single immutable audit record. Called directly for auth-adjacent events, and internally by ExecuteTool for every tool call attempt. */
export class RecordAuditEvent {
  constructor(
    private readonly auditEvents: AuditEventRepository,
    private readonly crypto: Pick<CryptoService, "sha256">,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(input: RecordAuditEventInput): Promise<AuditEvent> {
    const event: AuditEvent = Object.freeze({
      id: AuditEventId(this.ids.newId()),
      tenantId: input.tenantId,
      actorUserId: input.actorUserId,
      qualifiedToolName: input.qualifiedToolName,
      paramsHash: this.crypto.sha256(JSON.stringify(input.params)),
      outcome: input.outcome,
      errorMessage: input.errorMessage ?? null,
      occurredAt: this.clock.now(),
    });
    await this.auditEvents.save(event);
    return event;
  }
}
