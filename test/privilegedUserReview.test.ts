import { describe, expect, it } from "vitest";
import { buildPrivilegedUserReview } from "../src/workspace/privilegedUserReview.js";
import { WorkspaceActivity, WorkspaceUser } from "../src/workspace/types.js";

const baseUser = {
  id: "user-1",
  primaryEmail: "user@example.com",
  suspended: false,
  archived: false,
  isAdmin: false,
  isDelegatedAdmin: false
} satisfies WorkspaceUser;

describe("buildPrivilegedUserReview", () => {
  it("flags a suspended privileged account with evidence tied to its immutable ID", () => {
    const review = buildPrivilegedUserReview({
      user: { ...baseUser, suspended: true, isAdmin: true },
      memberships: { items: [], resultCount: 0, complete: true },
      activities: { items: [], resultCount: 0, complete: true },
      generatedAt: "2026-08-21T00:00:00.000Z"
    });

    expect(review.findings).toEqual([
      {
        severity: "high",
        title: "Suspended or archived account still has administrator privileges",
        evidence: {
          userId: "user-1",
          suspended: true,
          archived: false
        }
      }
    ]);
  });

  it("preserves page completeness while removing audit parameters", () => {
    const activity: WorkspaceActivity = {
      id: "event-1",
      events: [
        {
          name: "ASSIGN_ROLE",
          resourceIds: ["role-1"],
          parameters: [{ name: "target_user", valueKind: "string", values: ["user@example.com"] }]
        }
      ]
    };

    const review = buildPrivilegedUserReview({
      user: baseUser,
      memberships: {
        items: [],
        resultCount: 0,
        nextPageToken: "groups-next",
        complete: false
      },
      activities: {
        items: [activity],
        resultCount: 1,
        nextPageToken: "audit-next",
        complete: false
      },
      generatedAt: "2026-08-21T00:00:00.000Z"
    });

    expect(review.memberships.complete).toBe(false);
    expect(review.recentAdminActivity).toMatchObject({
      resultCount: 1,
      nextPageToken: "audit-next",
      complete: false,
      items: [{ events: [{ name: "ASSIGN_ROLE", resourceIds: ["role-1"] }] }]
    });
    expect(review.recentAdminActivity.items[0].events[0]).not.toHaveProperty("parameters");
  });
});
