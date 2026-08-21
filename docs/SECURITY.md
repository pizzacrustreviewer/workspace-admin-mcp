# Security

## Current Posture

- Read-only Google scopes and no mutation tools
- Restricted default tool catalog
- Tool discovery and invocation checks enforced by server policy
- Google scopes narrowed to the final exposed tools
- Dedicated scope for group membership reads
- Bounded pages and subject-scoped audit windows
- Audit parameters excluded by default
- Structured outputs with completeness markers
- Redacted JSON logs
- Content-free OpenTelemetry attributes
- Inbound `tracestate` and baggage dropped
- Zod validation for every MCP input and output

## Required Google Scopes

Authorize only the scopes required by the selected profile:

```text
https://www.googleapis.com/auth/admin.directory.user.readonly
https://www.googleapis.com/auth/admin.directory.group.readonly
https://www.googleapis.com/auth/admin.directory.group.member.readonly
https://www.googleapis.com/auth/admin.reports.audit.readonly
```

The `risk` profile does not require the group-member scope because its membership lookup uses `groups.list` for one user.

## Threat Model

| Risk | Current mitigation |
| --- | --- |
| Model attempts an identity or access change | No write tools exist. |
| Broad catalog increases accidental tool use | Profile-disallowed tools are absent from discovery. |
| Config grants unnecessary provider scopes | Scopes are recalculated from the final exposed catalog. |
| Google data leaks through logs or traces | Logs redact emails and credentials; spans contain allowlisted operational metadata only. |
| Trace metadata changes authorization | Trace context is correlation-only; only `traceparent` is accepted. |
| Audit search becomes a bulk export | A subject and maximum 31-day window are required; page size is capped. |
| Partial provider data is mistaken for complete | Results expose `nextPageToken` and `complete`. |
| Model invents security severity | Findings use deterministic provider evidence. |

## Identity Limitation

The local stdio process uses one configured delegated administrator subject. That is acceptable for a local single-operator demonstration, not for a multi-user remote service.

A remote deployment must validate the inbound issuer, audience/resource, expiry, tenant, principal, and scopes on every request. The inbound MCP token must never be passed to Google. Outbound access requires a separately audience-bound credential and an audit record that preserves the initiating principal.

## Data Handling

All tool outputs are sensitive Workspace administration data. Do not send them to public logs, public model evaluation datasets, or telemetry exporters.
