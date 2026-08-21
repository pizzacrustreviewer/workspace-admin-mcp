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

export interface WorkspaceActivity {
  id?: string;
  time?: string;
  applicationName?: string;
  actorEmail?: string;
  eventName?: string;
  eventType?: string;
  parameters: Record<string, string | number | boolean | null>;
}

export interface ListUsersOptions {
  maxResults: number;
  query?: string;
}

export interface ListGroupsOptions {
  maxResults: number;
  query?: string;
}

export interface ListActivitiesOptions {
  applicationName: string;
  maxResults: number;
  eventName?: string;
  startTime?: string;
  endTime?: string;
}

export interface WorkspaceAdminClient {
  listUsers(options: ListUsersOptions): Promise<WorkspaceUser[]>;
  listGroups(options: ListGroupsOptions): Promise<WorkspaceGroup[]>;
  listActivities(options: ListActivitiesOptions): Promise<WorkspaceActivity[]>;
}
