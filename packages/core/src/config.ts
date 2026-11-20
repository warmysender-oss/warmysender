import { Buffer } from "node:buffer";

/** Published in docker-compose.yml so a clean clone boots. Refused when NODE_ENV=production. */
export const DEV_ENCRYPTION_KEY = "ZGV2LW9ubHktbm90LWZvci1wcm9kdWN0aW9uLXVzZSE=";
export const DEV_SESSION_SECRET = "dev-only-session-secret-change!!";

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

export type NodeEnv = "development" | "production" | "test";

export type Config = {
  databaseUrl: string;
  encryptionKey: Buffer;
  sessionSecret: string;
  publicUrl: string;
  port: number;
  host: string;
  nodeEnv: NodeEnv;
  msClientId: string | null;
  msClientSecret: string | null;
  msTenant: string;
  usingDevSecrets: boolean;
};

export function decodeEncryptionKey(raw: string): Buffer | null {
  const trimmed = raw.trim();
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    return Buffer.from(trimmed, "hex");
  }
  const buf = Buffer.from(trimmed, "base64");
  if (buf.length !== 32) return null;
  const canonical = buf.toString("base64").replace(/=+$/, "");
  const given = trimmed.replace(/=+$/, "");
  if (canonical !== given) return null;
  return buf;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const errors: string[] = [];

  const databaseUrl = env.DATABASE_URL?.trim() ?? "";
  if (!databaseUrl) {
    errors.push(
      "DATABASE_URL is required. Example: postgres://warmysender:warmysender@localhost:5432/warmysender",
    );
  } else if (!/^postgres(ql)?:\/\//.test(databaseUrl)) {
    errors.push("DATABASE_URL must be a postgres:// or postgresql:// connection string.");
  }

  const encryptionRaw = env.ENCRYPTION_KEY?.trim() ?? "";
  let encryptionKey: Buffer | null = null;
  if (!encryptionRaw) {
    errors.push("ENCRYPTION_KEY is required. Generate one with: openssl rand -base64 32");
  } else {
    encryptionKey = decodeEncryptionKey(encryptionRaw);
    if (!encryptionKey) {
      errors.push(
        "ENCRYPTION_KEY must be 32 bytes, as base64 (openssl rand -base64 32) or 64 hex characters.",
      );
    }
  }

  const sessionSecret = env.SESSION_SECRET?.trim() ?? "";
  if (!sessionSecret) {
    errors.push("SESSION_SECRET is required. Generate one with: openssl rand -base64 32");
  } else if (sessionSecret.length < 32) {
    errors.push("SESSION_SECRET must be at least 32 characters. Generate one with: openssl rand -base64 32");
  }

  const publicRaw = env.PUBLIC_URL?.trim() ?? "";
  let publicUrl = "";
  if (!publicRaw) {
    errors.push("PUBLIC_URL is required. Example: http://localhost:3000");
  } else {
    try {
      const url = new URL(publicRaw);
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        throw new Error("protocol");
      }
      publicUrl = publicRaw.replace(/\/+$/, "");
    } catch {
      errors.push("PUBLIC_URL must be an absolute http(s) URL, for example http://localhost:3000.");
    }
  }

  const portRaw = env.PORT?.trim() || "3000";
  const port = Number(portRaw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    errors.push("PORT must be an integer from 1 to 65535.");
  }

  const host = env.HOST?.trim() || "0.0.0.0";
  if (!host) {
    errors.push("HOST must not be empty when it is set.");
  }

  const nodeEnvRaw = env.NODE_ENV?.trim() || "development";
  if (nodeEnvRaw !== "development" && nodeEnvRaw !== "production" && nodeEnvRaw !== "test") {
    errors.push("NODE_ENV must be development, production, or test.");
  }
  const nodeEnv = nodeEnvRaw as NodeEnv;

  const msClientId = env.MS_CLIENT_ID?.trim() || "";
  const msClientSecret = env.MS_CLIENT_SECRET?.trim() || "";
  if ((msClientId && !msClientSecret) || (!msClientId && msClientSecret)) {
    errors.push("MS_CLIENT_ID and MS_CLIENT_SECRET must both be set, or both left empty.");
  }
  const msTenant = env.MS_TENANT?.trim() || "common";
  if (!/^[A-Za-z0-9.-]+$/.test(msTenant)) {
    errors.push("MS_TENANT must be common, organizations, consumers, or a directory tenant id.");
  }

  const usingDevSecrets = encryptionRaw === DEV_ENCRYPTION_KEY || sessionSecret === DEV_SESSION_SECRET;
  if (nodeEnv === "production" && usingDevSecrets) {
    errors.push(
      "Refusing to start in production with the development ENCRYPTION_KEY or SESSION_SECRET from docker-compose.yml. Set unique values.",
    );
  }

  if (errors.length > 0 || !encryptionKey) {
    throw new ConfigError(`Invalid environment:\n- ${errors.join("\n- ")}`);
  }

  return {
    databaseUrl,
    encryptionKey,
    sessionSecret,
    publicUrl,
    port,
    host,
    nodeEnv,
    msClientId: msClientId || null,
    msClientSecret: msClientSecret || null,
    msTenant,
    usingDevSecrets,
  };
}
