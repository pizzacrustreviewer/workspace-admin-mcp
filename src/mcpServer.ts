import { McpServer } from "@modelcontextprotocol/server";
import type { ToolAnnotations } from "@modelcontextprotocol/server";
import { SpanKind } from "@opentelemetry/api";
import * as z from "zod/v4";
import { Logger } from "./logger.js";
import { canExposeTool, ToolName, ToolPolicy, TOOL_PERMISSIONS } from "./security/toolPolicy.js";
import { mcpParentContext, withSpan } from "./telemetry.js";
import { buildRiskSnapshot } from "./workspace/riskSnapshot.js";
import { WorkspaceAdminClient } from "./workspace/types.js";

const MaxResultsSchema = z.number().int().min(1).max(200).default(50);

const UsersListInput = z.object({
  maxResults: MaxResultsSchema,
  query: z.string().min(1).max(500).optional()
});

const GroupsListInput = z.object({
  maxResults: MaxResultsSchema,
  query: z.string().min(1).max(500).optional()
});

const ActivitySearchInput = z.object({
  applicationName: z.string().min(1).max(80).default("admin"),
  maxResults: z.number().int().min(1).max(100).default(25),
  eventName: z.string().min(1).max(120).optional(),
  startTime: z.iso.datetime().optional(),
  endTime: z.iso.datetime().optional()
});

const RiskSnapshotInput = z.object({
  userLimit: z.number().int().min(1).max(200).default(100),
  groupLimit: z.number().int().min(1).max(200).default(100),
  activityLimit: z.number().int().min(1).max(100).default(50)
});

export function createMcpServer(
  client: WorkspaceAdminClient,
  logger: Logger,
  policy: ToolPolicy
): McpServer {
  const server = new McpServer({
    name: "google-workspace-admin",
    version: "0.1.0"
  });

  if (toolCanBeRegistered(policy, logger, "workspace_users_list")) {
    server.registerTool(
      "workspace_users_list",
      {
        title: TOOL_PERMISSIONS.workspace_users_list.title,
        description: "List Google Workspace users with safe, basic profile fields.",
        inputSchema: UsersListInput,
        annotations: readOnlyAnnotations("workspace_users_list"),
        _meta: toolMeta("workspace_users_list")
      },
      async (input, ctx) => {
        return withToolSpan("workspace_users_list", policy, ctx.mcpReq._meta, async (span) => {
          await assertToolAllowed(policy, logger, "workspace_users_list");
          const args = UsersListInput.parse(input);
          logger.info("tool_called", {
            tool: "workspace_users_list",
            maxResults: args.maxResults,
            hasQuery: Boolean(args.query)
          });
          const users = await client.listUsers(args);
          span.setAttribute("workspace.result.count", users.length);

          return jsonResponse({ users });
        });
      }
    );
  }

  if (toolCanBeRegistered(policy, logger, "workspace_groups_list")) {
    server.registerTool(
      "workspace_groups_list",
      {
        title: TOOL_PERMISSIONS.workspace_groups_list.title,
        description: "List Google Workspace groups with basic metadata.",
        inputSchema: GroupsListInput,
        annotations: readOnlyAnnotations("workspace_groups_list"),
        _meta: toolMeta("workspace_groups_list")
      },
      async (input, ctx) => {
        return withToolSpan("workspace_groups_list", policy, ctx.mcpReq._meta, async (span) => {
          await assertToolAllowed(policy, logger, "workspace_groups_list");
          const args = GroupsListInput.parse(input);
          logger.info("tool_called", {
            tool: "workspace_groups_list",
            maxResults: args.maxResults,
            hasQuery: Boolean(args.query)
          });
          const groups = await client.listGroups(args);
          span.setAttribute("workspace.result.count", groups.length);

          return jsonResponse({ groups });
        });
      }
    );
  }

  if (toolCanBeRegistered(policy, logger, "workspace_admin_activity_search")) {
    server.registerTool(
      "workspace_admin_activity_search",
      {
        title: TOOL_PERMISSIONS.workspace_admin_activity_search.title,
        description: "Search recent Google Workspace Admin SDK audit activity.",
        inputSchema: ActivitySearchInput,
        annotations: readOnlyAnnotations("workspace_admin_activity_search"),
        _meta: toolMeta("workspace_admin_activity_search")
      },
      async (input, ctx) => {
        return withToolSpan(
          "workspace_admin_activity_search",
          policy,
          ctx.mcpReq._meta,
          async (span) => {
            await assertToolAllowed(policy, logger, "workspace_admin_activity_search");
            const args = ActivitySearchInput.parse(input);
            logger.info("tool_called", {
              tool: "workspace_admin_activity_search",
              applicationName: args.applicationName,
              maxResults: args.maxResults,
              hasEventFilter: Boolean(args.eventName),
              hasTimeRange: Boolean(args.startTime || args.endTime)
            });
            const activities = await client.listActivities(args);
            span.setAttribute("workspace.result.count", activities.length);

            return jsonResponse({ activities });
          }
        );
      }
    );
  }

  if (toolCanBeRegistered(policy, logger, "workspace_risk_snapshot")) {
    server.registerTool(
      "workspace_risk_snapshot",
      {
        title: TOOL_PERMISSIONS.workspace_risk_snapshot.title,
        description: "Return a deterministic Google Workspace admin risk snapshot for triage.",
        inputSchema: RiskSnapshotInput,
        annotations: readOnlyAnnotations("workspace_risk_snapshot"),
        _meta: toolMeta("workspace_risk_snapshot")
      },
      async (input, ctx) => {
        return withToolSpan("workspace_risk_snapshot", policy, ctx.mcpReq._meta, async (span) => {
          await assertToolAllowed(policy, logger, "workspace_risk_snapshot");
          const args = RiskSnapshotInput.parse(input);
          logger.info("tool_called", { tool: "workspace_risk_snapshot", ...args });
          const [users, groups, activities] = await Promise.all([
            client.listUsers({ maxResults: args.userLimit }),
            client.listGroups({ maxResults: args.groupLimit }),
            client.listActivities({ applicationName: "admin", maxResults: args.activityLimit })
          ]);
          const snapshot = buildRiskSnapshot({ users, groups, activities });
          span.setAttribute("workspace.result.finding_count", snapshot.findings.length);

          return jsonResponse({ snapshot });
        });
      }
    );
  }

  return server;
}

