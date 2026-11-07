import { useDialog } from "@opencode/ui/context/dialog"
import { Icon } from "@opencode/ui/icon"
import { Loader } from "@opencode/ui/loader"
import { createEffect, createSignal, onCleanup, Show } from "solid-js"
import { useLanguage } from "@/runtime/i18n/language"
import { usePlatform } from "@/runtime/platform/platform"
import { UsageResetDialog } from "./dialog"
import {
  IDLE_USAGE_RESET,
  isUsageResetBusy,
  isUsageResetDialogOpen,
  transitionUsageReset,
  usageResetLabelKey,
  type UsageResetEvent,
  type UsageResetState,
} from "./machine"

/**
 * The corner control: one press asks the main process to start a reset. On Windows the app closes and a console
 * re-registers WARP and reopens FocusCode; a missing CLI or a failure opens the dialog instead.
 */
export function UsageResetButton() {
  const platform = usePlatform()
  const language = useLanguage()
  const dialog = useDialog()
  const [machine, setMachine] = createSignal<UsageResetState>(IDLE_USAGE_RESET)

  const dispatch = (event: UsageResetEvent) => setMachine((state) => transitionUsageReset(state, event))

  const submit = async () => {
    const reset = platform.resetUsage

    if (!reset || isUsageResetBusy(machine())) return

    dispatch({ type: "reset.requested" })

    const result = await reset().catch(() => undefined)

    if (!result) return dispatch({ type: "reset.failed", reason: "command" })

    if (result.status === "missing") return dispatch({ type: "reset.missing" })

    if (result.status === "failed")
      return dispatch({ type: "reset.failed", reason: result.reason, detail: result.detail })

    if (result.status === "started") return dispatch({ type: "reset.started" })

    dispatch({ type: "reset.done" })
  }

  // Main pushes this for automatic resets while the user is mid-prompt, so the pill flips to
  // Restarting even though nobody touched the corner control; unlisten ties it to this mount.
  createEffect(() => {
    const started = platform.onUsageResetStarted

    if (!started) return

    onCleanup(
      started((data) => {
        if (!data.automatic && isUsageResetBusy(machine())) return

        dispatch({ type: "reset.started" })
      }),
    )
  })

  createEffect(() => {
    const state = machine()

    if (!isUsageResetDialogOpen(state)) return

    void dialog.show(
      () => <UsageResetDialog state={state} onRetry={() => void submit()} />,
      () => dispatch({ type: "dialog.dismissed" }),
    )
  })

  return (
    <Show when={platform.resetUsage}>
      <button
        type="button"
        data-component="usage-reset"
        aria-label={language.t("usageReset.tooltip")}
        title={language.t("usageReset.tooltip")}
        disabled={isUsageResetBusy(machine())}
        onClick={() => void submit()}
        class="absolute start-[11px] bottom-[10px] z-30 flex h-7 items-center gap-1.5 rounded-full border border-v2-border-border-base bg-v2-background-bg-base px-2.5 text-[12px] leading-4 font-[440] tracking-[-0.04px] text-v2-text-text-faint shadow-sm transition-colors hover:bg-v2-background-bg-layer-02 hover:text-v2-text-text-muted focus-visible:bg-v2-background-bg-layer-02 focus-visible:outline-none disabled:pointer-events-none"
      >
        <Show
          when={!isUsageResetBusy(machine())}
          fallback={<Loader width={14} height={14} class="text-v2-text-text-faint" />}
        >
          <Icon name="refresh" size="small" />
        </Show>
        <span class="truncate">{language.t(usageResetLabelKey(machine()))}</span>
        <span aria-hidden="true" class="text-v2-text-text-faint/40">
          ·
        </span>
        <span class="truncate text-v2-text-text-faint/60">{language.t("usageReset.credit")}</span>
      </button>
    </Show>
  )
}
