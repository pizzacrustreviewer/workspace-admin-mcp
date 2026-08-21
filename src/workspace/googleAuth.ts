import { google } from "googleapis";
import { AppConfig } from "../config.js";

export const READ_ONLY_SCOPES = [
  "https://www.googleapis.com/auth/admin.directory.user.readonly",
  "https://www.googleapis.com/auth/admin.directory.group.readonly",
  "https://www.googleapis.com/auth/admin.reports.audit.readonly"
] as const;

export function createGoogleAuth(config: AppConfig, scopes: string[]) {
  return new google.auth.JWT({
    email: config.serviceAccountEmail,
    key: config.serviceAccountPrivateKey,
    scopes,
    subject: config.delegatedAdmin
  });
}