function toolCanBeRegistered(policy: ToolPolicy, logger: Logger, name: ToolName): boolean {
  if (!canExposeTool(policy, name)) {
    logger.info("tool_hidden", {
      tool: name,
      securityProfile: policy.profile,
      requiredScopes: TOOL_PERMISSIONS[name].requiredScopes
    });
    return false;
  }

  return true;
}

async function assertToolAllowed(policy: ToolPolicy, logger: Logger, name: ToolName): Promise<void> {
  await withSpan(
    "policy.evaluate",
    {
      attributes: {
        "policy.engine": "workspace-tool-policy",
        "policy.profile": policy.profile,
        "mcp.tool.name": name,
        "policy.required_scopes": TOOL_PERMISSIONS[name].requiredScopes
      }
    },
    async (span) => {
      const allowed = canExposeTool(policy, name);
      span.setAttribute("policy.decision", allowed ? "allow" : "deny");
      if (allowed) {
        return;
      }

      logger.warn("tool_denied", {
        tool: name,
        securityProfile: policy.profile,
        requiredScopes: TOOL_PERMISSIONS[name].requiredScopes
      });
      throw new Error(`Tool not permitted by server policy: ${name}`);
    }
  );
}

function withToolSpan<T>(
  name: ToolName,
  policy: ToolPolicy,
  meta: Parameters<typeof mcpParentContext>[0],
  operation: Parameters<typeof withSpan<T>>[2]
): Promise<T> {
  return withSpan(`tools/call ${name}`, {
    kind: SpanKind.SERVER,
    parentContext: mcpParentContext(meta),
    attributes: {
      "mcp.method.name": "tools/call",
      "mcp.tool.name": name,
      "mcp.tool.read_only": true,
      "policy.profile": policy.profile
    }
  }, operation);
}

function readOnlyAnnotations(name: ToolName): ToolAnnotations {
  return {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: TOOL_PERMISSIONS[name].readsUntrustedWorkspaceData
  };
}

function toolMeta(name: ToolName) {
  return {
    "com.anthony.workspace-admin/security-profile-risk": TOOL_PERMISSIONS[name].risk,
    "com.anthony.workspace-admin/required-scopes": TOOL_PERMISSIONS[name].requiredScopes,
    "com.anthony.workspace-admin/permission-boundary": "server-enforced"
  };
}

function jsonResponse(data: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(data, null, 2)
      }
    ]
  };
}
