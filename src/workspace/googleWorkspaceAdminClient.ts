import { admin_directory_v1, admin_reports_v1, google } from "googleapis";
import { SpanKind } from "@opentelemetry/api";
import { withSpan } from "../telemetry.js";
import { createGoogleAuth } from "./googleAuth.js";
import {
  ListActivitiesOptions,
  ListGroupsOptions,
  ListUsersOptions,
  WorkspaceActivity,
  WorkspaceAdminClient,
  WorkspaceGroup,
  WorkspaceUser
} from "./types.js";

type GoogleAuth = ReturnType<typeof createGoogleAuth>;

export class GoogleWorkspaceAdminClient implements WorkspaceAdminClient {
  private readonly directory: admin_directory_v1.Admin;
  private readonly reports: admin_reports_v1.Admin;

  constructor(
    auth: GoogleAuth,
    private readonly customerId: string
  ) {
    this.directory = google.admin({ version: "directory_v1", auth });
    this.reports = google.admin({ version: "reports_v1", auth });
  }

  async listUsers(options: ListUsersOptions): Promise<WorkspaceUser[]> {
    return withGoogleSpan("directory.users.list", async (span) => {
      const response = await this.directory.users.list({
        customer: this.customerId,
        maxResults: options.maxResults,
        orderBy: "email",
        projection: "basic",
        query: options.query
      });
      const users = (response.data.users ?? []).map(toWorkspaceUser);
      span.setAttribute("workspace.result.count", users.length);
      return users;
    });
  }

  async listGroups(options: ListGroupsOptions): Promise<WorkspaceGroup[]> {
    return withGoogleSpan("directory.groups.list", async (span) => {
      const response = await this.directory.groups.list({
        customer: this.customerId,
        maxResults: options.maxResults,
        query: options.query
      });
      const groups = (response.data.groups ?? []).map(toWorkspaceGroup);
      span.setAttribute("workspace.result.count", groups.length);
      return groups;
    });
  }

  async listActivities(options: ListActivitiesOptions): Promise<WorkspaceActivity[]> {
    return withGoogleSpan("reports.activities.list", async (span) => {
      const response = await this.reports.activities.list({
        userKey: "all",
        applicationName: options.applicationName,
        maxResults: options.maxResults,
        eventName: options.eventName,
        startTime: options.startTime,
        endTime: options.endTime
      });
      const activities = (response.data.items ?? []).map(toWorkspaceActivity);
      span.setAttribute("workspace.result.count", activities.length);
      return activities;
    });
  }
}

function withGoogleSpan<T>(
  operation: string,
  call: Parameters<typeof withSpan<T>>[2]
): Promise<T> {
  return withSpan(
    `google.workspace ${operation}`,
    {
      kind: SpanKind.CLIENT,
      attributes: {
        "server.address": "admin.googleapis.com",
        "workspace.api.operation": operation
      }
    },
    call
  );
}

function toWorkspaceUser(user: admin_directory_v1.Schema$User): WorkspaceUser {
  return {
    id: user.id ?? "",
    primaryEmail: user.primaryEmail ?? "",
    fullName: user.name?.fullName ?? undefined,
    suspended: user.suspended ?? false,
    archived: user.archived ?? false,
    isAdmin: user.isAdmin ?? false,
    isDelegatedAdmin: user.isDelegatedAdmin ?? false,
    lastLoginTime: user.lastLoginTime ?? undefined,
    orgUnitPath: user.orgUnitPath ?? undefined
  };
}

function toWorkspaceGroup(group: admin_directory_v1.Schema$Group): WorkspaceGroup {
  return {
    id: group.id ?? "",
    email: group.email ?? "",
    name: group.name ?? undefined,
    directMembersCount: group.directMembersCount ?? undefined,
    adminCreated: group.adminCreated ?? undefined
  };
}

function toWorkspaceActivity(activity: admin_reports_v1.Schema$Activity): WorkspaceActivity {
  const event = activity.events?.[0];

  return {
    id: activity.id?.uniqueQualifier ?? undefined,
    time: activity.id?.time ?? undefined,
    applicationName: activity.id?.applicationName ?? undefined,
    actorEmail: activity.actor?.email ?? undefined,
    eventName: event?.name ?? undefined,
    eventType: event?.type ?? undefined,
    parameters: Object.fromEntries(
      (event?.parameters ?? []).map((parameter) => [
        parameter.name ?? "unknown",
        parameter.value ?? parameter.intValue ?? parameter.boolValue ?? null
      ])
    )
  };
}
