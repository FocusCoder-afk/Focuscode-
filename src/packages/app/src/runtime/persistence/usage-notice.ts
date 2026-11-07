import { createSignal } from "solid-js"

/**
 * The relaunched app cannot see what the reset console did, so the prompt replay reports its
 * result here and ToastRegion turns it into the one visible sign the reset happened.
 * Process-local: the notice shows once per boot and nothing persists.
 */

export type UsageAutoContinueNotice = "resumed" | "failed"

// `equals: false` so a second replay candidate in one boot (two sessions reloading) re-fires the effect.
const [notice, setNotice] = createSignal<UsageAutoContinueNotice | undefined>(undefined, { equals: false })

export function noticeUsageAutoContinue(kind: UsageAutoContinueNotice) {
  setNotice(kind)
}

export function usageAutoContinueNotice() {
  return notice()
}

export function acknowledgeUsageAutoContinue() {
  setNotice(undefined)
}
