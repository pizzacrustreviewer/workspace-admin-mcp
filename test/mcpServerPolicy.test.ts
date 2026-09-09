import { describe, expect, it } from "vitest";
import { createLogger } from "../src/logger.js";
import { createMcpServer } from "../src/mcpServer.js";
import { resolveToolPolicy } from "../src/security/toolPolicy.js";
import { WorkspaceAdminClient } from "../src/workspace/types.js";

const client: WorkspaceAdminClient = {
  listUsers: async () => emptyPage(),
  getUser: async () => ({
    id: "user-1",
    primaryEmail: "user@example.com",
    suspended: false,
    archived: false,
    isAdmin: false,
    isDelegatedAdmin: false
  }),
  listGroups: async () => emptyPage(),
  listGroupMembers: async () => emptyPage(),
  listActivities: async () => emptyPage()
};

describe("createMcpServer policy gating", () => {
  it("registers only the risk tool by default", () => {
    const server = createMcpServer(client, createLogger("error"), resolveToolPolicy({}));

    expect(registeredToolNames(server)).toEqual(["workspace_privileged_user_review"]);
  });

  it("registers only inventory tools for the inventory profile", () => {
    const server = createMcpServer(
      client,
      createLogger("error"),
      resolveToolPolicy({ profile: "inventory" })
    );

    expect(registeredToolNames(server)).toEqual([
      "workspace_users_list",
      "workspace_user_get",
      "workspace_groups_list",
      "workspace_group_members_list",
      "workspace_user_memberships_list"
    ]);
  });

  it("returns output in both text and structured form", async () => {
    const server = createMcpServer(
      client,
      createLogger("error"),
      resolveToolPolicy({ profile: "inventory", allowedTools: ["workspace_user_get"] })
    );
    const result = await registeredToolHandler(server, "workspace_user_get")(
      { userKey: "user@example.com" },
      { mcpReq: {} }
    );

    expect(result).toMatchObject({
      content: [{ type: "text" }],
      structuredContent: { user: { id: "user-1", primaryEmail: "user@example.com" } }
    });
  });

});

function emptyPage<T>() {
  return { items: [] as T[], resultCount: 0, complete: true };
}

function registeredToolNames(server: unknown): string[] {
  const registeredTools = (server as { _registeredTools?: Record<string, unknown> })._registeredTools;
  return Object.keys(registeredTools ?? {});
}

function registeredToolHandler(
  server: unknown,
  name: string
): (input: unknown, context: unknown) => Promise<unknown> {
  const registeredTools = (server as {
    _registeredTools: Record<string, { handler: (input: unknown, context: unknown) => Promise<unknown> }>;
  })._registeredTools;

  return registeredTools[name].handler;
}
