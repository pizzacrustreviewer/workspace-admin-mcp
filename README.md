# workspace-admin-mcp

[![CI](https://github.com/pizzacrustreviewer/GWS-MCP/actions/workflows/ci.yml/badge.svg)](https://github.com/pizzacrustreviewer/GWS-MCP/actions/workflows/ci.yml)
![Python](https://img.shields.io/badge/python-3.10%2B-blue)
![License](https://img.shields.io/badge/license-MIT-green)

An **admin-oriented** [Model Context Protocol](https://modelcontextprotocol.io/) server for Google Workspace. It lets an LLM (Claude, or any MCP client) perform **directory/admin** operations — user lifecycle and group management — through natural language, with safety guardrails and full audit logging.

> Most Workspace MCP servers are *end-user* focused (my Gmail, my Drive). This one is built for the **admin** — the person who onboards, offboards, and manages groups for the whole domain via the Admin SDK.

## Why

Running Workspace admin at scale means living in the Admin SDK and tools like GAM: bulk operations, offboarding runbooks, group cleanups. Those are exactly the tasks an LLM is good at *describing* — but you can't hand an assistant the keys to suspend accounts without guardrails. This server is the safe middle layer:

- **Read-only by default.** Write tools refuse unless you explicitly opt in.
- **Dry-run by default.** Even with writes enabled, actions are simulated until you pass `dry_run=false`.
- **Audited.** Every call — read, refused, simulated, or applied — emits a structured JSON audit line.

## Tools

| Tool | Type | Description |
|------|------|-------------|
| `workspace_list_users` | read | List users; supports Admin SDK search (`isSuspended=true`, `orgUnitPath=/Sales`, …) |
| `workspace_get_user` | read | Get one user's directory profile |
| `workspace_list_groups` | read | List groups, or the groups a user belongs to |
| `workspace_list_group_members` | read | List a group's members |
| `workspace_suspend_user` | **guarded write** | Suspend/restore a user (core offboarding step) |
| `workspace_add_group_member` | **guarded write** | Add a member to a group |
| `workspace_remove_group_member` | **guarded write** | Remove a member from a group |

## Architecture

```
Claude / MCP client  ──MCP──▶  workspace-admin-mcp  ──▶  Google Admin SDK  ──▶  Workspace
                                      │
                                 guardrails  ──▶  audit log (JSON, stderr)
```

Full diagram and design notes in [`docs/architecture.md`](docs/architecture.md).

## Quickstart (local)

```bash
git clone https://github.com/pizzacrustreviewer/GWS-MCP.git
cd workspace-admin-mcp
pip install -e ".[dev]"
pytest -q          # tests run with no credentials (in-memory fake client)
```

### Run it against a real tenant

You need a Google Cloud service account with **domain-wide delegation** authorized for the directory scopes, and a Workspace admin to impersonate. Use a personal or **developer** tenant — never production/corporate.

```bash
cp .env.example .env      # fill in the values, then:
export $(grep -v '^#' .env | xargs)
workspace-admin-mcp       # starts on stdio for a local MCP client
```

### Connect from Claude Desktop

```json
{
  "mcpServers": {
    "workspace-admin": {
      "command": "workspace-admin-mcp",
      "env": {
        "GOOGLE_APPLICATION_CREDENTIALS": "/absolute/path/service-account.json",
        "WORKSPACE_ADMIN_SUBJECT": "admin@yourdomain.com",
        "WORKSPACE_READ_ONLY": "true"
      }
    }
  }
}
```

## Configuration

| Env var | Default | Meaning |
|---------|---------|---------|
| `GOOGLE_APPLICATION_CREDENTIALS` | — | Path to the DWD service-account key JSON |
| `WORKSPACE_ADMIN_SUBJECT` | — | Admin user to impersonate |
| `WORKSPACE_CUSTOMER_ID` | `my_customer` | Resolves to the admin's own domain |
| `WORKSPACE_READ_ONLY` | `true` | When true, all writes are refused |
| `WORKSPACE_DRY_RUN` | `true` | When true, enabled writes are simulated |
| `MCP_TRANSPORT` | `stdio` | `stdio` locally, `streamable-http` on Cloud Run |

## Deploy (optional)

The repo ships a `Dockerfile` and reference **Terraform** for Cloud Run (private ingress, least-privilege runtime SA, key mounted from Secret Manager). See [`terraform/`](terraform/). This is reference IaC — it only runs if *you* apply it against a project you own.

```bash
docker build -t workspace-admin-mcp .
```

## Security

- Writes off by default; dry-run by default; explicit opt-in for both.
- Least-privilege scopes (read scopes only unless writes are enabled).
- No credentials in the image or repo; `.gitignore` blocks key files.
- Structured audit trail suitable for shipping to Cloud Logging.

## Roadmap & limitations

This is v0.1 — the logic is complete and unit-tested; the live Admin SDK layer,
pagination, and HTTP-transport auth are the next steps. See [ROADMAP.md](ROADMAP.md).

## License

MIT — see [LICENSE](LICENSE).
