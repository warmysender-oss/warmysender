export { detectAutoReply } from "./auto-reply.js";
export { bracketMessageId, extractEmail, extractMessageIds, normalizeMessageId, normalizeSubject } from "./codec.js";
export { applyEffectPlan, decideInbound, effectPlan } from "./decide.js";
export { analyzeBounce, isPermanentFailure, recipientsFromPlainText } from "./dsn.js";
export { matchReply } from "./match-reply.js";
export { parseRawEmail } from "./parse-raw.js";
export { pollAllMailboxes } from "./poll-all.js";
export { ImapAuthError, pollMailbox } from "./poll.js";
export { INBOX_POLL_EVERY_MS, INBOX_POLL_JOB } from "./types.js";
export type {
  ContactEffect,
  InboundDecision,
  InboundKind,
  InboundMail,
  InboxEffect,
  ReplyMatch,
  SentMessageRef,
} from "./types.js";
