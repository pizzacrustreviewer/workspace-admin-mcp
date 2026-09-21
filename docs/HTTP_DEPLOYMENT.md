# HTTP Service Setup

This is an experimental single-tenant resource server, not an OAuth issuer or a
production deployment package. Start with synthetic data. Live IdP integration,
Google integration, and credential isolation still need deployment-level testing.

## Trust Boundary

```text
agent + MCP access token
  -> HTTPS reverse proxy
  -> loopback HTTP resource server
  -> JWT verification + scoped tool policy
  -> separate Google credential (service host only)
```

The agent must not have shell access to the service identity, its secret storage,
or Google signing permissions. Running both processes under the same OS identity
does not provide this boundary. Local stdio is synthetic-only and rejects Google
private-key and application-credential environment variables.

## Configure the Issuer

Use an existing authorization server that issues JWT access tokens for this resource.
Configure its OAuth client and authorization flow separately. Generic OIDC sign-in
or a Google access token is not sufficient. This implementation accepts:

- A signed `at+jwt` token using RS256 or ES256, verified against the configured JWKS.
- An exact configured `iss` and the MCP resource URL in `aud`.
- Required `exp`, `iat`, `sub`, `client_id`, and `jti` claims; `nbf` when present.
- Tokens issued within the last 15 minutes and not expired.
- A `sub` in the service's explicit approved-subject list.
- A space-delimited `scope` containing this server's internal tool scopes.

For the default `risk` profile, all three scopes are needed:

```text
workspace.users.read workspace.groups.read workspace.audit.read
```

The server intersects token scopes with configured profile/tool/scope limits on
every request, including discovery. An empty intersection returns 403. Unknown
configured tool/scope names fail startup; explicitly empty configuration denies
all. Incoming tokens are never passed to Google. The Google credential receives
only the Google scopes required by the narrowed tool set.

Approved callers can currently inspect any subject reachable through their tools
in the one configured tenant. There are no per-investigation subject, field, time,
or atomic budget grants. `jti` is required but is not a one-use token/replay store.

## Run the Service

Set the variables in `.env.example` on the isolated service host. Use an exact
HTTPS resource URL ending in `/mcp`, a trusted issuer/JWKS URL, and approved subject
IDs. Keep `WORKSPACE_MCP_DATA_SOURCE=synthetic` until integration is authorized.

```bash
npm ci
npm run build
node --env-file=.env dist/http.js
```

The listener binds only to `127.0.0.1`, default port 3000. Terminate TLS at a reverse
proxy on that service host. Preserve the public `Host` header and route `/mcp` and
`/.well-known/oauth-protected-resource/mcp`. Do not expose the listener directly.
The server rejects other Hosts and any Origin other than the resource origin;
cross-origin browser clients and CORS preflight are not supported.

Connect the MCP client to the HTTPS `/mcp` URL using its supported OAuth flow.
Clients discover the resource and issuer via the 401 `WWW-Authenticate` challenge
and protected-resource metadata. This server does not implement client registration,
token issuance, or refresh. Those depend on the issuer and client. Do not put a
Google key in client configuration.

HTTP accepts POST requests with JSON bodies up to 64 KiB. Use the SDK's modern
per-request envelope and method/tool headers, or its legacy stateless HTTP mode.
There are no server sessions, subscriptions, or unsolicited event streams. Verify
your actual client's compatibility before declaring deployment support.

For an authorized Google test tenant, set `WORKSPACE_MCP_DATA_SOURCE=google` and
the four Google variables documented in `.env.example` on the service only. This
uses a service account with domain-wide delegation to one administrator; it is not
per-caller Google delegation or token exchange. Limit the account's authorized
Google scopes and administrator privileges independently of MCP policy.

## Remaining Deployment Requirements

Request-body size and header/upload timeouts are enforced, but provider execution
deadlines, bounded retries, concurrency quotas, protected principal audit storage,
egress restrictions, and full incident procedures remain open. The verified caller
is used for admission, not persisted as an audit record. Traces are not audit logs.
Configure the proxy to avoid recording Authorization headers or sensitive bodies.

Synthetic signed-token and actual loopback HTTP tests verify application behavior.
They do not prove a real IdP flow, TLS configuration, client interoperability,
Google access, or that an agent cannot read deployment credentials. See
[Validation](VALIDATION.md) and [Roadmap](ROADMAP.md).
