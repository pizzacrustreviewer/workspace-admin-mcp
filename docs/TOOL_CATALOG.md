# Tool Catalog

MCP descriptions stay short; this document carries the detailed authorization contract.

| Tool | Profiles | Internal scopes | Notes |
| --- | --- | --- | --- |
| `workspace_privileged_user_review` | `risk`, `full-readonly` | users, groups, audit | Exact subject, bounded evidence, no audit parameters. |
| `workspace_user_get` | `inventory`, `full-readonly` | users | One user by email, alias, or immutable ID. |
| `workspace_users_list` | `inventory`, `full-readonly` | users | Bounded page with basic projection. |
| `workspace_groups_list` | `inventory`, `full-readonly` | groups | Bounded page with basic group metadata. |
| `workspace_user_memberships_list` | `inventory`, `full-readonly` | groups | Groups containing one user. |
| `workspace_group_members_list` | `inventory`, `full-readonly` | group-members | Direct members of one group. |
| `workspace_admin_activity_search` | `audit`, `full-readonly` | audit | One subject, maximum 31-day window, parameters opt-in. |

Internal scope names:

```text
users          workspace.users.read
groups         workspace.groups.read
group-members  workspace.group-members.read
audit          workspace.audit.read
```

All tools are read-only, logically idempotent for a single provider view, and marked `openWorldHint: true` because Workspace content is untrusted input to the calling model.
