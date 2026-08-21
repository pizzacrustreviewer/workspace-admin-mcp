import { WorkspaceActivity, WorkspaceGroup, WorkspaceUser } from "./types.js";

export interface RiskFinding {
  severity: "low" | "medium" | "high";
  title: string;
  evidence: Record<string, unknown>;
}

export interface RiskSnapshot {
  generatedAt: string;
  counts: {
    users: number;
    admins: number;
    delegatedAdmins: number;
    suspendedUsers: number;
    archivedUsers: number;
    groups: number;
    recentAdminEvents: number;
  };
  findings: RiskFinding[];
}

export function buildRiskSnapshot(input: {
  users: WorkspaceUser[];
  groups: WorkspaceGroup[];
  activities: WorkspaceActivity[];
  generatedAt?: string;
}): RiskSnapshot {
  const admins = input.users.filter((user) => user.isAdmin);
  const delegatedAdmins = input.users.filter((user) => user.isDelegatedAdmin);
  const suspendedAdmins = admins.filter((user) => user.suspended || user.archived);
  const externallyNamedGroups = input.groups.filter((group) =>
    /\b(external|public|shared|all)\b/i.test(`${group.email} ${group.name ?? ""}`)
  );
  const suspiciousEvents = input.activities.filter((activity) =>
    /privilege|role|admin|2sv|verification|token|password|sso/i.test(
      `${activity.eventName ?? ""} ${activity.eventType ?? ""}`
    )
  );

  const findings: RiskFinding[] = [];

  if (admins.length > 5) {
    findings.push({
      severity: "medium",
      title: "High admin count",
      evidence: { adminCount: admins.length }
    });
  }

  if (delegatedAdmins.length > 0) {
    findings.push({
      severity: "medium",
      title: "Delegated admins present",
      evidence: {
        delegatedAdminCount: delegatedAdmins.length,
        users: delegatedAdmins.map((user) => user.primaryEmail)
      }
    });
  }

  if (suspendedAdmins.length > 0) {
    findings.push({
      severity: "high",
      title: "Suspended or archived admin accounts still marked admin",
      evidence: {
        users: suspendedAdmins.map((user) => user.primaryEmail)
      }
    });
  }

  if (externallyNamedGroups.length > 0) {
    findings.push({
      severity: "low",
      title: "Groups with broad-sharing names need review",
      evidence: {
        groups: externallyNamedGroups.map((group) => group.email)
      }
    });
  }

  if (suspiciousEvents.length > 0) {
    findings.push({
      severity: "medium",
      title: "Recent high-signal admin events",
      evidence: {
        eventCount: suspiciousEvents.length,
        sample: suspiciousEvents.slice(0, 5).map((activity) => ({
          time: activity.time,
          actorEmail: activity.actorEmail,
          eventName: activity.eventName
        }))
      }
    });
  }

  return {
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    counts: {
      users: input.users.length,
      admins: admins.length,
      delegatedAdmins: delegatedAdmins.length,
      suspendedUsers: input.users.filter((user) => user.suspended).length,
      archivedUsers: input.users.filter((user) => user.archived).length,
      groups: input.groups.length,
      recentAdminEvents: input.activities.length
    },
    findings
  };
}
