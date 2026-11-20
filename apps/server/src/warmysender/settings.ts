import { WarmySenderApiError, createWarmySenderClient, type FetchLike } from "./client.js";
import { connectUrl, type ConnectFeature } from "./links.js";

export type WarmySenderKeyStore = {
  getKey(): Promise<string | null>;
  setKey(key: string | null): Promise<void>;
};

export type WarmySenderConnection =
  | { connected: false }
  | { connected: true; can_verify_now: boolean; verifiable_now: number; access_source: string };

const KEY_PATTERN = /^ws_\S+$/;

export function assertWarmySenderKeyShape(apiKey: string): string {
  const trimmed = apiKey.trim();
  if (!KEY_PATTERN.test(trimmed)) {
    throw new KeyShapeError("A WarmySender API key starts with ws_.");
  }
  return trimmed;
}

export class KeyShapeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KeyShapeError";
  }
}

/** Calls GET /verification/allowance (a free read) and stores the key only when that succeeds. */
export async function connectWarmySender(
  store: WarmySenderKeyStore,
  apiKey: string,
  deps?: { fetchImpl?: FetchLike },
): Promise<WarmySenderConnection> {
  const key = assertWarmySenderKeyShape(apiKey);
  const client = createWarmySenderClient({ apiKey: key, fetchImpl: deps?.fetchImpl });
  try {
    const allowance = await client.getVerificationAllowance();
    await store.setKey(key);
    return {
      connected: true,
      can_verify_now: allowance.can_verify_now,
      verifiable_now: allowance.verifiable_now,
      access_source: allowance.access_source,
    };
  } catch (error) {
    if (error instanceof WarmySenderApiError && error.status === 401) {
      throw new KeyShapeError("WarmySender rejected that API key.");
    }
    throw error;
  }
}

export async function disconnectWarmySender(store: WarmySenderKeyStore): Promise<{ connected: false }> {
  await store.setKey(null);
  return { connected: false };
}

export async function warmySenderStatus(store: WarmySenderKeyStore): Promise<{ connected: boolean }> {
  const key = await store.getKey();
  return { connected: key !== null && key.length > 0 };
}

export function connectCard(feature: ConnectFeature): { feature: ConnectFeature; href: string; label: string } {
  return {
    feature,
    href: connectUrl(feature),
    label: "Connect WarmySender (free trial)",
  };
}
