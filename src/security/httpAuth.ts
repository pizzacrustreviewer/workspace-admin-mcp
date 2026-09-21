import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import * as z from "zod/v4";

const HttpsUrl = z.url().refine((value) => {
  const url = new URL(value);
  return url.protocol === "https:" && !url.username && !url.password && !url.hash && !url.search;
}, "A trusted HTTPS URL without credentials, query or fragment is required");

const Settings = z.object({
  resourceUrl: HttpsUrl.refine((value) => new URL(value).pathname === "/mcp"),
  issuer: HttpsUrl,
  jwksUrl: HttpsUrl,
  allowedSubjects: z.array(z.string().trim().min(1).max(256)).min(1)
});
export type HttpAuthConfig = z.infer<typeof Settings>;
export interface Principal { subject: string; scopes: string[]; }

export function loadHttpAuthConfig(env: NodeJS.ProcessEnv = process.env): HttpAuthConfig {
  return Settings.parse({
    resourceUrl: env.WORKSPACE_MCP_RESOURCE_URL,
    issuer: env.WORKSPACE_MCP_OAUTH_ISSUER,
    jwksUrl: env.WORKSPACE_MCP_OAUTH_JWKS_URL,
    allowedSubjects: env.WORKSPACE_MCP_ALLOWED_SUBJECTS?.split(",")
  });
}

export function createTokenVerifier(config: HttpAuthConfig, key?: JWTVerifyGetKey) {
  const settings = Settings.parse(config);
  const resolveKey = key ?? createRemoteJWKSet(new URL(settings.jwksUrl), { timeoutDuration: 5000 });
  return async (token: string): Promise<Principal> => {
    const { payload } = await jwtVerify(token, resolveKey, {
      issuer: settings.issuer, audience: settings.resourceUrl,
      algorithms: ["RS256", "ES256"], typ: "at+jwt",
      requiredClaims: ["exp", "sub", "iat", "client_id", "jti"], maxTokenAge: "15m"
    });
    if (!payload.sub || typeof payload.client_id !== "string" || !payload.client_id ||
        typeof payload.jti !== "string" || !payload.jti || typeof payload.scope !== "string" ||
        !settings.allowedSubjects.includes(payload.sub)) {
      throw new Error("Unauthorized principal");
    }
    return { subject: payload.sub, scopes: payload.scope.split(" ").filter(Boolean) };
  };
}
