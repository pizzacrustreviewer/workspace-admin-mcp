import { describe, expect, it } from "vitest";
import { buildRiskSnapshot } from "../src/workspace/riskSnapshot.js";
import { WorkspaceActivity, WorkspaceGroup, WorkspaceUser } from "../src/workspace/types.js";

const baseUser = {
  id: "1",
  primaryEmail: "user@example.com",
  suspended: false,
  archived: false,
  isAdmin: false,
  isDelegatedAdmin: false
} satisfies WorkspaceUser;

describe("buildRiskSnapshot", () => {
  it("flags suspended admin accounts as high severity", () => {
    const users: WorkspaceUser[] = [
      {
        ...baseUser,
        id: "admin-1",
        primaryEmail: "admin@example.com",
        suspended: true,
        isAdmin: true
      }
    ];

    const snapshot = buildRiskSnapshot({
      users,
      groups: [],
      activities: [],
      generatedAt: "2026-08-21T00:00:00.000Z"
    });

    expect(snapshot.counts.admins).toBe(1);
    expect(snapshot.findings).toContainEqual({
      severity: "high",
      title: "Suspended or archived admin accounts still marked admin",
      evidence: { users: ["admin@example.com"] }
    });
  });

  it("keeps the snapshot deterministic for groups and audit activity", () => {
    const groups: WorkspaceGroup[] = [
      { id: "g1", email: "external-sharing@example.com", name: "External Sharing" }
    ];
    const activities: WorkspaceActivity[] = [
      {
        time: "2026-08-21T00:00:00.000Z",
        actorEmail: "admin@example.com",
        eventName: "CHANGE_USER_PRIVILEGE",
        eventType: "ADMIN_SETTINGS",
        parameters: {}
      }
    ];

    const snapshot = buildRiskSnapshot({
      users: [],
      groups,
      activities,
      generatedAt: "2026-08-21T00:00:00.000Z"
    });

    expect(snapshot).toMatchObject({
      counts: {
        users: 0,
        groups: 1,
        recentAdminEvents: 1
      },
      findings: [
        {
          severity: "low",
          title: "Groups with broad-sharing names need review"
        },
        {
          severity: "medium",
          title: "Recent high-signal admin events"
        }
      ]
    });
  });
});
