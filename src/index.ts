#!/usr/bin/env node
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { assertSyntheticStdio, loadPolicyConfig } from "./config.js";
import { createLogger } from "./logger.js";
import { createMcpServer } from "./mcpServer.js";
import { resolveToolPolicy } from "./security/toolPolicy.js";
import { SyntheticWorkspaceAdminClient } from "./workspace/syntheticWorkspaceAdminClient.js";

function main() {
  assertSyntheticStdio();
  const logger = createLogger("info");
  const policy = resolveToolPolicy(loadPolicyConfig());
  const client = new SyntheticWorkspaceAdminClient();
  logger.info("server_starting", {
    name: "google-workspace-admin",
    dataSource: "synthetic",
    securityProfile: policy.profile,
    exposedTools: policy.allowedTools,
    grantedScopes: policy.grantedScopes
  });

  serveStdio(() => createMcpServer(client, logger, policy), {
    onerror: () => logger.error("transport_error", { code: "STDIO_TRANSPORT_ERROR" })
  });
}

try {
  main();
} catch {
  process.stderr.write(JSON.stringify({ level: "error", event: "startup_failed", code: "CHECK_SYNTHETIC_STDIO_CONFIG" }) + "\n");
  process.exit(1);
}
