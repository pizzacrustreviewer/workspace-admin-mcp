import { PassThrough } from "node:stream";
import { createInterface } from "node:readline";
import {
  CLIENT_CAPABILITIES_META_KEY,
  CLIENT_INFO_META_KEY,
  PROTOCOL_VERSION_META_KEY
} from "@modelcontextprotocol/server";
import { serveStdio, StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMcpServer } from "../src/mcpServer.js";
import { resolveToolPolicy } from "../src/security/toolPolicy.js";
import type { WorkspaceAdminClient } from "../src/workspace/types.js";

const window = { startTime: "2026-08-01T00:00:00.000Z", endTime: "2026-08-02T00:00:00.000Z" };
const user = {
  id: "user-1", primaryEmail: "user@example.com", suspended: false,
  archived: false, isAdmin: true, isDelegatedAdmin: false
};
const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { for (const close of cleanups.splice(0)) await close(); });

function provider() {
  return {
    listUsers: vi.fn<WorkspaceAdminClient["listUsers"]>().mockResolvedValue(page([])),
    getUser: vi.fn<WorkspaceAdminClient["getUser"]>().mockResolvedValue(user),
    listGroups: vi.fn<WorkspaceAdminClient["listGroups"]>().mockResolvedValue(page([])),
    listGroupMembers: vi.fn<WorkspaceAdminClient["listGroupMembers"]>().mockResolvedValue(page([])),
    listActivities: vi.fn<WorkspaceAdminClient["listActivities"]>().mockResolvedValue(page([]))
  };
}

function page<T>(items: T[], nextPageToken?: string) {
  return { items, resultCount: items.length, complete: !nextPageToken, nextPageToken };
}

describe.each(["2025-11-25", "2026-07-28"] as const)("MCP stdio %s", (version) => {
  it("negotiates, hides inventory under risk, and denies direct calls", async () => {
    const api = provider();
    const wire = await connect(version, api);
    const listing = await wire.request("tools/list");
    expect(listing.result?.tools?.map((tool) => tool.name)).toEqual(["workspace_privileged_user_review"]);
    const denied = await wire.call("workspace_users_list", {});
    expect(denied.error?.code).toBe(-32602);
    expect(api.listUsers).not.toHaveBeenCalled();
  });

  it("rechecks invocation policy after a tool has been registered", async () => {
    const api = provider();
    const policy = resolveToolPolicy({ profile: "inventory" });
    const wire = await connect(version, api, policy);
    policy.allowedTools = [];
    const reply = await wire.call("workspace_user_get", { userKey: user.primaryEmail });
    expect(reply.result?.isError).toBe(true);
    expect(api.getUser).not.toHaveBeenCalled();
  });

  it.each(["all", " ALL "])("rejects aggregate actor %s before any provider call", async (userKey) => {
    const api = provider();
    const wire = await connect(version, api, resolveToolPolicy({ profile: "full-readonly" }));
    for (const tool of ["workspace_admin_activity_search", "workspace_privileged_user_review"]) {
      const reply = await wire.call(tool, { userKey, ...window });
      expect(reply.result?.isError).toBe(true);
    }
    for (const fn of Object.values(api)) expect(fn).not.toHaveBeenCalled();
  });

  it("rejects excessive audit windows and invalid continuation tokens", async () => {
    const api = provider();
    const wire = await connect(version, api, resolveToolPolicy({ profile: "full-readonly" }));
    const audit = await wire.call("workspace_admin_activity_search", {
      userKey: user.primaryEmail, ...window, endTime: "2026-10-01T00:00:00.000Z"
    });
    expect(audit.result?.isError).toBe(true);
    for (const field of ["membershipPageToken", "activityPageToken"]) {
      const review = await wire.call("workspace_privileged_user_review", {
        userKey: user.primaryEmail, ...window, [field]: "x".repeat(2049)
      });
      expect(review.result?.isError).toBe(true);
    }
    for (const fn of Object.values(api)) expect(fn).not.toHaveBeenCalled();
  });

  it("continues independent evidence pages without exposing inventory", async () => {
    const api = provider();
    api.listGroups.mockResolvedValueOnce(page([{ id: "g1", email: "g1@example.com" }], "groups-next"))
      .mockResolvedValueOnce(page([{ id: "g2", email: "g2@example.com" }]));
    api.listActivities.mockResolvedValueOnce(page([{ id: "a1", events: [] }], "audit-next"))
      .mockResolvedValueOnce(page([{ id: "a2", events: [] }]));
    const wire = await connect(version, api);
    const first = await wire.call("workspace_privileged_user_review", { userKey: user.primaryEmail, ...window });
    expect(first.result?.isError).not.toBe(true);
    expect(first.result?.structuredContent).toMatchObject({ review: {
      memberships: { nextPageToken: "groups-next", complete: false },
      recentAdminActivity: { nextPageToken: "audit-next", complete: false }
    } });
    const second = await wire.call("workspace_privileged_user_review", {
      userKey: user.primaryEmail, ...window, membershipPageToken: "groups-next", activityPageToken: "audit-next"
    });
    expect(api.listGroups).toHaveBeenLastCalledWith({ userKey: user.primaryEmail, maxResults: 100, pageToken: "groups-next" });
    expect(api.listActivities).toHaveBeenLastCalledWith({ userKey: user.primaryEmail, ...window, maxResults: 50, pageToken: "audit-next" });
    expect(second.result?.structuredContent).toMatchObject({ review: {
      memberships: { items: [{ id: "g2" }], complete: true },
      recentAdminActivity: { items: [{ id: "a2" }], complete: true }
    } });
    if (version === "2025-11-25") {
      expect(JSON.parse(second.result!.content![0].text!)).toEqual(second.result?.structuredContent);
    }
  });

  it("keeps audit actor semantics and strips parameters by default", async () => {
    const api = provider();
    api.listActivities.mockResolvedValue(page([{
      id: "a1", actorEmail: user.primaryEmail, events: [{ name: "CHANGE_USER", resourceIds: ["other-user"],
        parameters: [{ name: "USER_EMAIL", valueKind: "string", values: ["other@example.com"] }] }]
    }]));
    const wire = await connect(version, api, resolveToolPolicy({ profile: "audit" }));
    const reply = await wire.call("workspace_admin_activity_search", { userKey: user.primaryEmail, ...window });
    expect(api.listActivities).toHaveBeenCalledWith(expect.objectContaining({ userKey: user.primaryEmail }));
    expect(reply.result?.structuredContent).toMatchObject({ activities: { items: [{ actorEmail: user.primaryEmail }] } });
    expect(JSON.stringify(reply)).not.toContain("other@example.com");
  });

  it.each(["provider error", "non-error rejection", "malformed output"])("sanitizes %s and correlates a safe log", async (failure) => {
    const api = provider();
    const marker = "private-diagnostic@example.com";
    if (failure === "provider error") api.getUser.mockRejectedValue(new Error(marker));
    else if (failure === "non-error rejection") api.getUser.mockRejectedValue(marker);
    else api.getUser.mockResolvedValue({ ...user, isAdmin: marker } as unknown as typeof user);
    const wire = await connect(version, api, resolveToolPolicy({ profile: "inventory" }));
    const reply = await wire.call("workspace_user_get", { userKey: user.primaryEmail });
    expect(reply.result?.isError).toBe(true);
    expect(JSON.stringify(reply)).toContain("WORKSPACE_TOOL_FAILED");
    expect(JSON.stringify(reply)).not.toContain(marker);
    expect(wire.logger.error).toHaveBeenCalledWith("tool_failed", expect.objectContaining({
      tool: "workspace_user_get", code: "WORKSPACE_TOOL_FAILED", operationId: expect.any(String)
    }));
    const fields = wire.logger.error.mock.calls[0][1];
    expect(JSON.stringify(reply)).toContain(fields!.operationId);
    expect(JSON.stringify(wire.logger.error.mock.calls)).not.toContain(marker);
  });
});

