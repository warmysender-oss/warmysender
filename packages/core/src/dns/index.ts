export { DKIM_SELECTORS, dkimHost } from "./selectors.js"
export type { DkimSelector } from "./selectors.js"
export {
  buildDeliverabilityReport,
  evaluateDkimSelector,
  evaluateDmarc,
  evaluateMx,
  evaluateSpf,
  joinTxt,
  launchWarningFor,
  summarizeDkim,
} from "./evaluate.js"
export { checkDeliverability, createNodeDnsResolver, normalizeDomain } from "./lookup.js"
export type {
  CheckCode,
  CheckStatus,
  DeliverabilityCheck,
  DeliverabilityReport,
  DkimSelectorHit,
  DnsResolver,
} from "./types.js"
