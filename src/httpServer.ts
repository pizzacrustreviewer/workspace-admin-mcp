import { createServer } from "node:http";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { toNodeHandler } from "@modelcontextprotocol/node";
import { createMcpServer } from "./mcpServer.js";
import type { Logger } from "./logger.js";
import { resolveToolPolicy, type ToolPolicy } from "./security/toolPolicy.js";
import type { HttpAuthConfig, Principal } from "./security/httpAuth.js";
import type { WorkspaceAdminClient } from "./workspace/types.js";

const MAX_BODY_BYTES = 65536;

export function createProtectedHttpHandler(options: {
  config: HttpAuthConfig;
  policy: ToolPolicy;
  verifyToken: (token: string) => Promise<Principal>;
  clientForPolicy: (policy: ToolPolicy) => WorkspaceAdminClient;
  logger: Logger;
}) {
  const resource = new URL(options.config.resourceUrl);
  const metadataPath = "/.well-known/oauth-protected-resource/mcp";
  const challenge = `Bearer resource_metadata="${resource.origin}${metadataPath}"`;
  const reply = (status: number, error: string, authenticate?: string) => Response.json({ error }, {
    status, headers: { "Cache-Control": "no-store", ...(authenticate ? { "WWW-Authenticate": authenticate } : {}) }
  });

  return { async fetch(request: Request): Promise<Response> {
    if (request.headers.get("host") !== resource.host) return reply(403, "untrusted_host");
    const origin = request.headers.get("origin");
    if (origin && origin !== resource.origin) return reply(403, "untrusted_origin");
    const url = new URL(request.url);
    if (url.pathname === metadataPath && request.method === "GET") {
      return Response.json({ resource: resource.href, authorization_servers: [options.config.issuer],
        scopes_supported: options.policy.grantedScopes, bearer_methods_supported: ["header"] });
    }
    if (url.pathname !== "/mcp") return reply(404, "not_found");
    const authorization = request.headers.get("authorization") ?? "";
    if (!/^Bearer [A-Za-z0-9._~-]+$/i.test(authorization) || authorization.length > 16384) {
      return reply(401, "unauthorized", challenge);
    }
    let principal: Principal;
    try { principal = await options.verifyToken(authorization.slice(7)); }
    catch { return reply(401, "unauthorized", `${challenge}, error="invalid_token"`); }
    const policy = resolveToolPolicy({
      profile: options.policy.profile, allowedTools: options.policy.allowedTools,
      grantedScopes: options.policy.grantedScopes.filter((scope) => principal.scopes.includes(scope))
    });
    if (!policy.allowedTools.length) return reply(403, "insufficient_scope", `${challenge}, error="insufficient_scope"`);
    if (request.method !== "POST") return new Response(null, { status: 405, headers: { Allow: "POST" } });
    if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") {
      return reply(415, "unsupported_media_type");
    }
    // Neither the inbound token nor the caller's metadata is passed to the Google factory.
    const handler = createMcpHandler(() => createMcpServer(options.clientForPolicy(policy), options.logger, policy), {
      legacy: "stateless", responseMode: "json", maxSubscriptions: 0,
      onerror: () => options.logger.error("http_protocol_error", { code: "MCP_PROTOCOL_ERROR" })
    });
    try {
      const response = await handler.fetch(request);
      response.headers.set("Cache-Control", "no-store");
      return response;
    } catch {
      options.logger.error("http_request_failed", { code: "MCP_REQUEST_FAILED" });
      return reply(500, "request_failed");
    } finally { await handler.close(); }
  } };
}

export function createHttpServer(handler: ReturnType<typeof createProtectedHttpHandler>) {
  const nodeHandler = toNodeHandler(handler);
  return createServer({ requestTimeout: 15000, headersTimeout: 10000, maxHeaderSize: 16384 }, async (req, res) => {
    try {
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of req) {
        const bytes = Buffer.from(chunk);
        size += bytes.length;
        if (size > MAX_BODY_BYTES) {
          res.writeHead(413, { Connection: "close" }); res.end(); return;
        }
        chunks.push(bytes);
      }
      let body: unknown;
      if (size) {
        try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
        catch { res.writeHead(400); res.end(); return; }
      }
      await nodeHandler(req, res, body);
    } catch {
      if (!res.headersSent) res.writeHead(500);
      res.end();
    }
  });
}
