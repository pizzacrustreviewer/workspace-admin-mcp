# Validation

## Automated Checks

Run from the repository root after installing dependencies:

```bash
npm run typecheck
npm test
npm run build
```

The tests use synthetic data and injected providers; no Google credentials are
required. Coverage includes:

- Profile-based tool discovery and invocation denial.
- Internal-to-Google scope derivation.
- Provider response mapping and pagination markers.
- Rejection of aggregate actors in single-user audit operations.
- Independent continuation of membership and audit evidence pages.
- Sanitized tool failures and output validation.
- Log redaction and trace propagation through the Google adapter.
- JSON-RPC framing and SDK dispatch over stdio streams for MCP 2025-11-25 and
  2026-07-28. These are in-process transport tests, not live-client certification.

## Limits of the Evidence

Passing these checks does not establish live Google compatibility, credential
isolation, remote authorization, or production readiness. Dedicated-tenant
integration tests and deployment-level security tests remain release requirements
in the [roadmap](ROADMAP.md).

Development includes AI-assisted coding and review. This is not an independent
security audit; implementation claims must be supported by reproducible checks.
