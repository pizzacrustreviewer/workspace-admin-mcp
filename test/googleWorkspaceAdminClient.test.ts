import { describe, expect, it, vi } from "vitest";
import {
  GoogleWorkspaceAdminClient,
  GoogleWorkspaceApis,
  toWorkspaceActivity
} from "../src/workspace/googleWorkspaceAdminClient.js";

describe("GoogleWorkspaceAdminClient", () => {
  it("returns explicit page completeness and uses user-scoped group lookup", async () => {
    const usersList = vi.fn(async () => ({
      data: {
        users: [{ id: "user-1", primaryEmail: "user@example.com" }],
        nextPageToken: "users-next"
      }
    }));
    const groupsList = vi.fn(async () => ({
      data: { groups: [{ id: "group-1", email: "admins@example.com" }] }
    }));
    const client = new GoogleWorkspaceAdminClient(
      undefined,
      "my_customer",
      {
        directory: {
          users: { list: usersList },
          groups: { list: groupsList },
          members: { list: vi.fn() }
        },
        reports: { activities: { list: vi.fn() } }
      } as unknown as GoogleWorkspaceApis
    );

    await expect(client.listUsers({ maxResults: 1 })).resolves.toMatchObject({
      resultCount: 1,
      nextPageToken: "users-next",
      complete: false
    });
    await expect(
      client.listGroups({ userKey: "user@example.com", maxResults: 50 })
    ).resolves.toMatchObject({ resultCount: 1, complete: true });
    expect(groupsList).toHaveBeenCalledWith(
      expect.objectContaining({ customer: undefined, userKey: "user@example.com" })
    );
  });

  it("maps every audit event and preserves multi-valued parameters", () => {
    const activity = toWorkspaceActivity({
      id: {
        uniqueQualifier: "event-1",
        time: "2026-08-21T00:00:00.000Z",
        applicationName: "admin"
      },
      actor: { email: "admin@example.com" },
      events: [
        {
          name: "ASSIGN_ROLE",
          type: "ADMIN_SETTINGS",
          resourceIds: ["role-1"],
          parameters: [
            { name: "targets", multiValue: ["user-1", "user-2"] },
            { name: "enabled", boolValue: false }
          ]
        },
        {
          name: "UPDATE_ROLE",
          parameters: [{ name: "role_id", intValue: "12345678901234567890" }]
        }
      ]
    });

    expect(activity.events).toEqual([
      {
        name: "ASSIGN_ROLE",
        type: "ADMIN_SETTINGS",
        resourceIds: ["role-1"],
        parameters: [
          { name: "targets", valueKind: "strings", values: ["user-1", "user-2"] },
          { name: "enabled", valueKind: "boolean", values: ["false"] }
        ],
        status: undefined
      },
      {
        name: "UPDATE_ROLE",
        type: undefined,
        resourceIds: [],
        parameters: [
          { name: "role_id", valueKind: "integer", values: ["12345678901234567890"] }
        ],
        status: undefined
      }
    ]);
  });
});
