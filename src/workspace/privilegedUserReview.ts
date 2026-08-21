import {
  ResultPage,
  WorkspaceActivity,
  WorkspaceGroup,
  WorkspaceUser
} from "./types.js";

export interface ReviewFinding {
  severity: "high";
  title: string;
  evidence: {
    userId: string;
    suspended: boolean;
    archived: boolean;
  };
}

export interface PrivilegedUserReview {
  generatedAt: string;
  subject: WorkspaceUser;
  privilege: {
    isAdmin: boolean;
    isDelegatedAdmin: boolean;
  };
  memberships: ResultPage<WorkspaceGroup>;
  recentAdminActivity: ResultPage<WorkspaceActivity>;
  findings: ReviewFinding[];
}

export function buildPrivilegedUserReview(input: {
  user: WorkspaceUser;
  memberships: ResultPage<WorkspaceGroup>;
  activities: ResultPage<WorkspaceActivity>;
  generatedAt?: string;
}): PrivilegedUserReview {
  const findings: ReviewFinding[] = [];
  const isPrivileged = input.user.isAdmin || input.user.isDelegatedAdmin;

  if (isPrivileged && (input.user.suspended || input.user.archived)) {
    findings.push({
      severity: "high",
      title: "Suspended or archived account still has administrator privileges",
      evidence: {
        userId: input.user.id,
        suspended: input.user.suspended,
        archived: input.user.archived
      }
    });
  }

  return {
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    subject: input.user,
    privilege: {
      isAdmin: input.user.isAdmin,
      isDelegatedAdmin: input.user.isDelegatedAdmin
    },
    memberships: input.memberships,
    recentAdminActivity: withoutActivityParameters(input.activities),
    findings
  };
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
