import { request as httpRequest } from "node:http";
import { once } from "node:events";
import { spawn } from "node:child_process";
import { exportJWK, generateKeyPair, createLocalJWKSet, SignJWT } from "jose";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { CLIENT_CAPABILITIES_META_KEY, CLIENT_INFO_META_KEY, PROTOCOL_VERSION_META_KEY } from "@modelcontextprotocol/server";
import { createHttpServer, createProtectedHttpHandler } from "../src/httpServer.js";
import { createTokenVerifier, loadHttpAuthConfig } from "../src/security/httpAuth.js";
import { resolveToolPolicy } from "../src/security/toolPolicy.js";
import { SyntheticWorkspaceAdminClient } from "../src/workspace/syntheticWorkspaceAdminClient.js";
import { assertSyntheticStdio, loadPolicyConfig } from "../src/config.js";

const config = {
  resourceUrl: "https://mcp.example.test/mcp", issuer: "https://issuer.example.test",
  jwksUrl: "https://issuer.example.test/jwks", allowedSubjects: ["operator-1"]
};
let privateKey: CryptoKey;
let otherKey: CryptoKey;
let verifier: ReturnType<typeof createTokenVerifier>;
beforeAll(async () => {
  const pair = await generateKeyPair("ES256");
  privateKey = pair.privateKey;
  otherKey = (await generateKeyPair("ES256")).privateKey;
  verifier = createTokenVerifier(config, createLocalJWKSet({ keys: [{ ...await exportJWK(pair.publicKey), kid: "test-key" }] }));
});

async function token(overrides: Record<string, unknown> = {}, options: { typ?: string; key?: CryptoKey; omit?: string[] } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const claims: Record<string, unknown> = {
    iss: config.issuer, aud: config.resourceUrl, sub: "operator-1", iat: now, exp: now + 300,
    jti: "synthetic-id", client_id: "test-client", scope: "workspace.users.read", ...overrides
  };
  for (const key of options.omit ?? []) delete claims[key];
  return new SignJWT(claims).setProtectedHeader({ alg: "ES256", typ: options.typ ?? "at+jwt", kid: "test-key" })
    .sign(options.key ?? privateKey);
}

function setup() {
  const api = new SyntheticWorkspaceAdminClient();
  const getUser = vi.spyOn(api, "getUser");
  const listGroups = vi.spyOn(api, "listGroups");
  const clientForPolicy = vi.fn(() => api);
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
  const handler = createProtectedHttpHandler({ config, policy: resolveToolPolicy({ profile: "full-readonly" }),
    verifyToken: verifier, clientForPolicy, logger });
  return { handler, getUser, listGroups, clientForPolicy, logger };
}

function message(method = "tools/list", params: Record<string, unknown> = {}) {
  return { jsonrpc: "2.0", id: 1, method, params: { ...params, _meta: {
    [PROTOCOL_VERSION_META_KEY]: "2026-07-28",
    [CLIENT_INFO_META_KEY]: { name: "test-client", version: "1.0.0" },
    [CLIENT_CAPABILITIES_META_KEY]: {}
  } } };
}
function req(bearer?: string, body = message(), headers: Record<string, string> = {}) {
  return new Request(config.resourceUrl, { method: "POST", headers: {
    host: "mcp.example.test", "content-type": "application/json", accept: "application/json, text/event-stream",
    "mcp-protocol-version": "2026-07-28", "mcp-method": body.method,
    ...(body.method === "tools/call" ? { "mcp-name": String((body.params as Record<string, unknown>).name) } : {}),
    ...(bearer ? { authorization: `Bearer ${bearer}` } : {}), ...headers
  }, body: JSON.stringify(body) });
}

