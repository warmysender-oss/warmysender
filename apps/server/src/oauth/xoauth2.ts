/** SASL XOAUTH2 initial client response, base64-encoded. */
export function buildXoauth2InitialResponse(user: string, accessToken: string): string {
  const raw = `user=${user}\u0001auth=Bearer ${accessToken}\u0001\u0001`
  return Buffer.from(raw, "utf8").toString("base64")
}
