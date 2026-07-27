import { createAppContext, loadEnv } from "@omnimcp/core-infrastructure";
import { buildServer } from "./server.js";

async function main(): Promise<void> {
  const env = loadEnv();
  const context = createAppContext(env);
  await context.loadConnectors();

  const app = await buildServer(context, env);
  const port = Number(process.env.PORT ?? 3000);
  await app.listen({ port, host: "0.0.0.0" });

  const shutdown = async () => {
    await app.close();
    await context.shutdown();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("[rest-api] fatal error during startup:", err);
  process.exit(1);
});
