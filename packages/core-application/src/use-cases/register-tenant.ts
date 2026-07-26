import { createTenant, createUser, TenantId, UserId, type Tenant, type User } from "@omnimcp/core-domain";
import type { TenantRepository, UserRepository } from "../ports/repositories.js";
import type { Clock, IdGenerator, PasswordHasher } from "../ports/services.js";

export interface RegisterTenantInput {
  readonly tenantName: string;
  readonly ownerEmail: string;
  readonly ownerPassword: string;
}

export interface RegisterTenantOutput {
  readonly tenant: Tenant;
  readonly owner: User;
}

/** Onboarding entry point: creates a new tenant together with its first user, who always starts as "owner". There is no separate "create tenant" step without an owner — an ownerless tenant is not a valid state. */
export class RegisterTenant {
  constructor(
    private readonly tenants: TenantRepository,
    private readonly users: UserRepository,
    private readonly passwordHasher: PasswordHasher,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(input: RegisterTenantInput): Promise<RegisterTenantOutput> {
    const tenant = createTenant({ id: TenantId(this.ids.newId()), name: input.tenantName, createdAt: this.clock.now() });
    await this.tenants.save(tenant);

    const owner = createUser({
      id: UserId(this.ids.newId()),
      tenantId: tenant.id,
      email: input.ownerEmail,
      passwordHash: await this.passwordHasher.hash(input.ownerPassword),
      role: "owner",
      createdAt: this.clock.now(),
    });
    await this.users.save(owner);

    return { tenant, owner };
  }
}
