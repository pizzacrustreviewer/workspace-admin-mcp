import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/server";
import type { ToolAnnotations } from "@modelcontextprotocol/server";
import { SpanKind } from "@opentelemetry/api";
import * as z from "zod/v4";
import { Logger } from "./logger.js";
import { canExposeTool, ToolName, ToolPolicy, TOOL_PERMISSIONS } from "./security/toolPolicy.js";
import { mcpParentContext, withSpan } from "./telemetry.js";
import { buildPrivilegedUserReview } from "./workspace/privilegedUserReview.js";
import {
  ResultPage,
  WorkspaceActivity,
  WorkspaceAdminClient
} from "./workspace/types.js";

const MaxResultsSchema = z.number().int().min(1).max(200).default(50);
const PageTokenSchema = z.string().min(1).max(2048).optional();
const ResourceKeySchema = z.string().trim().min(1).max(320).regex(/^[^\r\n]+$/);
const AuditActorSchema = ResourceKeySchema.refine((key) => key.toLowerCase() !== "all", {
  message: "An individual audit actor is required; all is not permitted"
});

const UsersListInput = z.object({
  maxResults: MaxResultsSchema,
  query: z.string().min(1).max(500).optional(),
  pageToken: PageTokenSchema
});

const UserGetInput = z.object({ userKey: ResourceKeySchema });

const GroupsListInput = z.object({
  maxResults: MaxResultsSchema,
  query: z.string().min(1).max(500).optional(),
  pageToken: PageTokenSchema
});

const GroupMembersListInput = z.object({
  groupKey: ResourceKeySchema,
  maxResults: MaxResultsSchema,
  pageToken: PageTokenSchema
});

const UserMembershipsListInput = z.object({
  userKey: ResourceKeySchema,
  maxResults: MaxResultsSchema,
  pageToken: PageTokenSchema
});

const ActivitySearchInput = z
  .object({
    userKey: AuditActorSchema,
    maxResults: z.number().int().min(1).max(100).default(25),
    eventName: z.string().regex(/^[A-Za-z0-9_]+$/).max(120).optional(),
    startTime: z.iso.datetime(),
    endTime: z.iso.datetime(),
    pageToken: PageTokenSchema,
    includeParameters: z.boolean().default(false)
  })
  .superRefine(validateActivityWindow);

const PrivilegedUserReviewInput = z
  .object({
    userKey: AuditActorSchema,
    membershipLimit: z.number().int().min(1).max(200).default(100),
    activityLimit: z.number().int().min(1).max(100).default(50),
    membershipPageToken: PageTokenSchema,
    activityPageToken: PageTokenSchema,
    startTime: z.iso.datetime(),
    endTime: z.iso.datetime()
  })
  .superRefine(validateActivityWindow);

const WorkspaceUserSchema = z.object({
  id: z.string(),
  primaryEmail: z.string(),
  fullName: z.string().optional(),
  suspended: z.boolean(),
  archived: z.boolean(),
  isAdmin: z.boolean(),
  isDelegatedAdmin: z.boolean(),
  lastLoginTime: z.string().optional(),
  orgUnitPath: z.string().optional()
});

const WorkspaceGroupSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string().optional(),
  directMembersCount: z.string().optional(),
  adminCreated: z.boolean().optional()
});

const WorkspaceGroupMemberSchema = z.object({
  id: z.string(),
  email: z.string().optional(),
  role: z.string().optional(),
  status: z.string().optional(),
  type: z.string().optional()
});

const WorkspaceActivityParameterSchema = z.object({
  name: z.string(),
  valueKind: z.enum([
    "string",
    "integer",
    "boolean",
    "strings",
    "integers",
    "message",
    "messages",
    "unknown"
  ]),
  values: z.array(z.string())
});

const WorkspaceActivityEventSchema = z.object({
  name: z.string().optional(),
  type: z.string().optional(),
  resourceIds: z.array(z.string()),
  parameters: z.array(WorkspaceActivityParameterSchema).optional(),
  status: z
    .object({
      eventStatus: z.string().optional(),
      errorCode: z.string().optional(),
      httpStatusCode: z.number().int().optional()
    })
    .optional()
});

