import { describe, expect, test } from "bun:test"
import { IDLE_USAGE_RESET, transitionUsageReset, type UsageResetEvent, type UsageResetState } from "./machine"

const replay = (events: UsageResetEvent[], state: UsageResetState = IDLE_USAGE_RESET) =>
  events.reduce((value, event) => transitionUsageReset(value, event), state)

describe("usage reset", () => {
  test("a press claims the work, and only a result while working lands", () => {
    expect(replay([{ type: "reset.requested" }])).toEqual({ status: "working" })

    const started = replay([{ type: "reset.requested" }, { type: "reset.started" }])
    expect(started).toEqual({ status: "restarting" })

    // A late failure cannot pull a reset that already succeeded back out of its restart.
    expect(transitionUsageReset(started, { type: "reset.failed", reason: "verify" })).toBe(started)
  })

  test("the in-place path also lands on the same restart state", () => {
    const done = replay([{ type: "reset.requested" }, { type: "reset.done" }])
    expect(done).toEqual({ status: "restarting" })
  })

  test("a second press while the reset runs starts nothing new", () => {
    const working = replay([{ type: "reset.requested" }])
    expect(transitionUsageReset(working, { type: "reset.requested" })).toBe(working)

    const restarting = replay([{ type: "reset.started" }], working)
    expect(transitionUsageReset(restarting, { type: "reset.requested" })).toBe(restarting)
  })

  test("dismissing the dialog returns to idle and a result cannot reopen it", () => {
    const missing = replay([{ type: "reset.requested" }, { type: "reset.missing" }])
    expect(missing).toEqual({ status: "missing" })

    const dismissed = transitionUsageReset(missing, { type: "dialog.dismissed" })
    expect(dismissed).toEqual(IDLE_USAGE_RESET)
    expect(transitionUsageReset(dismissed, { type: "reset.missing" })).toBe(dismissed)
  })

  test("a failure keeps the tool output only when there is some", () => {
    const working = replay([{ type: "reset.requested" }])
    expect(transitionUsageReset(working, { type: "reset.failed", reason: "command", detail: "error: no daemon" })).toEqual({
      status: "failed",
      reason: "command",
      detail: "error: no daemon",
    })
    expect(transitionUsageReset(working, { type: "reset.failed", reason: "verify" })).toEqual({
      status: "failed",
      reason: "verify",
    })
  })
})
