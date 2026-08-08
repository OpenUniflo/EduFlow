const userAgent = process.env.npm_config_user_agent ?? "";

if (!userAgent.startsWith("pnpm/")) {
  console.error("\nEduFlow uses pnpm exclusively. Run `pnpm install` so pnpm-lock.yaml stays synchronized.\n");
  process.exit(1);
}
