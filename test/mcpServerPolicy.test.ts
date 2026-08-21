import { describe, expect, it } from "vitest";
import { createLogger } from "../src/logger.js";
import { createMcpServer } from "../src/mcpServer.js";
import { resolveToolPolicy } from "../src/security/toolPolicy.js";
import { WorkspaceAdminClient } from "../src/workspace/types.js";

const client: WorkspaceAdminClient = {
  listUsers: async () => [],
  listGroups: async () => [],
  listActivities: async () => []
};

describe("createMcpServer policy gating", () => {
  it("registers only the risk tool by default", () => {
    const server = createMcpServer(client, createLogger("error"), resolveToolPolicy({}));

    expect(registeredToolNames(server)).toEqual(["workspace_risk_snapshot"]);
  });

  it("registers only inventory tools for the inventory profile", () => {
    const server = createMcpServer(
      client,
      createLogger("error"),
      resolveToolPolicy({ profile: "inventory" })
    );

    expect(registeredToolNames(server)).toEqual(["workspace_users_list", "workspace_groups_list"]);
  });
});

function registeredToolNames(server: unknown): string[] {
  const registeredTools = (server as { _registeredTools?: Record<string, unknown> })._registeredTools;
  return Object.keys(registeredTools ?? {});
}
