# Tool Catalog

MCP descriptions stay short; this document carries the detailed authorization contract.

| Tool | Profiles | Internal scopes | Notes |
| --- | --- | --- | --- |
| `workspace_privileged_user_review` | `risk`, `full-readonly` | users, groups, audit | Exact subject, independently pageable memberships and actor activity, no audit parameters. |
| `workspace_user_get` | `inventory`, `full-readonly` | users | One user by email, alias, or immutable ID. |
| `workspace_users_list` | `inventory`, `full-readonly` | users | Bounded page with basic projection. |
| `workspace_groups_list` | `inventory`, `full-readonly` | groups | Bounded page with basic group metadata. |
| `workspace_user_memberships_list` | `inventory`, `full-readonly` | groups | Groups containing one user. |
| `workspace_group_members_list` | `inventory`, `full-readonly` | group-members | Direct members of one group. |
| `workspace_admin_activity_search` | `audit`, `full-readonly` | audit | One actor, maximum 31-day window, parameters opt-in; aggregate `all` is rejected. |

Internal scope names:

```text
users          workspace.users.read
groups         workspace.groups.read
group-members  workspace.group-members.read
audit          workspace.audit.read
```

All tools are read-only, logically idempotent for a single provider view, and marked `openWorldHint: true` because Workspace content is untrusted input to the calling model.

## Evidence Continuation

`workspace_privileged_user_review` accepts optional `membershipPageToken` and
`activityPageToken` strings (1-2048 characters). Each is forwarded only to its
corresponding provider operation. Supply the respective `nextPageToken` while
keeping the subject, window, and limits unchanged. Omitting a token restarts that
dataset at its first page. The server does not aggregate pages or guarantee a
consistent snapshot. `complete` means there is no next page for that dataset.

Admin audit selection filters the actor, not the affected account. An empty actor
history does not establish that no other administrator changed the subject.

## Tool Failures

Provider and output-validation failures return an MCP tool error containing
`WORKSPACE_TOOL_FAILED` and a generated reference ID. A content-free `tool_failed`
log records that same ID. Original exception messages and causes are not returned.
Invalid input and unknown-tool errors are handled by the SDK before invocation.
