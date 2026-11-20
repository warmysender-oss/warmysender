import { sanitizeHtml } from "./html.js";
import type { CampaignState } from "./launch-check.js";
import type { StepContentType } from "./template.js";

export type StepDraft = {
  id: string;
  position: number;
  subject: string;
  body: string;
  delayDays: number;
  contentType: StepContentType;
};

export function assertStructureEditable(
  state: CampaignState,
): { ok: true } | { ok: false; error: string } {
  if (state === "draft" || state === "paused") return { ok: true };
  if (state === "running") {
    return { ok: false, error: "Pause the campaign before changing steps, mailboxes, or audience." };
  }
  return { ok: false, error: "Completed campaigns cannot be edited." };
}

export function assertDeletable(state: CampaignState): { ok: true } | { ok: false; error: string } {
  if (state === "draft") return { ok: true };
  return { ok: false, error: "Only a draft campaign can be deleted." };
}

export function cleanCampaignName(name: string): { ok: true; name: string } | { ok: false; error: string } {
  const cleaned = name.trim().replace(/\s+/g, " ");
  if (cleaned.length === 0) return { ok: false, error: "Give the campaign a name." };
  if (cleaned.length > 120) return { ok: false, error: "Campaign name must be 120 characters or fewer." };
  return { ok: true, name: cleaned };
}

export function cleanDelay(delayDays: number): { ok: true; delayDays: number } | { ok: false; error: string } {
  if (typeof delayDays !== "number" || !Number.isInteger(delayDays) || delayDays < 0) {
    return { ok: false, error: "Delay must be a whole number of days, zero or more." };
  }
  return { ok: true, delayDays };
}

export function cleanContentType(
  contentType: string,
): { ok: true; contentType: StepContentType } | { ok: false; error: string } {
  if (contentType === "html") return { ok: true, contentType: "html" };
  if (contentType === "text") return { ok: true, contentType: "text" };
  return { ok: false, error: "Content type must be text or html." };
}

export function cleanStepBody(body: string, contentType: StepContentType): string {
  return contentType === "html" ? sanitizeHtml(body) : body;
}

/** After a delete or insert, positions are 1..n and step 1 delay is 0. */
export function renumberSteps(steps: StepDraft[]): StepDraft[] {
  return [...steps]
    .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id))
    .map((step, index) => ({
      ...step,
      position: index + 1,
      delayDays: index === 0 ? 0 : step.delayDays,
    }));
}

export function uniqueIds(ids: string[]): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const id of ids) {
    const trimmed = id.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    ordered.push(trimmed);
  }
  return ordered;
}
