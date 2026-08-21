#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { loadConfig } from "./config.js";
import { createLogger } from "./logger.js";
import { createMcpServer } from "./mcpServer.js";
import { resolveToolPolicy, toGoogleScopes } from "./security/toolPolicy.js";
import { createGoogleAuth } from "./workspace/googleAuth.js";
import { GoogleWorkspaceAdminClient } from "./workspace/googleWorkspaceAdminClient.js";

async function main() {
  const config = loadConfig();
  const logger = createLogger(config.logLevel);
  const policy = resolveToolPolicy({
    profile: config.securityProfile,
    allowedTools: config.allowedTools,
    grantedScopes: config.grantedScopes
  });
  const auth = createGoogleAuth(config, toGoogleScopes(policy.grantedScopes));
  const client = new GoogleWorkspaceAdminClient(auth, config.customerId);
  const server = createMcpServer(client, logger, policy);

  logger.info("server_starting", {
    name: "google-workspace-admin",
    customerId: config.customerId,
    delegatedAdmin: config.delegatedAdmin,
    securityProfile: policy.profile,
    exposedTools: policy.allowedTools,
    grantedScopes: policy.grantedScopes
  });

  await server.connect(new StdioServerTransport());
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(JSON.stringify({ level: "error", event: "server_crashed", message }) + "\n");
  process.exit(1);
});
