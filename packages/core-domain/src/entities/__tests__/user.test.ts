import { describe, expect, it } from "vitest";
import { createUser, canManageConnectors, canViewAudit } from "../user.js";
import { InvalidEntityError } from "../../errors.js";
import { TenantId, UserId } from "../../ids.js";

describe("createUser", () => {
  const base = {
    id: UserId("u1"),
    tenantId: TenantId("t1"),
    passwordHash: "hashed",
  };

  it("normalizes email to lowercase and defaults role to member", () => {
    const user = createUser({ ...base, email: "Alice@Example.com" });
    expect(user.email).toBe("alice@example.com");
    expect(user.role).toBe("member");
  });

  it("rejects invalid email addresses", () => {
    expect(() => createUser({ ...base, email: "not-an-email" })).toThrow(InvalidEntityError);
  });

  it("rejects a missing password hash", () => {
    expect(() => createUser({ ...base, email: "a@b.com", passwordHash: "" })).toThrow(InvalidEntityError);
  });
});

describe("role capabilities", () => {
  it("only owner/admin can manage connectors and view audit", () => {
    expect(canManageConnectors("owner")).toBe(true);
    expect(canManageConnectors("admin")).toBe(true);
    expect(canManageConnectors("member")).toBe(false);
    expect(canViewAudit("member")).toBe(false);
  });
});