const WorkspaceActivitySchema = z.object({
  id: z.string().optional(),
  time: z.string().optional(),
  applicationName: z.string().optional(),
  actorEmail: z.string().optional(),
  events: z.array(WorkspaceActivityEventSchema)
});

const UsersListOutput = z.object({ users: resultPageSchema(WorkspaceUserSchema) });
const UserGetOutput = z.object({ user: WorkspaceUserSchema });
const GroupsListOutput = z.object({ groups: resultPageSchema(WorkspaceGroupSchema) });
const GroupMembersListOutput = z.object({ members: resultPageSchema(WorkspaceGroupMemberSchema) });
const ActivitySearchOutput = z.object({ activities: resultPageSchema(WorkspaceActivitySchema) });
const PrivilegedUserReviewOutput = z.object({
  review: z.object({
    generatedAt: z.string(),
    subject: WorkspaceUserSchema,
    privilege: z.object({
      isAdmin: z.boolean(),
      isDelegatedAdmin: z.boolean()
    }),
    memberships: resultPageSchema(WorkspaceGroupSchema),
    recentAdminActivity: resultPageSchema(WorkspaceActivitySchema),
    findings: z.array(
      z.object({
        severity: z.literal("high"),
        title: z.string(),
        evidence: z.object({
          userId: z.string(),
          suspended: z.boolean(),
          archived: z.boolean()
        })
      })
    )
  })
});

