# Roadmap & Known Limitations

`workspace-admin-mcp` is at **v0.1**: the design, guardrails, tool surface, and
business logic are complete and unit-tested. The items below are deliberately
scoped out of the first cut and are the natural next steps before production use.

## Known limitations

- **Admin SDK integration is not yet covered by automated tests.** The logic
  layer (guardrails, audit, tool orchestration) is fully unit-tested against an
  in-memory fake client, but the live Google API calls in `auth.py`
  (`WorkspaceDirectory._service` and the method wrappers) should be validated
  against a real **developer** tenant before relying on them.
- **No pagination.** List operations return a single page (up to `max_results`).
  Large domains need `nextPageToken` iteration.
- **HTTP transport has no application-layer auth.** The Cloud Run path relies on
  network ingress controls (internal LB / IAP). There is no OAuth on the MCP
  endpoint itself.
- **Minimal API error handling.** API failures currently propagate as raw
  exceptions rather than typed, user-friendly tool errors.

## Roadmap

- [ ] Integration tests against a developer tenant (recorded + live)
- [ ] Pagination via `nextPageToken` on all list operations
- [ ] Application-layer auth (OAuth 2.1) for the HTTP/Cloud Run transport
- [ ] Retry/backoff and typed error surfaces around API calls
- [ ] Additional tools: OU management, license reporting, bulk CSV operations
- [ ] Optional per-tool scope narrowing (request only the scopes a session uses)

## Notes for reviewers

Start with `auth.py` — it's the only module that touches the network and the
only one not exercised by the unit tests. Verify Admin SDK parameter names and
response shapes against the current
[Directory API reference](https://developers.google.com/admin-sdk/directory/reference/rest).
