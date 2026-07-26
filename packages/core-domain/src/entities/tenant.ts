import { InvalidEntityError } from "../errors.js";
import { TenantId } from "../ids.js";

export type TenantPlan = "free" | "pro" | "enterprise";

export interface Tenant {
  readonly id: TenantId;
  readonly name: string;
  readonly plan: TenantPlan;
  readonly createdAt: Date;
}

export interface CreateTenantInput {
  id: TenantId;
  name: string;
  plan?: TenantPlan;
  createdAt?: Date;
}

export function createTenant(input: CreateTenantInput): Tenant {
  const name = input.name.trim();
  if (name.length < 2) {
    throw new InvalidEntityError("Tenant name must be at least 2 characters long");
  }
  return Object.freeze({
    id: input.id,
    name,
    plan: input.plan ?? "free",
    createdAt: input.createdAt ?? new Date(),
  });
}