describe("authenticated HTTP boundary", () => {
  it("requires a token and advertises protected-resource metadata", async () => {
    const { handler, clientForPolicy } = setup();
    const denied = await handler.fetch(req());
    expect(denied.status).toBe(401);
    expect(denied.headers.get("www-authenticate")).toContain("/.well-known/oauth-protected-resource/mcp");
    const metadata = await handler.fetch(new Request("https://mcp.example.test/.well-known/oauth-protected-resource/mcp", {
      headers: { host: "mcp.example.test" }
    }));
    expect(await metadata.json()).toMatchObject({ resource: config.resourceUrl, authorization_servers: [config.issuer] });
    expect(clientForPolicy).not.toHaveBeenCalled();
  });

  it.each([
    ["wrong audience", { aud: "https://other.example.test/mcp" }],
    ["wrong issuer", { iss: "https://other.example.test" }],
    ["expired", { exp: 1 }],
    ["future", { nbf: 9999999999 }],
    ["unapproved subject", { sub: "operator-2" }],
    ["missing scopes", { scope: null }]
  ])("rejects %s before creating a provider", async (_name, claims) => {
    const { handler, clientForPolicy } = setup();
    const result = await handler.fetch(req(await token(claims as Record<string, unknown>)));
    expect(result.status).toBe(401);
    expect(clientForPolicy).not.toHaveBeenCalled();
    expect(await result.text()).toBe('{"error":"unauthorized"}');
  });

  it.each(["exp", "sub", "iat", "client_id", "jti"])("requires claim %s", async (claim) => {
    const { handler, clientForPolicy } = setup();
    expect((await handler.fetch(req(await token({}, { omit: [claim] })))).status).toBe(401);
    expect(clientForPolicy).not.toHaveBeenCalled();
  });

  it("rejects ID tokens and untrusted signatures", async () => {
    const { handler, clientForPolicy } = setup();
    expect((await handler.fetch(req(await token({}, { typ: "JWT" })))).status).toBe(401);
    expect((await handler.fetch(req(await token({}, { key: otherKey })))).status).toBe(401);
    expect(clientForPolicy).not.toHaveBeenCalled();
  });

  it("narrows discovery and blocks direct calls outside token scopes", async () => {
    const { handler, getUser, listGroups, clientForPolicy } = setup();
    const accessToken = await token();
    const response = await handler.fetch(req(accessToken));
    expect(response.status, await response.clone().text()).toBe(200);
    const listing = await response.json();
    expect(listing.result.tools.map((tool: { name: string }) => tool.name)).toEqual(["workspace_users_list", "workspace_user_get"]);
    const denied = await handler.fetch(req(accessToken, message("tools/call", { name: "workspace_groups_list", arguments: {} })));
    expect((await denied.json()).error.code).toBe(-32602);
    expect(listGroups).not.toHaveBeenCalled();
    const allowed = await handler.fetch(req(accessToken, message("tools/call", {
      name: "workspace_user_get", arguments: { userKey: "admin@example.test" }
    })));
    expect((await allowed.json()).result.structuredContent.user.id).toBe("synthetic-admin");
    expect(getUser).toHaveBeenCalledWith("admin@example.test");
    expect(clientForPolicy).toHaveBeenLastCalledWith(expect.objectContaining({ grantedScopes: ["workspace.users.read"] }));
    expect(JSON.stringify(clientForPolicy.mock.calls)).not.toContain(accessToken);
  });

  it("revalidates every request and does not reuse another caller's scopes", async () => {
    const { handler, clientForPolicy } = setup();
    const first = await handler.fetch(req(await token()));
    expect((await first.json()).result.tools).toHaveLength(2);
    const second = await handler.fetch(req(await token({ scope: "workspace.audit.read" })));
    expect((await second.json()).result.tools.map((tool: { name: string }) => tool.name)).toEqual(["workspace_admin_activity_search"]);
    clientForPolicy.mockClear();
    expect((await handler.fetch(req())).status).toBe(401);
    expect((await handler.fetch(req(await token({ scope: "unknown.scope" })))).status).toBe(403);
    expect(clientForPolicy).not.toHaveBeenCalled();
  });

  it("supports legacy stateless HTTP initialization and subsequent discovery", async () => {
    const { handler } = setup();
    const accessToken = await token();
    const legacy = (body: unknown) => new Request(config.resourceUrl, {
      method: "POST", headers: { host: "mcp.example.test", authorization: `Bearer ${accessToken}`,
        "content-type": "application/json", accept: "application/json, text/event-stream",
        "mcp-protocol-version": "2025-11-25" }, body: JSON.stringify(body)
    });
    const result = async (response: Response) => {
      const body = await response.text();
      if (response.headers.get("content-type")?.includes("text/event-stream")) {
        const data = body.split("\n").find((line) => line.startsWith("data: "));
        if (!data) throw new Error("Missing legacy SSE result");
        return JSON.parse(data.slice(6));
      }
      return JSON.parse(body);
    };
    const initialized = await handler.fetch(legacy({ jsonrpc: "2.0", id: 1, method: "initialize",
      params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "test", version: "1" } } }));
    expect(initialized.status, await initialized.clone().text()).toBe(200);
    expect((await result(initialized)).result.protocolVersion).toBe("2025-11-25");
    expect(initialized.headers.get("mcp-session-id")).toBeNull();
    const listed = await handler.fetch(legacy({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }));
    expect((await result(listed)).result.tools).toHaveLength(2);
  });

  it("rejects hostile hosts and origins even with a valid token", async () => {
    const { handler, clientForPolicy } = setup();
    const accessToken = await token();
    expect((await handler.fetch(req(accessToken, message(), { host: "evil.example" }))).status).toBe(403);
    expect((await handler.fetch(req(accessToken, message(), { origin: "https://evil.example" }))).status).toBe(403);
    expect(clientForPolicy).not.toHaveBeenCalled();
  });

  it("serves actual Node HTTP requests and rejects oversized bodies", async () => {
    const { handler } = setup();
    const server = createHttpServer(handler);
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing port");
    const send = (body: string, accessToken: string) => new Promise<{ status: number; text: string }>((resolve, reject) => {
      const request = httpRequest({ host: "127.0.0.1", port: address.port, path: "/mcp", method: "POST", headers: {
        host: "mcp.example.test", authorization: `Bearer ${accessToken}`, "content-type": "application/json",
        accept: "application/json, text/event-stream", "mcp-protocol-version": "2026-07-28", "mcp-method": "tools/list"
      } }, (response) => {
        let text = "";
        response.on("data", (chunk) => { text += chunk; });
        response.on("end", () => resolve({ status: response.statusCode!, text }));
      });
      request.on("error", reject);
      request.end(body);
    });
    try {
      const accessToken = await token();
      const reply = await send(JSON.stringify(message()), accessToken);
      expect(reply.status, reply.text).toBe(200);
      expect(JSON.parse(reply.text).result.tools).toHaveLength(2);
      expect((await send(JSON.stringify({ payload: "x".repeat(65536) }), accessToken)).status).toBe(413);
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });
});