export function createMcpServer(
  client: WorkspaceAdminClient,
  logger: Logger,
  policy: ToolPolicy
): McpServer {
  const server = new McpServer({
    name: "google-workspace-admin",
    version: "0.2.0"
  });

  if (toolCanBeRegistered(policy, logger, "workspace_users_list")) {
    server.registerTool(
      "workspace_users_list",
      toolConfig(
        "workspace_users_list",
        "List Google Workspace users using bounded pages and safe profile fields.",
        UsersListInput,
        UsersListOutput
      ),
      async (input, ctx) =>
        withToolSpan("workspace_users_list", policy, logger, ctx.mcpReq._meta, async (span) => {
          await assertToolAllowed(policy, logger, "workspace_users_list");
          const args = UsersListInput.parse(input);
          logger.info("tool_called", {
            tool: "workspace_users_list",
            maxResults: args.maxResults,
            hasQuery: Boolean(args.query),
            hasPageToken: Boolean(args.pageToken)
          });
          const users = await client.listUsers(args);
          recordPageResult(span, users);
          return jsonResponse(UsersListOutput, { users });
        })
    );
  }

  if (toolCanBeRegistered(policy, logger, "workspace_user_get")) {
    server.registerTool(
      "workspace_user_get",
      toolConfig(
        "workspace_user_get",
        "Retrieve one Google Workspace user by email, alias, or immutable ID.",
        UserGetInput,
        UserGetOutput
      ),
      async (input, ctx) =>
        withToolSpan("workspace_user_get", policy, logger, ctx.mcpReq._meta, async () => {
          await assertToolAllowed(policy, logger, "workspace_user_get");
          const args = UserGetInput.parse(input);
          logger.info("tool_called", { tool: "workspace_user_get" });
          const user = await client.getUser(args.userKey);
          return jsonResponse(UserGetOutput, { user });
        })
    );
  }

  if (toolCanBeRegistered(policy, logger, "workspace_groups_list")) {
    server.registerTool(
      "workspace_groups_list",
      toolConfig(
        "workspace_groups_list",
        "List Google Workspace groups using bounded pages and basic metadata.",
        GroupsListInput,
        GroupsListOutput
      ),
      async (input, ctx) =>
        withToolSpan("workspace_groups_list", policy, logger, ctx.mcpReq._meta, async (span) => {
          await assertToolAllowed(policy, logger, "workspace_groups_list");
          const args = GroupsListInput.parse(input);
          logger.info("tool_called", {
            tool: "workspace_groups_list",
            maxResults: args.maxResults,
            hasQuery: Boolean(args.query),
            hasPageToken: Boolean(args.pageToken)
          });
          const groups = await client.listGroups(args);
          recordPageResult(span, groups);
          return jsonResponse(GroupsListOutput, { groups });
        })
    );
  }

  if (toolCanBeRegistered(policy, logger, "workspace_group_members_list")) {
    server.registerTool(
      "workspace_group_members_list",
      toolConfig(
        "workspace_group_members_list",
        "List direct members of one Workspace group using a dedicated member-read scope.",
        GroupMembersListInput,
        GroupMembersListOutput
      ),
      async (input, ctx) =>
        withToolSpan("workspace_group_members_list", policy, logger, ctx.mcpReq._meta, async (span) => {
          await assertToolAllowed(policy, logger, "workspace_group_members_list");
          const args = GroupMembersListInput.parse(input);
          logger.info("tool_called", {
            tool: "workspace_group_members_list",
            maxResults: args.maxResults,
            hasPageToken: Boolean(args.pageToken)
          });
          const members = await client.listGroupMembers(args);
          recordPageResult(span, members);
          return jsonResponse(GroupMembersListOutput, { members });
        })
    );
  }

  if (toolCanBeRegistered(policy, logger, "workspace_user_memberships_list")) {
    server.registerTool(
      "workspace_user_memberships_list",
      toolConfig(
        "workspace_user_memberships_list",
        "List groups that contain one Workspace user.",
        UserMembershipsListInput,
        GroupsListOutput
      ),
      async (input, ctx) =>
        withToolSpan("workspace_user_memberships_list", policy, logger, ctx.mcpReq._meta, async (span) => {
          await assertToolAllowed(policy, logger, "workspace_user_memberships_list");
          const args = UserMembershipsListInput.parse(input);
          logger.info("tool_called", {
            tool: "workspace_user_memberships_list",
            maxResults: args.maxResults,
            hasPageToken: Boolean(args.pageToken)
          });
          const groups = await client.listGroups({
            userKey: args.userKey,
            maxResults: args.maxResults,
            pageToken: args.pageToken
          });
          recordPageResult(span, groups);
          return jsonResponse(GroupsListOutput, { groups });
        })
    );
  }

  if (toolCanBeRegistered(policy, logger, "workspace_admin_activity_search")) {
    server.registerTool(
      "workspace_admin_activity_search",
      toolConfig(
        "workspace_admin_activity_search",
        "Search Admin actions performed by one user, not actions targeting that user. Event parameters are excluded by default.",
        ActivitySearchInput,
        ActivitySearchOutput
      ),
      async (input, ctx) =>
        withToolSpan("workspace_admin_activity_search", policy, logger, ctx.mcpReq._meta, async (span) => {
          await assertToolAllowed(policy, logger, "workspace_admin_activity_search");
          const args = ActivitySearchInput.parse(input);
          logger.info("tool_called", {
            tool: "workspace_admin_activity_search",
            maxResults: args.maxResults,
            hasEventFilter: Boolean(args.eventName),
            hasPageToken: Boolean(args.pageToken),
            includesParameters: args.includeParameters
          });
          const page = await client.listActivities(args);
          const activities = args.includeParameters ? page : withoutActivityParameters(page);
          recordPageResult(span, activities);
          return jsonResponse(ActivitySearchOutput, { activities });
        })
    );
  }

  if (toolCanBeRegistered(policy, logger, "workspace_privileged_user_review")) {
    server.registerTool(
      "workspace_privileged_user_review",
      toolConfig(
        "workspace_privileged_user_review",
        "Inspect one user's privilege state, memberships, and Admin actions performed by that user. Evidence pages can be continued independently.",
        PrivilegedUserReviewInput,
        PrivilegedUserReviewOutput
      ),
      async (input, ctx) =>
        withToolSpan("workspace_privileged_user_review", policy, logger, ctx.mcpReq._meta, async (span) => {
          await assertToolAllowed(policy, logger, "workspace_privileged_user_review");
          const args = PrivilegedUserReviewInput.parse(input);
          logger.info("tool_called", {
            tool: "workspace_privileged_user_review",
            membershipLimit: args.membershipLimit,
            activityLimit: args.activityLimit
          });
          const [user, memberships, activities] = await Promise.all([
            client.getUser(args.userKey),
            client.listGroups({
              userKey: args.userKey,
              maxResults: args.membershipLimit,
              pageToken: args.membershipPageToken
            }),
            client.listActivities({
              userKey: args.userKey,
              maxResults: args.activityLimit,
              startTime: args.startTime,
              endTime: args.endTime,
              pageToken: args.activityPageToken
            })
          ]);
          const review = buildPrivilegedUserReview({ user, memberships, activities });
          span.setAttribute("workspace.result.finding_count", review.findings.length);
          span.setAttribute("workspace.result.memberships_complete", memberships.complete);
          span.setAttribute("workspace.result.activity_complete", activities.complete);
          return jsonResponse(PrivilegedUserReviewOutput, { review });
        })
    );
  }

  return server;
}

