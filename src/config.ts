import * as z from "zod/v4";
import {
  parseToolNames,
  parseToolScopes,
  SecurityProfileSchema,
  ToolNameSchema,
  ToolScopeSchema
} from "./security/toolPolicy.js";

const ConfigSchema = z.object({
  customerId: z.string().min(1),
  delegatedAdmin: z.email(),
  serviceAccountEmail: z.email(),
  serviceAccountPrivateKey: z.string().min(1),
  securityProfile: SecurityProfileSchema.default("risk"),
  allowedTools: z.array(ToolNameSchema).optional(),
  grantedScopes: z.array(ToolScopeSchema).optional(),
  logLevel: z.enum(["debug", "info", "warn", "error"]).default("info")
});

export type AppConfig = z.infer<typeof ConfigSchema>;

export function loadPolicyConfig(env: NodeJS.ProcessEnv = process.env) {
  return {
    profile: SecurityProfileSchema.parse(env.WORKSPACE_MCP_SECURITY_PROFILE ?? "risk"),
    allowedTools: parseToolNames(env.WORKSPACE_MCP_ALLOWED_TOOLS),
    grantedScopes: parseToolScopes(env.WORKSPACE_MCP_GRANTED_SCOPES)
  };
}

export function assertSyntheticStdio(env: NodeJS.ProcessEnv = process.env): void {
  if ((env.WORKSPACE_MCP_DATA_SOURCE ?? "synthetic") !== "synthetic" ||
      env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY !== undefined ||
      env.GOOGLE_APPLICATION_CREDENTIALS !== undefined) {
    throw new Error("STDIO_SYNTHETIC_ONLY");
  }
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return ConfigSchema.parse({
    customerId: env.GOOGLE_WORKSPACE_CUSTOMER_ID ?? "my_customer",
    delegatedAdmin: env.GOOGLE_WORKSPACE_DELEGATED_ADMIN,
    serviceAccountEmail: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    serviceAccountPrivateKey: normalizePrivateKey(env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY),
    securityProfile: env.WORKSPACE_MCP_SECURITY_PROFILE ?? "risk",
    allowedTools: parseToolNames(env.WORKSPACE_MCP_ALLOWED_TOOLS),
    grantedScopes: parseToolScopes(env.WORKSPACE_MCP_GRANTED_SCOPES),
    logLevel: env.LOG_LEVEL ?? "info"
  });
}

function normalizePrivateKey(value: string | undefined): string | undefined {
  return value?.replace(/\\n/g, "\n");
}
