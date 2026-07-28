import postgres from "postgres";
import bcrypt from "bcryptjs";

const email = process.env.TARGET_EMAIL;
const password = process.env.NEW_PASSWORD;
if (!email || !password) {
  throw new Error("Set TARGET_EMAIL and NEW_PASSWORD env vars");
}
if (password.length < 10) {
  throw new Error("Password must be at least 10 characters");
}

const sql = postgres(process.env.DATABASE_URL);
const hash = await bcrypt.hash(password, 12);
const result = await sql.unsafe(
  "update users set password_hash = $1 where email = $2 returning id, email",
  [hash, email],
);
if (result.length === 0) {
  console.error("No user found with that email");
  process.exitCode = 1;
} else {
  console.log("Password updated for " + result[0].email + " (id " + result[0].id + ")");
}
await sql.end();