interface RpcResponse {
  id: number;
  error?: { code: number; message: string };
  result?: {
    protocolVersion?: string;
    tools?: Array<{ name: string }>;
    content?: Array<{ type: string; text?: string }>;
    structuredContent?: Record<string, unknown>;
    isError?: boolean;
  };
}

// Real JSON-RPC framing and SDK dispatch over streams, without credentials or a child process.
async function connect(version: string, api: WorkspaceAdminClient, policy = resolveToolPolicy({})) {
  const input = new PassThrough();
  const output = new PassThrough();
  const lines = createInterface({ input: output });
  const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const pending = new Map<number, { resolve: (reply: RpcResponse) => void; reject: (error: Error) => void; timer: NodeJS.Timeout }>();
  const handle = serveStdio(() => createMcpServer(api, logger, policy), {
    transport: new StdioServerTransport(input, output)
  });
  lines.on("line", (line) => {
    const reply: RpcResponse = JSON.parse(line);
    const entry = pending.get(reply.id);
    if (entry) { clearTimeout(entry.timer); pending.delete(reply.id); entry.resolve(reply); }
  });
  cleanups.push(async () => {
    await handle.close();
    lines.close(); input.destroy(); output.destroy();
    for (const entry of pending.values()) { clearTimeout(entry.timer); entry.reject(new Error("Wire closed")); }
    pending.clear();
  });
  let id = 0;
  function request(method: string, params: Record<string, unknown> = {}): Promise<RpcResponse> {
    const requestId = ++id;
    const meta = version === "2026-07-28" ? { _meta: {
      [PROTOCOL_VERSION_META_KEY]: version,
      [CLIENT_INFO_META_KEY]: { name: "wire-tests", version: "1.0.0" },
      [CLIENT_CAPABILITIES_META_KEY]: {}
    } } : {};
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { pending.delete(requestId); reject(new Error(`Wire timeout: ${method}`)); }, 3000);
      pending.set(requestId, { resolve, reject, timer });
      input.write(JSON.stringify({ jsonrpc: "2.0", id: requestId, method, params: { ...params, ...meta } }) + "\n");
    });
  }
  if (version === "2025-11-25") {
    const opening = await request("initialize", { protocolVersion: version, capabilities: {}, clientInfo: { name: "wire-tests", version: "1.0.0" } });
    expect(opening.result?.protocolVersion).toBe(version);
    input.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");
  } else {
    const opening = await request("server/discover");
    expect(opening.error).toBeUndefined();
    expect(opening.result).toBeDefined();
  }
  return { request, logger, call: (name: string, args: Record<string, unknown>) => request("tools/call", { name, arguments: args }) };
}
