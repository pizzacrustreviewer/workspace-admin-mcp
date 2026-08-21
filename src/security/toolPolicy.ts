import * as z from "zod/v4";

export const TOOL_SCOPES = {
  workspaceUsersRead: "workspace.users.read",
  workspaceGroupsRead: "workspace.groups.read",
  workspaceAuditRead: "workspace.audit.read"
} as const;

export type ToolScope = (typeof TOOL_SCOPES)[keyof typeof TOOL_SCOPES];

export const GOOGLE_SCOPE_BY_TOOL_SCOPE: Record<ToolScope, string> = {
  [TOOL_SCOPES.workspaceUsersRead]: "https://www.googleapis.com/auth/admin.directory.user.readonly",
  [TOOL_SCOPES.workspaceGroupsRead]: "https://www.googleapis.com/auth/admin.directory.group.readonly",
  [TOOL_SCOPES.workspaceAuditRead]: "https://www.googleapis.com/auth/admin.reports.audit.readonly"
};

export const SECURITY_PROFILES = ["inventory", "audit", "risk", "full-readonly"] as const;

export type SecurityProfile = (typeof SECURITY_PROFILES)[number];

export const TOOL_NAMES = [
  "workspace_users_list",
  "workspace_groups_list",
  "workspace_admin_activity_search",
  "workspace_risk_snapshot"
] as const;

export type ToolName = (typeof TOOL_NAMES)[number];

export interface ToolPermission {
  name: ToolName;
  title: string;
  requiredScopes: ToolScope[];
  risk: "low" | "medium";
  profiles: SecurityProfile[];
  readsUntrustedWorkspaceData: boolean;
}

export const TOOL_PERMISSIONS: Record<ToolName, ToolPermission> = {
  workspace_users_list: {
    name: "workspace_users_list",
    title: "List Workspace Users",
    requiredScopes: [TOOL_SCOPES.workspaceUsersRead],
    risk: "low",
    profiles: ["inventory", "full-readonly"],
    readsUntrustedWorkspaceData: true
  },
  workspace_groups_list: {
    name: "workspace_groups_list",
    title: "List Workspace Groups",
    requiredScopes: [TOOL_SCOPES.workspaceGroupsRead],
    risk: "low",
    profiles: ["inventory", "full-readonly"],
    readsUntrustedWorkspaceData: true
  },
  workspace_admin_activity_search: {
    name: "workspace_admin_activity_search",
    title: "Search Admin Audit Activity",
    requiredScopes: [TOOL_SCOPES.workspaceAuditRead],
    risk: "medium",
    profiles: ["audit", "full-readonly"],
    readsUntrustedWorkspaceData: true
  },
  workspace_risk_snapshot: {
    name: "workspace_risk_snapshot",
    title: "Build Admin Risk Snapshot",
    requiredScopes: [
      TOOL_SCOPES.workspaceUsersRead,
      TOOL_SCOPES.workspaceGroupsRead,
      TOOL_SCOPES.workspaceAuditRead
    ],
    risk: "medium",
    profiles: ["risk", "full-readonly"],
    readsUntrustedWorkspaceData: true
  }
};

export interface ToolPolicy {
  profile: SecurityProfile;
  allowedTools: ToolName[];
  grantedScopes: ToolScope[];
}

export const SecurityProfileSchema = z.enum(SECURITY_PROFILES);
export const ToolNameSchema = z.enum(TOOL_NAMES);
export const ToolScopeSchema = z.enum(Object.values(TOOL_SCOPES) as [ToolScope, ...ToolScope[]]);

export function resolveToolPolicy(input: {
  profile?: SecurityProfile;
  allowedTools?: ToolName[];
  grantedScopes?: ToolScope[];
}): ToolPolicy {
  const profile = input.profile ?? "risk";
  const profileAllowedTools = TOOL_NAMES.filter((toolName) =>
    TOOL_PERMISSIONS[toolName].profiles.includes(profile)
  );
  const configuredAllowedTools = input.allowedTools ?? profileAllowedTools;
  const allowedTools = configuredAllowedTools.filter((toolName) => profileAllowedTools.includes(toolName));
  const requiredScopesForAllowedTools = unique(
    allowedTools.flatMap((toolName) => TOOL_PERMISSIONS[toolName].requiredScopes)
  );
  const configuredScopes = input.grantedScopes ?? requiredScopesForAllowedTools;
  const exposedTools = allowedTools.filter((toolName) => hasRequiredScopes(toolName, configuredScopes));
  const grantedScopes = unique(
    exposedTools.flatMap((toolName) => TOOL_PERMISSIONS[toolName].requiredScopes)
  );

  return {
    profile,
    allowedTools: exposedTools,
    grantedScopes
  };
}

export function canExposeTool(policy: ToolPolicy, toolName: ToolName): boolean {
  return policy.allowedTools.includes(toolName) && hasRequiredScopes(toolName, policy.grantedScopes);
}

export function toGoogleScopes(toolScopes: ToolScope[]): string[] {
  return unique(toolScopes.map((scope) => GOOGLE_SCOPE_BY_TOOL_SCOPE[scope]));
}

export function parseToolNames(value: string | undefined): ToolName[] | undefined {
  return parseCsv(value, TOOL_NAMES);
}

export function parseToolScopes(value: string | undefined): ToolScope[] | undefined {
  return parseCsv(value, Object.values(TOOL_SCOPES));
}

function hasRequiredScopes(toolName: ToolName, grantedScopes: ToolScope[]): boolean {
  return TOOL_PERMISSIONS[toolName].requiredScopes.every((scope) => grantedScopes.includes(scope));
}

function parseCsv<const T extends string>(value: string | undefined, allowed: readonly T[]): T[] | undefined {
  if (!value?.trim()) {
    return undefined;
  }

  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item): item is T => allowed.includes(item as T));
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}
