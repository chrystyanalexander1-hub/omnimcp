import { createAppContext, loadEnv } from "@omnimcp/core-infrastructure";

async function main(): Promise<void> {
  const env = loadEnv();
  const context = createAppContext(env);
  await context.loadConnectors();

  console.log(
    `[automation-worker] polling for due workflows every ${env.AUTOMATION_POLL_INTERVAL_SECONDS}s`,
  );

  const poll = async () => {
    try {
      const ranCount = await context.useCases.runDueWorkflows.execute();
      if (ranCount > 0) {
        console.log(`[automation-worker] ran ${ranCount} workflow(s)`);
      }
    } catch (err) {
      console.error("[automation-worker] error while polling for due workflows:", err);
    }
  };

  await poll();
  const interval = setInterval(poll, env.AUTOMATION_POLL_INTERVAL_SECONDS * 1000);

  const shutdown = async () => {
    clearInterval(interval);
    await context.shutdown();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("[automation-worker] fatal error during startup:", err);
  process.exit(1);
});
