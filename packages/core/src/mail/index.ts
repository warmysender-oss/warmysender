export {
  AUTH_FAILURES_BEFORE_PAUSE,
  RECONNECT_MESSAGE,
  applyAuthResult,
  clearAuthPause,
  initialAuthHealth,
  shouldAttemptLogin,
} from "./auth-health.js"
export type { AuthChannel, AuthHealth } from "./auth-health.js"
export { plainConnectionError } from "./errors.js"
export type { ConnectionErrorLike } from "./errors.js"
export {
  DAILY_CAP_DEFAULT,
  DAILY_CAP_HARD_MAX,
  DAILY_CAP_HARD_MIN,
  FROM_NAME_MAX_CHARS,
  GAP_DEFAULT_MAX_MINUTES,
  GAP_DEFAULT_MIN_MINUTES,
  GAP_HARD_MIN_MINUTES,
  SIGNATURE_MAX_CHARS,
  parseStrictInt,
  requireValidDailyCap,
  validateDailyCap,
  validateGapPair,
} from "./limits.js"
export {
  MAIL_PRESETS,
  MICROSOFT_IMAP,
  MICROSOFT_SMTP,
  findPreset,
  listPresets,
  spfExampleForPreset,
} from "./presets.js"
export { RAMP_EARLY_CAP, RAMP_EARLY_DAYS, RAMP_MID_CAP, RAMP_MID_DAYS, effectiveDailyCap, rampDayNumber, todayInTimeZone } from "./ramp.js"
export type { EffectiveCap } from "./ramp.js"
export { openSecrets, packSecrets, sealSecrets, unpackSecrets } from "./secrets.js"
export type { SecretCodec } from "./secrets.js"
export {
  MAIL_PRESET_IDS,
  MAIL_PROVIDERS,
  SOCKET_SECURITIES,
  WEEKDAYS,
} from "./types.js"
export type {
  FieldError,
  MailPreset,
  MailPresetId,
  MailProvider,
  MailboxSecretPayload,
  MailboxSettings,
  MicrosoftSecretPayload,
  ServerEndpoint,
  SmtpSecretInput,
  SocketSecurity,
  Weekday,
} from "./types.js"
export { domainFromEmail, validateMailboxSettings, validateSmtpPasswords } from "./validate.js"
export type { MailboxDraftInput } from "./validate.js"
export {
  DEFAULT_SENDING_DAYS,
  DEFAULT_TIME_ZONE,
  DEFAULT_WINDOW_END,
  DEFAULT_WINDOW_START,
  isInsideSendingWindow,
  isValidTimeZone,
  parseClock,
  parseSendingWindow,
} from "./window.js"
export type { SendingWindow } from "./window.js"
