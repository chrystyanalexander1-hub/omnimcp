import postgres from "postgres";
import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";

const OLD_KEY = Buffer.from(process.env.OLD_MASTER_KEY, "base64");
const NEW_KEY = Buffer.from(process.env.NEW_MASTER_KEY, "base64");
if (OLD_KEY.length !== 32 || NEW_KEY.length !== 32) {
  throw new Error("Both OLD_MASTER_KEY and NEW_MASTER_KEY must decode to exactly 32 bytes");
}

function deriveKey(master, tenantId) {
  return createHmac("sha256", master).update("tenant:" + tenantId).digest();
}

function decrypt(master, tenantId, ciphertext, iv, authTag) {
  const key = deriveKey(master, tenantId);
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(authTag, "base64"));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64")), decipher.final()]);
  return plaintext.toString("utf8");
}

function encrypt(master, tenantId, plaintext) {
  const key = deriveKey(master, tenantId);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
  };
}

async function main() {
  const sql = postgres(process.env.DATABASE_URL);
  const rows = await sql.unsafe(
    "select id, tenant_id, ciphertext, iv, auth_tag from credential_grants where revoked_at is null",
    [],
  );
  console.log("Found " + rows.length + " active credential(s) to re-encrypt.");

  let ok = 0;
  let failed = 0;
  for (const row of rows) {
    try {
      const plaintext = decrypt(OLD_KEY, row.tenant_id, row.ciphertext, row.iv, row.auth_tag);
      const enc = encrypt(NEW_KEY, row.tenant_id, plaintext);
      await sql.unsafe(
        "update credential_grants set ciphertext = $1, iv = $2, auth_tag = $3 where id = $4",
        [enc.ciphertext, enc.iv, enc.authTag, row.id],
      );
      ok = ok + 1;
    } catch (err) {
      failed = failed + 1;
      console.error("FAILED id=" + row.id + " tenant=" + row.tenant_id + ": " + err.message);
    }
  }

  console.log("Done. " + ok + " re-encrypted, " + failed + " failed.");
  if (failed > 0) {
    console.error("DO NOT update MASTER_ENCRYPTION_KEY yet - some rows failed to re-encrypt.");
    process.exitCode = 1;
  }
  await sql.end();
}

main();