function toolConfig<Input extends z.ZodType, Output extends z.ZodType>(
  name: ToolName,
  description: string,
  inputSchema: Input,
  outputSchema: Output
) {
  return {
    title: TOOL_PERMISSIONS[name].title,
    description,
    inputSchema,
    outputSchema,
    annotations: readOnlyAnnotations(name),
    _meta: toolMeta(name)
  };
}

function resultPageSchema<T extends z.ZodType>(itemSchema: T) {
  return z.object({
    items: z.array(itemSchema),
    resultCount: z.number().int().nonnegative(),
    nextPageToken: z.string().optional(),
    complete: z.boolean()
  });
}

function validateActivityWindow(
  input: { startTime: string; endTime: string },
  context: z.RefinementCtx
): void {
  const start = Date.parse(input.startTime);
  const end = Date.parse(input.endTime);
  const maximumWindowMs = 31 * 24 * 60 * 60 * 1000;

  if (start >= end) {
    context.addIssue({
      code: "custom",
      path: ["endTime"],
      message: "endTime must be after startTime"
    });
  } else if (end - start > maximumWindowMs) {
    context.addIssue({
      code: "custom",
      path: ["endTime"],
      message: "activity search windows cannot exceed 31 days"
    });
  }
}

function withoutActivityParameters(
  page: ResultPage<WorkspaceActivity>
): ResultPage<WorkspaceActivity> {
  return {
    ...page,
    items: page.items.map((activity) => ({
      ...activity,
      events: activity.events.map(({ parameters: _parameters, ...event }) => event)
    }))
  };
}

function recordPageResult(
  span: { setAttribute(name: string, value: string | number | boolean): unknown },
  page: { resultCount: number; complete: boolean }
): void {
  span.setAttribute("workspace.result.count", page.resultCount);
  span.setAttribute("workspace.result.complete", page.complete);
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
  logger: Logger,
  meta: Parameters<typeof mcpParentContext>[0],
  operation: Parameters<typeof withSpan<T>>[2]
): Promise<T> {
  return withSpan(
    `tools/call ${name}`,
    {
      kind: SpanKind.SERVER,
      parentContext: mcpParentContext(meta),
      attributes: {
        "mcp.method.name": "tools/call",
        "mcp.tool.name": name,
        "mcp.tool.read_only": true,
        "policy.profile": policy.profile
      }
    },
    async (span) => {
      try {
        return await operation(span);
      } catch {
        const operationId = randomUUID();
        const code = "WORKSPACE_TOOL_FAILED";
        span.setAttribute("workspace.operation.id", operationId);
        logger.error("tool_failed", { tool: name, code, operationId });
        // The SDK returns thrown messages to callers. Never attach the original cause.
        throw new Error(`${code}: Request could not be completed. Reference: ${operationId}`);
      }
    }
  );
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

function jsonResponse<T extends Record<string, unknown>>(schema: z.ZodType<T>, data: T) {
  // Validate inside the sanitized failure boundary, before the SDK's own validation.
  const validated = schema.parse(data);
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(validated, null, 2)
      }
    ],
    structuredContent: validated
  };
}
