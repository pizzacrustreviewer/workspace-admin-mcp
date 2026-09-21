import type { ListActivitiesOptions, ListGroupsOptions, ListGroupMembersOptions, ListUsersOptions, WorkspaceAdminClient } from "./types.js";

const user = {
  id: "synthetic-admin", primaryEmail: "admin@example.test", fullName: "Synthetic Administrator",
  isAdmin: true, isDelegatedAdmin: false, suspended: true, archived: false
};
const groups = [
  { id: "synthetic-operations", email: "operations@example.test", name: "Synthetic Operations" },
  { id: "synthetic-security", email: "security@example.test", name: "Synthetic Security" }
];
const activities = [{
  id: "synthetic-event", actorEmail: user.primaryEmail, applicationName: "admin",
  time: "2026-09-01T12:00:00.000Z", events: [{ name: "SYNTHETIC_REVIEW", resourceIds: [] }]
}];

function checkUser(key: string) {
  if (key !== user.id && key !== user.primaryEmail) throw new Error("Synthetic user not found");
}

function page<T>(items: T[], options: { maxResults: number; pageToken?: string }) {
  const token = options.pageToken ?? "0";
  if (!/^(0|[1-9][0-9]*)$/.test(token)) throw new Error("Invalid synthetic cursor");
  const offset = Number(token);
  if (!Number.isSafeInteger(offset) || offset > items.length) throw new Error("Invalid synthetic cursor");
  const result = items.slice(offset, offset + options.maxResults);
  const next = offset + result.length;
  return { items: structuredClone(result), resultCount: result.length, complete: next >= items.length,
    nextPageToken: next < items.length ? String(next) : undefined };
}

// Deliberately has no Google client, credentials, or network fallback.
export class SyntheticWorkspaceAdminClient implements WorkspaceAdminClient {
  async getUser(userKey: string) { checkUser(userKey); return { ...user }; }
  async listUsers(options: ListUsersOptions) {
    if (options.query) throw new Error("Synthetic queries are unsupported");
    return page([user], options);
  }
  async listGroups(options: ListGroupsOptions) {
    if (options.userKey) checkUser(options.userKey);
    if (options.query) throw new Error("Synthetic queries are unsupported");
    return page(groups, options);
  }
  async listGroupMembers(options: ListGroupMembersOptions) {
    if (!groups.some((group) => [group.id, group.email].includes(options.groupKey))) {
      throw new Error("Synthetic group not found");
    }
    return page([{ id: user.id, email: user.primaryEmail, role: "MEMBER", type: "USER" }], options);
  }
  async listActivities(options: ListActivitiesOptions) {
    checkUser(options.userKey);
    return page(activities.filter((event) => Date.parse(event.time) >= Date.parse(options.startTime) &&
      Date.parse(event.time) <= Date.parse(options.endTime) &&
      (!options.eventName || event.events.some((item) => item.name === options.eventName))), options);
  }
}
