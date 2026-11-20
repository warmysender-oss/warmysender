import type { Response } from "express";
import { parseCookie, stringifySetCookie } from "cookie";
import type { Config } from "@warmysender/core";

export const SESSION_COOKIE = "ws_session";
export const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

export function readSessionCookie(header: string | undefined): string | null {
  if (!header) return null;
  const value = parseCookie(header)[SESSION_COOKIE];
  return value && value.length > 0 ? value : null;
}

function cookieOptions(config: Config) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: config.publicUrl.startsWith("https://"),
    path: "/",
  };
}

export function setSessionCookie(res: Response, token: string, config: Config): void {
  res.append(
    "Set-Cookie",
    stringifySetCookie({
      name: SESSION_COOKIE,
      value: token,
      maxAge: SESSION_MAX_AGE_SECONDS,
      ...cookieOptions(config),
    }),
  );
}

export function clearSessionCookie(res: Response, config: Config): void {
  res.append(
    "Set-Cookie",
    stringifySetCookie({
      name: SESSION_COOKIE,
      value: "",
      maxAge: 0,
      ...cookieOptions(config),
    }),
  );
}
