export interface ResultPage<T> {
  items: T[];
  resultCount: number;
  nextPageToken?: string;
  complete: boolean;
}

export interface WorkspaceUser {
  id: string;
  primaryEmail: string;
  fullName?: string;
  suspended: boolean;
  archived: boolean;
  isAdmin: boolean;
  isDelegatedAdmin: boolean;
  lastLoginTime?: string;
  orgUnitPath?: string;
}

export interface WorkspaceGroup {
  id: string;
  email: string;
  name?: string;
  directMembersCount?: string;
  adminCreated?: boolean;
}

export interface WorkspaceGroupMember {
  id: string;
  email?: string;
  role?: string;
  status?: string;
  type?: string;
}

export type WorkspaceActivityParameterKind =
  | "string"
  | "integer"
  | "boolean"
  | "strings"
  | "integers"
  | "message"
  | "messages"
  | "unknown";

export interface WorkspaceActivityParameter {
  name: string;
  valueKind: WorkspaceActivityParameterKind;
  values: string[];
}

export interface WorkspaceActivityEvent {
  name?: string;
  type?: string;
  resourceIds: string[];
  parameters?: WorkspaceActivityParameter[];
  status?: {
    eventStatus?: string;
    errorCode?: string;
    httpStatusCode?: number;
  };
}

export interface WorkspaceActivity {
  id?: string;
  time?: string;
  applicationName?: string;
  actorEmail?: string;
  events: WorkspaceActivityEvent[];
}

export interface ListUsersOptions {
  maxResults: number;
  query?: string;
  pageToken?: string;
}

export interface ListGroupsOptions {
  maxResults: number;
  query?: string;
  userKey?: string;
  pageToken?: string;
}

export interface ListGroupMembersOptions {
  groupKey: string;
  maxResults: number;
  pageToken?: string;
}

export interface ListActivitiesOptions {
  userKey: string;
  maxResults: number;
  eventName?: string;
  startTime: string;
  endTime: string;
  pageToken?: string;
}

export interface WorkspaceAdminClient {
  listUsers(options: ListUsersOptions): Promise<ResultPage<WorkspaceUser>>;
  getUser(userKey: string): Promise<WorkspaceUser>;
  listGroups(options: ListGroupsOptions): Promise<ResultPage<WorkspaceGroup>>;
  listGroupMembers(options: ListGroupMembersOptions): Promise<ResultPage<WorkspaceGroupMember>>;
  listActivities(options: ListActivitiesOptions): Promise<ResultPage<WorkspaceActivity>>;
}
