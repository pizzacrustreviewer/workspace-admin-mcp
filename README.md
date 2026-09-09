# Google Workspace MCP Admin Server

A read-only Model Context Protocol server for investigating privileged Google Workspace users through narrow, policy-scoped tools.

The server treats model-driven administration as distributed systems work. MCP is the tool boundary, OAuth/OIDC is the authority boundary, a gateway is defense in depth, and OpenTelemetry connects the execution path without recording Workspace content.

## Current Status

This is a prototype, not a credential-isolated enterprise deployment. The
[2026-09-09 design review](docs/DESIGN_REVIEW_2026-09-09.md) records the findings and
their resolution status. Audit-selector, tool-error disclosure, and review pagination
fixes now have stdio wire regressions. Tool restrictions still do not contain an
agent host that can access the Google credential. Live Google validation is pending.

Version 0.2 is a local stdio server with explicit MCP 2026-07-28 negotiation through the official TypeScript SDK. It also accepts legacy 2025-era stdio clients.

Implemented:

- profile-scoped tool discovery with a second authorization check at invocation
- minimum Google OAuth scopes derived from the final exposed tool set
- exact user, group, membership, and bounded Admin audit reads
- structured MCP outputs with pagination and completeness markers
- deterministic privileged-user findings based on provider evidence
- W3C `traceparent` propagation across MCP, policy, and Google API spans
- content-free telemetry and redacted structured logs
- provider-boundary, policy, trace, mapping, and redaction tests

Not implemented:

- remote stateless HTTP
- inbound OAuth resource-server validation
- gateway deployment policy
- delegated or on-behalf-of token exchange
- durable idempotency and approval-gated writes

Those boundaries are specified in [Enterprise Runtime](docs/ENTERPRISE_RUNTIME.md) and sequenced in the [Roadmap](docs/ROADMAP.md).

The original Python implementation remains available at the `python-v0.1` tag.

## Admin Workflow

The smallest coherent workflow is a privileged-user investigation:

```text
identify subject
  -> inspect exact user
  -> inspect group memberships
  -> search a bounded Admin audit window
  -> return evidence and page completeness
  -> flag only deterministic privilege-state conflicts
```

`workspace_privileged_user_review` composes that workflow without exposing the broader inventory catalog under the default `risk` profile.

## Tools

| Tool | Purpose |
| --- | --- |
| `workspace_privileged_user_review` | Review one user's privilege state, memberships, and bounded Admin activity. |
| `workspace_user_get` | Retrieve one user by email, alias, or immutable ID. |
| `workspace_user_memberships_list` | List groups containing one user. |
| `workspace_group_members_list` | List direct members of one group using a dedicated member-read scope. |
| `workspace_users_list` | List a bounded page of users. |
| `workspace_groups_list` | List a bounded page of groups. |
| `workspace_admin_activity_search` | Search Admin actions performed by one user within a maximum 31-day window, not actions targeting that user. |

List tools return this explicit page contract:

```json
{
  "items": [],
  "resultCount": 0,
  "nextPageToken": "opaque-provider-token",
  "complete": false
}
```

Audit event parameters are excluded by default. Callers must explicitly request them with `includeParameters: true`.

Under `risk`, continue review evidence with `membershipPageToken` and
`activityPageToken`, using the respective result's `nextPageToken`. Keep the subject,
window, and limits unchanged. Omitted tokens fetch first pages; results describe the
current pages, not an accumulated investigation or a consistent provider snapshot.

## Security Profiles

| Profile | Discoverable tools |
| --- | --- |
| `risk` | `workspace_privileged_user_review` |
| `inventory` | User, group, and membership inspection tools |
| `audit` | `workspace_admin_activity_search` |
| `full-readonly` | Every read-only tool |

`WORKSPACE_MCP_ALLOWED_TOOLS` can narrow a profile but cannot expand it. `WORKSPACE_MCP_GRANTED_SCOPES` is also an upper bound. The server removes unused grants before creating the Google credential.

See the full [Tool Catalog](docs/TOOL_CATALOG.md) and [Agent Containment Model](docs/AGENT_CONTAINMENT.md).

## Quick Start

Requirements:

- Node.js 22 or newer
- a Google Cloud service account configured for Workspace domain-wide delegation
- a delegated administrator subject authorized only for the required read scopes

```bash
npm ci
npm run typecheck
npm test
npm run build
npm run dev
```

Copy the variable names from `.env.example` into the process environment. The server does not load `.env` files automatically.

Example MCP client configuration after `npm run build`:

```json
{
  "mcpServers": {
    "workspace-admin": {
      "command": "node",
      "args": ["/absolute/path/to/workspace-admin-mcp/dist/index.js"],
      "env": {
        "GOOGLE_WORKSPACE_CUSTOMER_ID": "my_customer",
        "GOOGLE_WORKSPACE_DELEGATED_ADMIN": "admin@example.com",
        "GOOGLE_SERVICE_ACCOUNT_EMAIL": "workspace-admin@example-project.iam.gserviceaccount.com",
        "GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY": "-----BEGIN PRIVATE KEY-----\\n...\\n-----END PRIVATE KEY-----\\n"
      }
    }
  }
}
```

## Observability

Normal `dev` and `start` commands do not install an exporter. To export manual spans to an OTLP collector:

```powershell
$env:OTEL_EXPORTER_OTLP_TRACES_ENDPOINT="http://localhost:4318/v1/traces"
npm run dev:traced
```

Span attributes are allowlisted operational metadata: tool name, policy decision, provider operation, result count, completeness, and error type. Prompts, tool arguments, emails, tokens, page tokens, and response bodies are excluded. Only `traceparent` is accepted from inbound MCP metadata; `tracestate` and baggage are dropped.

## Design Documents

- [Architecture](docs/ARCHITECTURE.md)
- [Security](docs/SECURITY.md)
- [Agent Containment](docs/AGENT_CONTAINMENT.md)
- [Enterprise Runtime](docs/ENTERPRISE_RUNTIME.md)
- [Roadmap](docs/ROADMAP.md)
