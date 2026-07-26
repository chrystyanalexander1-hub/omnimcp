import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from "node:crypto";
import type { TenantId } from "@omnimcp/core-domain";
import type { CryptoService, EncryptedPayload } from "@omnimcp/core-application";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

/**
 * AES-256-GCM with a key derived per tenant via HMAC-SHA256(masterKey, tenantId)
 * (an HKDF-Expand step). A single leaked master key still requires deriving each
 * tenant's key individually, and a compromised tenant key can't decrypt another
 * tenant's credentials.
 */
export class AesCryptoService implements CryptoService {
  private readonly masterKey: Buffer;

  constructor(masterKeyBase64: string) {
    this.masterKey = Buffer.from(masterKeyBase64, "base64");
    if (this.masterKey.length !== 32) {
      throw new Error("MASTER_ENCRYPTION_KEY must decode to exactly 32 bytes");
    }
  }

  private deriveTenantKey(tenantId: TenantId): Buffer {
    return createHmac("sha256", this.masterKey).update(`tenant:${tenantId}`).digest();
  }

  encrypt(tenantId: TenantId, plaintext: string): EncryptedPayload {
    const key = this.deriveTenantKey(tenantId);
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return {
      ciphertext: ciphertext.toString("base64"),
      iv: iv.toString("base64"),
      authTag: authTag.toString("base64"),
    };
  }

  decrypt(tenantId: TenantId, payload: EncryptedPayload): string {
    const key = this.deriveTenantKey(tenantId);
    const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(payload.iv, "base64"));
    decipher.setAuthTag(Buffer.from(payload.authTag, "base64"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(payload.ciphertext, "base64")),
      decipher.final(),
    ]);
    return plaintext.toString("utf8");
  }

  sha256(value: string): string {
    return createHash("sha256").update(value).digest("hex");
  }
}
