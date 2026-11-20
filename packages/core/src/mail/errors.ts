export type ConnectionErrorLike = {
  code?: string
  message?: string
  response?: string
  responseCode?: number
}

export function plainConnectionError(
  error: unknown,
  protocol: "SMTP" | "IMAP",
  secrets: readonly string[] = [],
): string {
  const detail = describeError(error)
  const code = detail.code.toUpperCase()
  const text = `${detail.message} ${detail.response}`.toLowerCase()
  let sentence: string
  if (isAuthFailure(code, text, detail.responseCode)) {
    sentence = `The ${protocol} server rejected the username or password. Check the username, and use an app password if the provider requires one.`
  } else if (code === "ENOTFOUND" || code === "EDNS" || code === "EAI_AGAIN" || text.includes("getaddrinfo")) {
    sentence = `The ${protocol} host name could not be found. Check it for a typo.`
  } else if (code === "ECONNREFUSED" || text.includes("econnrefused")) {
    sentence = `The ${protocol} server refused the connection. Check the host and port.`
  } else if (
    code === "ETIMEDOUT" ||
    code === "ESOCKET" ||
    code === "ECONNECTION" ||
    text.includes("timed out") ||
    text.includes("timeout")
  ) {
    sentence = `The ${protocol} server did not respond in time. Check the host, port, and security setting (SSL or STARTTLS).`
  } else if (
    text.includes("certificate") ||
    text.includes("self signed") ||
    text.includes("unable to verify") ||
    code.includes("CERT")
  ) {
    sentence = `The ${protocol} TLS certificate check failed. The security setting may not match the server.`
  } else {
    sentence = `The ${protocol} connection failed. Check the host, port, security, and password.`
  }
  const suffix = /^[A-Z0-9_]{2,40}$/.test(code) ? ` (${code})` : ""
  return redact(`${sentence}${suffix}`, secrets)
}

function isAuthFailure(code: string, text: string, responseCode: number | undefined): boolean {
  if (responseCode === 535 || responseCode === 534) return true
  if (code === "EAUTH" || code === "EAUTHENTICATION" || code === "AUTHENTICATIONFAILED") return true
  return (
    text.includes("authentication failed") ||
    text.includes("invalid credentials") ||
    text.includes("invalid login") ||
    text.includes("username and password not accepted") ||
    text.includes("authenticationfailed")
  )
}

function describeError(error: unknown): { code: string; message: string; response: string; responseCode?: number } {
  if (typeof error === "string") return { code: "", message: error, response: "" }
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>
    return {
      code: typeof record.code === "string" ? record.code : "",
      message: typeof record.message === "string" ? record.message : "",
      response: typeof record.response === "string" ? record.response : "",
      responseCode: typeof record.responseCode === "number" ? record.responseCode : undefined,
    }
  }
  return { code: "", message: "", response: "" }
}

function redact(message: string, secrets: readonly string[]): string {
  let output = message
  for (const secret of secrets) {
    if (secret.length < 4) continue
    output = output.split(secret).join("[redacted]")
  }
  return output
}
