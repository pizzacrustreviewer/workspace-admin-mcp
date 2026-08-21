import { SpanKind } from "@opentelemetry/api";
import { admin_directory_v1, admin_reports_v1, google } from "googleapis";
import { withSpan } from "../telemetry.js";
import { createGoogleAuth } from "./googleAuth.js";
import {
  ListActivitiesOptions,
  ListGroupMembersOptions,
  ListGroupsOptions,
  ListUsersOptions,
  ResultPage,
  WorkspaceActivity,
  WorkspaceActivityParameter,
  WorkspaceAdminClient,
  WorkspaceGroup,
  WorkspaceGroupMember,
  WorkspaceUser
} from "./types.js";

type GoogleAuth = ReturnType<typeof createGoogleAuth>;

export interface GoogleWorkspaceApis {
  directory: {
    users: Pick<admin_directory_v1.Resource$Users, "get" | "list">;
    groups: Pick<admin_directory_v1.Resource$Groups, "list">;
    members: Pick<admin_directory_v1.Resource$Members, "list">;
  };
  reports: {
    activities: Pick<admin_reports_v1.Resource$Activities, "list">;
  };
}

export class GoogleWorkspaceAdminClient implements WorkspaceAdminClient {
  private readonly apis: GoogleWorkspaceApis;

  constructor(
    auth: GoogleAuth | undefined,
    private readonly customerId: string,
    apis?: GoogleWorkspaceApis
  ) {
    if (apis) {
      this.apis = apis;
      return;
    }

    if (!auth) {
      throw new Error("Google auth is required when API clients are not injected");
    }

    const directory = google.admin({ version: "directory_v1", auth });
    const reports = google.admin({ version: "reports_v1", auth });
    this.apis = {
      directory: {
        users: directory.users,
        groups: directory.groups,
        members: directory.members
      },
      reports: { activities: reports.activities }
    };
  }

  async listUsers(options: ListUsersOptions): Promise<ResultPage<WorkspaceUser>> {
    return withGoogleSpan("directory.users.list", async (span) => {
      const response = await this.apis.directory.users.list({
        customer: this.customerId,
        maxResults: options.maxResults,
        orderBy: "email",
        projection: "basic",
        query: options.query,
        pageToken: options.pageToken
      });
      const page = toResultPage(response.data.users?.map(toWorkspaceUser), response.data.nextPageToken);
      span.setAttribute("workspace.result.count", page.resultCount);
      span.setAttribute("workspace.result.complete", page.complete);
      return page;
    });
  }

  async getUser(userKey: string): Promise<WorkspaceUser> {
    return withGoogleSpan("directory.users.get", async () => {
      const response = await this.apis.directory.users.get({ userKey, projection: "basic" });
      return toWorkspaceUser(response.data);
    });
  }

  async listGroups(options: ListGroupsOptions): Promise<ResultPage<WorkspaceGroup>> {
    return withGoogleSpan("directory.groups.list", async (span) => {
      const response = await this.apis.directory.groups.list({
        customer: options.userKey ? undefined : this.customerId,
        maxResults: options.maxResults,
        query: options.query,
        userKey: options.userKey,
        pageToken: options.pageToken
      });
      const page = toResultPage(response.data.groups?.map(toWorkspaceGroup), response.data.nextPageToken);
      span.setAttribute("workspace.result.count", page.resultCount);
      span.setAttribute("workspace.result.complete", page.complete);
      return page;
    });
  }

  async listGroupMembers(
    options: ListGroupMembersOptions
  ): Promise<ResultPage<WorkspaceGroupMember>> {
    return withGoogleSpan("directory.members.list", async (span) => {
      const response = await this.apis.directory.members.list({
        groupKey: options.groupKey,
        maxResults: options.maxResults,
        pageToken: options.pageToken
      });
      const page = toResultPage(
        response.data.members?.map(toWorkspaceGroupMember),
        response.data.nextPageToken
      );
      span.setAttribute("workspace.result.count", page.resultCount);
      span.setAttribute("workspace.result.complete", page.complete);
      return page;
    });
  }

  async listActivities(options: ListActivitiesOptions): Promise<ResultPage<WorkspaceActivity>> {
    return withGoogleSpan("reports.activities.list", async (span) => {
      const response = await this.apis.reports.activities.list({
        userKey: options.userKey,
        applicationName: "admin",
        maxResults: options.maxResults,
        eventName: options.eventName,
        startTime: options.startTime,
        endTime: options.endTime,
        pageToken: options.pageToken
      });
      const page = toResultPage(
        response.data.items?.map(toWorkspaceActivity),
        response.data.nextPageToken
      );
      span.setAttribute("workspace.result.count", page.resultCount);
      span.setAttribute("workspace.result.complete", page.complete);
      return page;
    });
  }
}

