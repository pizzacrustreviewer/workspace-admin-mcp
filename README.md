# Google Workspace MCP Admin Server

A read-only Model Context Protocol server for investigating privileged Google Workspace users through narrow, policy-scoped tools.

The server treats model-driven administration as distributed systems work. MCP is the tool boundary, OAuth/OIDC is the authority boundary, a gateway is defense in depth, and OpenTelemetry connects the execution path without recording Workspace content.

## Current Status

Experimental, read-only prototype. Local stdio is a credential-free synthetic demo.
The authenticated HTTP entrypoint can hold Google credentials on a separate service
host. Live Google and identity-provider integration have not yet been validated.
HTTP alone does not isolate credentials: the agent must not be able to access the
service's files, environment, or signing identity.

Version 0.2 uses the official TypeScript SDK for modern MCP and legacy stdio clients.

Implemented:

- profile-scoped tool discovery with a second authorization check at invocation
- minimum Google OAuth scopes derived from the final exposed tool set
- exact user, group, membership, and bounded Admin audit reads
- structured MCP outputs with pagination and completeness markers
- deterministic privileged-user findings based on provider evidence
- W3C `traceparent` propagation across MCP, policy, and Google API spans
- content-free telemetry and redacted structured logs
- provider-boundary, policy, trace, mapping, and redaction tests
- synthetic-only stdio, with startup rejection of Google key-bearing configurations
- stateless HTTP with per-request JWT access-token verification and scoped discovery
- OAuth protected-resource metadata, trusted Host/Origin checks, and bounded request bodies

Not implemented:

- demonstrated deployment isolation and live identity-provider integration
- per-investigation target/field grants and durable principal audit records
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
- no Google account, credential, or paid model is needed for the local demo

```bash
npm ci
npm run typecheck
npm test
npm run build
npm run dev
```

The stdio demo uses `admin@example.test` (or `synthetic-admin`) and an audit event
at `2026-09-01T12:00:00Z`. Use a window containing that time for the review tool.
It is fixed test data, not a live Workspace connection. Inventory queries and
unknown fixture subjects are rejected rather than simulated as successful reads.

Example MCP client configuration after `npm run build`:

```json
{
  "mcpServers": {
    "workspace-admin": {
      "command": "node",
      "args": ["/absolute/path/to/workspace-admin-mcp/dist/index.js"],
      "env": {
        "WORKSPACE_MCP_DATA_SOURCE": "synthetic"
      }
    }
  }
}
```

**Migration:** stdio no longer accepts live Google credentials. Remove Google keys
from MCP client configuration and its inherited environment. For the HTTP service,
see [HTTP Deployment](docs/HTTP_DEPLOYMENT.md). `.env.example` is service-side
configuration, not client configuration; environment files are not loaded automatically.

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
- [Validation](docs/VALIDATION.md)
