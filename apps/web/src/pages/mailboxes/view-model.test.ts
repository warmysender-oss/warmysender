import { describe, expect, it } from "vitest"
import { capLine, microsoftButton } from "./view-model.js"

describe("mailbox page copy", () => {
  it("shows the ramp line and the reason Microsoft sign-in is off", () => {
    expect(capLine({ rampLabel: "Day 3 of ramp: 10 a day", effectiveDailyCap: 10, dailyCap: 30 })).toBe(
      "Day 3 of ramp: 10 a day",
    )
    expect(capLine({ rampLabel: null, effectiveDailyCap: 30, dailyCap: 30 })).toBe("30 a day (cap 30)")
    const button = microsoftButton({
      available: false,
      message: "Set MS_CLIENT_ID. Steps are in docs/MICROSOFT-APP.md.",
    })
    expect(button.available).toBe(false)
    expect(button.message).toContain("docs/MICROSOFT-APP.md")
  })
})
