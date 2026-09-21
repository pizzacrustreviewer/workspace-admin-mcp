# Agent Containment Model

Broad tool catalogs, broad credentials, and untrusted enterprise content are a
dangerous combination. This server narrows tools and scopes; it does not make
returned content trustworthy or contain an agent that can access Google credentials.

## Discovery Policy

| Profile | Intent | Tools |
| --- | --- | --- |
| `risk` | Restricted default investigation | `workspace_privileged_user_review` |
| `inventory` | Directory and membership inspection | User, group, and membership read tools |
| `audit` | Subject-scoped audit investigation | `workspace_admin_activity_search` |
| `full-readonly` | Explicit broad read mode | All read-only tools |

The selected profile is an upper bound. `WORKSPACE_MCP_ALLOWED_TOOLS` can only narrow it. Denied tools are not registered and therefore do not appear in MCP discovery.

HTTP intersects token scopes with server policy before creating the request's
catalog. Handlers repeat the policy check at invocation. Stdio uses synthetic data
only. See [HTTP Deployment](HTTP_DEPLOYMENT.md) for the required identity separation.

## Credential Scopes

| Internal scope | Google OAuth scope |
| --- | --- |
| `workspace.users.read` | `admin.directory.user.readonly` |
| `workspace.groups.read` | `admin.directory.group.readonly` |
| `workspace.group-members.read` | `admin.directory.group.member.readonly` |
| `workspace.audit.read` | `admin.reports.audit.readonly` |

Configured grants are another upper bound. After tools missing required scopes are hidden, the server recalculates the scopes required by the remaining tools. Only that final set is used to create the Google credential.

## Input and Output Limits

- list calls have fixed maximum page sizes
- Admin audit searches require one `userKey`
- audit windows cannot exceed 31 days
- event names accept only letters, numbers, and underscores
- page tokens are bounded and never logged
- audit parameters are omitted unless explicitly requested
- every list result reports whether another provider page exists

## Untrusted Data

Tool annotations identify Workspace data as open-world content, but annotations are not authorization. Model output, prompt text, Workspace values, trace IDs, and request metadata never influence policy decisions.

## Mutations

There are no write tools. Future changes must follow:

```text
inspect -> propose structured diff -> policy check -> approve exact diff -> execute -> verify
```

A simple `dryRun` flag is not an approval system.