describe("safe runtime configuration", () => {
  it("runs the actual stdio entrypoint without Google credentials", async () => {
    const child = spawn(process.execPath, ["--import", "tsx", "src/index.ts"], {
      env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, WORKSPACE_MCP_DATA_SOURCE: "synthetic" },
      stdio: ["pipe", "pipe", "pipe"]
    });
    const closed = once(child, "close");
    try {
      const reply = new Promise<string>((resolve, reject) => {
        let output = "";
        const timer = setTimeout(() => reject(new Error("Stdio startup timed out")), 5000);
        child.on("error", (error) => { clearTimeout(timer); reject(error); });
        child.stdout.on("data", (chunk) => {
          output += String(chunk);
          if (output.includes("\n")) { clearTimeout(timer); resolve(output.split("\n")[0]); }
        });
      });
      child.stdin.write(JSON.stringify(message()) + "\n");
      expect(JSON.parse(await reply).result.tools.map((tool: { name: string }) => tool.name))
        .toEqual(["workspace_privileged_user_review"]);
    } finally { child.kill(); await closed; }
  });
  it("keeps stdio synthetic and refuses key-bearing or live configurations", () => {
    expect(() => assertSyntheticStdio({})).not.toThrow();
    expect(() => assertSyntheticStdio({ WORKSPACE_MCP_DATA_SOURCE: "google" })).toThrow();
    expect(() => assertSyntheticStdio({ GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: "sensitive" })).toThrow();
    expect(() => assertSyntheticStdio({ GOOGLE_APPLICATION_CREDENTIALS: "secret.json" })).toThrow();
  });
  it("fails closed on malformed policy and preserves explicit deny-all", () => {
    expect(() => loadPolicyConfig({ WORKSPACE_MCP_ALLOWED_TOOLS: "workspace_user_get,typo" })).toThrow();
    expect(() => loadPolicyConfig({ WORKSPACE_MCP_GRANTED_SCOPES: "workspace.users.read," })).toThrow();
    expect(resolveToolPolicy(loadPolicyConfig({ WORKSPACE_MCP_ALLOWED_TOOLS: "" })).allowedTools).toEqual([]);
    expect(resolveToolPolicy(loadPolicyConfig({ WORKSPACE_MCP_GRANTED_SCOPES: "" })).allowedTools).toEqual([]);
  });
  it("requires explicit trusted HTTPS authority and caller configuration", () => {
    expect(() => loadHttpAuthConfig({})).toThrow();
    expect(() => loadHttpAuthConfig({ WORKSPACE_MCP_RESOURCE_URL: "http://mcp.example.test/mcp",
      WORKSPACE_MCP_OAUTH_ISSUER: config.issuer, WORKSPACE_MCP_OAUTH_JWKS_URL: config.jwksUrl,
      WORKSPACE_MCP_ALLOWED_SUBJECTS: "operator-1" })).toThrow();
  });
});