function withGoogleSpan<T>(operation: string, call: Parameters<typeof withSpan<T>>[2]): Promise<T> {
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

export function toWorkspaceUser(user: admin_directory_v1.Schema$User): WorkspaceUser {
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

export function toWorkspaceGroup(group: admin_directory_v1.Schema$Group): WorkspaceGroup {
  return {
    id: group.id ?? "",
    email: group.email ?? "",
    name: group.name ?? undefined,
    directMembersCount: group.directMembersCount ?? undefined,
    adminCreated: group.adminCreated ?? undefined
  };
}

export function toWorkspaceGroupMember(
  member: admin_directory_v1.Schema$Member
): WorkspaceGroupMember {
  return {
    id: member.id ?? "",
    email: member.email ?? undefined,
    role: member.role ?? undefined,
    status: member.status ?? undefined,
    type: member.type ?? undefined
  };
}

export function toWorkspaceActivity(activity: admin_reports_v1.Schema$Activity): WorkspaceActivity {
  return {
    id: activity.id?.uniqueQualifier ?? undefined,
    time: activity.id?.time ?? undefined,
    applicationName: activity.id?.applicationName ?? undefined,
    actorEmail: activity.actor?.email ?? undefined,
    events: (activity.events ?? []).map((event) => ({
      name: event.name ?? undefined,
      type: event.type ?? undefined,
      resourceIds: event.resourceIds ?? [],
      parameters: (event.parameters ?? []).map(toWorkspaceActivityParameter),
      status: event.status
        ? {
            eventStatus: event.status.eventStatus ?? undefined,
            errorCode: event.status.errorCode ?? undefined,
            httpStatusCode: event.status.httpStatusCode ?? undefined
          }
        : undefined
    }))
  };
}

function toWorkspaceActivityParameter(
  parameter: NonNullable<NonNullable<admin_reports_v1.Schema$Activity["events"]>[number]["parameters"]>[number]
): WorkspaceActivityParameter {
  const name = parameter.name ?? "unknown";

  if (parameter.value !== undefined && parameter.value !== null) {
    return { name, valueKind: "string", values: [parameter.value] };
  }
  if (parameter.intValue !== undefined && parameter.intValue !== null) {
    return { name, valueKind: "integer", values: [parameter.intValue] };
  }
  if (parameter.boolValue !== undefined && parameter.boolValue !== null) {
    return { name, valueKind: "boolean", values: [String(parameter.boolValue)] };
  }
  if (parameter.multiValue) {
    return { name, valueKind: "strings", values: parameter.multiValue };
  }
  if (parameter.multiIntValue) {
    return { name, valueKind: "integers", values: parameter.multiIntValue };
  }
  if (parameter.messageValue) {
    return { name, valueKind: "message", values: [serializeNestedMessage(parameter.messageValue)] };
  }
  if (parameter.multiMessageValue) {
    return {
      name,
      valueKind: "messages",
      values: parameter.multiMessageValue.map(serializeNestedMessage)
    };
  }

  return { name, valueKind: "unknown", values: [] };
}

function serializeNestedMessage(message: {
  parameter?: admin_reports_v1.Schema$NestedParameter[];
}): string {
  return JSON.stringify(
    (message.parameter ?? []).map((parameter) => ({
      name: parameter.name ?? "unknown",
      values: nestedParameterValues(parameter)
    }))
  );
}

function nestedParameterValues(parameter: admin_reports_v1.Schema$NestedParameter): string[] {
  if (parameter.value !== undefined && parameter.value !== null) {
    return [parameter.value];
  }
  if (parameter.intValue !== undefined && parameter.intValue !== null) {
    return [parameter.intValue];
  }
  if (parameter.boolValue !== undefined && parameter.boolValue !== null) {
    return [String(parameter.boolValue)];
  }
  if (parameter.multiValue) {
    return parameter.multiValue;
  }
  if (parameter.multiIntValue) {
    return parameter.multiIntValue;
  }
  if (parameter.multiBoolValue) {
    return parameter.multiBoolValue.map(String);
  }
  return [];
}

function toResultPage<T>(items: T[] | undefined, pageToken: string | null | undefined): ResultPage<T> {
  const normalizedItems = items ?? [];
  const nextPageToken = pageToken || undefined;
  return {
    items: normalizedItems,
    resultCount: normalizedItems.length,
    nextPageToken,
    complete: !nextPageToken
  };
}
