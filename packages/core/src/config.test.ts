import { describe, expect, it } from "vitest";
import { ConfigError, DEV_ENCRYPTION_KEY, DEV_SESSION_SECRET, loadConfig } from "./config.js";

const KEY = Buffer.alloc(32, 0x11).toString("base64");

function validEnv(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    DATABASE_URL: "postgres://warmysender:warmysender@localhost:5432/warmysender",
    ENCRYPTION_KEY: KEY,
    SESSION_SECRET: "test-session-secret-at-least-32-chars",
    PUBLIC_URL: "http://localhost:3000",
    NODE_ENV: "test",
    ...overrides,
  };
}

describe("loadConfig", () => {
  it("names every missing required variable", () => {
    expect(() => loadConfig({})).toThrow(ConfigError);
    try {
      loadConfig({});
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      expect(message).toContain("DATABASE_URL");
      expect(message).toContain("ENCRYPTION_KEY");
      expect(message).toContain("SESSION_SECRET");
      expect(message).toContain("PUBLIC_URL");
    }
  });

  it("rejects a key that is not 32 bytes", () => {
    expect(() => loadConfig(validEnv({ ENCRYPTION_KEY: "too-short" }))).toThrow(/ENCRYPTION_KEY/);
  });

  it("rejects a short session secret", () => {
    expect(() => loadConfig(validEnv({ SESSION_SECRET: "short" }))).toThrow(/SESSION_SECRET/);
  });

  it("defaults MS_TENANT to common and strips a trailing slash on PUBLIC_URL", () => {
    const config = loadConfig(validEnv({ PUBLIC_URL: "http://localhost:3000/" }));
    expect(config.msTenant).toBe("common");
    expect(config.msClientId).toBeNull();
    expect(config.publicUrl).toBe("http://localhost:3000");
    expect(config.port).toBe(3000);
    expect(config.encryptionKey).toHaveLength(32);
  });

  it("requires both Microsoft credentials", () => {
    expect(() => loadConfig(validEnv({ MS_CLIENT_ID: "app-id" }))).toThrow(/MS_CLIENT_ID/);
  });

  it("refuses the development secrets in production", () => {
    expect(() =>
      loadConfig(
        validEnv({
          NODE_ENV: "production",
          ENCRYPTION_KEY: DEV_ENCRYPTION_KEY,
          SESSION_SECRET: DEV_SESSION_SECRET,
        }),
      ),
    ).toThrow(/production/);
  });

  it("allows the development secrets outside production and flags them", () => {
    const config = loadConfig(
      validEnv({
        NODE_ENV: "development",
        ENCRYPTION_KEY: DEV_ENCRYPTION_KEY,
        SESSION_SECRET: DEV_SESSION_SECRET,
      }),
    );
    expect(config.usingDevSecrets).toBe(true);
  });
});
