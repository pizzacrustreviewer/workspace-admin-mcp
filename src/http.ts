import { loadConfig, loadPolicyConfig } from "./config.js";
import { createLogger } from "./logger.js";
import { createHttpServer, createProtectedHttpHandler } from "./httpServer.js";
import { createTokenVerifier, loadHttpAuthConfig } from "./security/httpAuth.js";
import { resolveToolPolicy, toGoogleScopes } from "./security/toolPolicy.js";
import { createGoogleAuth } from "./workspace/googleAuth.js";
import { GoogleWorkspaceAdminClient } from "./workspace/googleWorkspaceAdminClient.js";
import { SyntheticWorkspaceAdminClient } from "./workspace/syntheticWorkspaceAdminClient.js";

try {
  const config = loadHttpAuthConfig();
  const policy = resolveToolPolicy(loadPolicyConfig());
  const logger = createLogger("info");
  const source = process.env.WORKSPACE_MCP_DATA_SOURCE ?? "synthetic";
  if (!["google", "synthetic"].includes(source)) throw new Error("Invalid data source");
  const googleConfig = source === "google" ? loadConfig() : undefined;
  const port = Number(process.env.PORT ?? "3000");
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid port");
  const server = createHttpServer(createProtectedHttpHandler({
    config, policy, logger, verifyToken: createTokenVerifier(config),
    clientForPolicy: (requestPolicy) => googleConfig
      ? new GoogleWorkspaceAdminClient(createGoogleAuth(googleConfig, toGoogleScopes(requestPolicy.grantedScopes)), googleConfig.customerId)
      : new SyntheticWorkspaceAdminClient()
  }));
  server.on("error", () => {
    logger.error("http_server_failed", { code: "HTTP_LISTENER_FAILED" }); process.exitCode = 1;
  });
  // TLS terminates at a reverse proxy on the isolated service host, not the agent host.
  server.listen(port, "127.0.0.1", () => logger.info("http_server_started", { port, dataSource: source }));
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => { server.close(); server.closeIdleConnections(); });
  }
} catch {
  process.stderr.write(JSON.stringify({ level: "error", event: "startup_failed", code: "CHECK_HTTP_SERVICE_CONFIG" }) + "\n");
  process.exitCode = 1;
}
