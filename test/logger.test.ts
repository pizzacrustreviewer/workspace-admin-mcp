import { describe, expect, it } from "vitest";
import { redact } from "../src/logger.js";

describe("redact", () => {
  it("redacts emails nested in objects", () => {
    expect(
      redact({
        actor: "admin@example.com",
        nested: { user: "person@example.org" }
      })
    ).toEqual({
      actor: "[REDACTED_EMAIL]",
      nested: { user: "[REDACTED_EMAIL]" }
    });
  });

  it("redacts private key fields", () => {
    expect(
      redact({
        serviceAccountPrivateKey: "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----"
      })
    ).toEqual({
      serviceAccountPrivateKey: "[REDACTED]"
    });
  });
});
