import { describe, expect, it } from "vitest";
import {
  resolveToolPolicy,
  TOOL_SCOPES,
  toGoogleScopes
} from "../src/security/toolPolicy.js";

describe("resolveToolPolicy", () => {
  it("defaults to the risk profile instead of exposing every tool", () => {
    const policy = resolveToolPolicy({});

    expect(policy.profile).toBe("risk");
    expect(policy.allowedTools).toEqual(["workspace_risk_snapshot"]);
  });

  it("intersects explicit allowed tools with the selected profile", () => {
    const policy = resolveToolPolicy({
      profile: "inventory",
      allowedTools: ["workspace_users_list", "workspace_admin_activity_search"]
    });

    expect(policy.allowedTools).toEqual(["workspace_users_list"]);
  });

  it("hides tools when the required internal scopes are not granted", () => {
    const policy = resolveToolPolicy({
      profile: "full-readonly",
      grantedScopes: [TOOL_SCOPES.workspaceUsersRead]
    });

    expect(policy.allowedTools).toEqual(["workspace_users_list"]);
  });

  it("maps internal scopes to precise Google read-only scopes", () => {
    expect(toGoogleScopes([TOOL_SCOPES.workspaceUsersRead])).toEqual([
      "https://www.googleapis.com/auth/admin.directory.user.readonly"
    ]);
  });
});
