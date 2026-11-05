export type UsageResetFailure = "managed" | "command" | "verify"

/**
 * What the corner control and its dialog can be showing. A reset leaves `idle` in the event that starts it, so a
 * second click cannot start a second one.
 */
export type UsageResetState =
  | { status: "idle" }
  | { status: "working" }
  | { status: "restarting" }
  | { status: "missing" }
  | { status: "failed"; reason: UsageResetFailure; detail?: string }

export type UsageResetEvent =
  | { type: "reset.requested" }
  | { type: "reset.missing" }
  | { type: "reset.failed"; reason: UsageResetFailure; detail?: string }
  | { type: "reset.started" }
  | { type: "reset.done" }
  | { type: "dialog.dismissed" }

export const IDLE_USAGE_RESET: UsageResetState = { status: "idle" }

export function transitionUsageReset(state: UsageResetState, event: UsageResetEvent): UsageResetState {
  switch (event.type) {
    case "reset.requested":
      return isUsageResetBusy(state) ? state : { status: "working" }

    case "reset.missing":
      return state.status === "working" ? { status: "missing" } : state

    case "reset.failed":
      if (state.status !== "working") return state

      return event.detail
        ? { status: "failed", reason: event.reason, detail: event.detail }
        : { status: "failed", reason: event.reason }

    case "reset.started":
      return state.status === "working" ? { status: "restarting" } : state

    case "reset.done":
      return state.status === "working" ? { status: "restarting" } : state

    case "dialog.dismissed":
      return isUsageResetDialogOpen(state) ? IDLE_USAGE_RESET : state
  }
}

export function isUsageResetBusy(state: UsageResetState) {
  return state.status === "working" || state.status === "restarting"
}

export function isUsageResetDialogOpen(
  state: UsageResetState,
): state is Extract<UsageResetState, { status: "missing" | "failed" }> {
  return state.status === "missing" || state.status === "failed"
}

export function usageResetLabelKey(state: UsageResetState) {
  if (state.status === "working") return "usageReset.working" as const

  if (state.status === "restarting") return "usageReset.restarting" as const

  return "usageReset.button" as const
}
