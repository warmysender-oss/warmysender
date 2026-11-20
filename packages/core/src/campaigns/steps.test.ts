import { describe, expect, it } from "vitest";
import { renumberSteps, type StepDraft } from "./steps.js";

const step = (overrides: Partial<StepDraft>): StepDraft => ({
  id: "step",
  position: 1,
  subject: "Hello",
  body: "Hi",
  delayDays: 0,
  contentType: "text",
  ...overrides,
});

describe("renumberSteps", () => {
  it("numbers steps from 1 and clears the delay on the new first step", () => {
    const steps = renumberSteps([
      step({ id: "b", position: 2, delayDays: 4 }),
      step({ id: "c", position: 3, delayDays: 2 }),
    ]);
    expect(steps.map((item) => [item.id, item.position, item.delayDays])).toEqual([
      ["b", 1, 0],
      ["c", 2, 2],
    ]);
  });
});