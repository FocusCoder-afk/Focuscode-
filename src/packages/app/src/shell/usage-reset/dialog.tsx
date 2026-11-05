import { Button } from "@opencode/ui/button"
import { useDialog } from "@opencode/ui/context/dialog"
import { Dialog, DialogBody, DialogFooter, DialogHeader, DialogTitleGroup } from "@opencode/ui/dialog"
import { Icon } from "@opencode/ui/icon"
import { Show } from "solid-js"
import { useLanguage } from "@/runtime/i18n/language"
import { usePlatform } from "@/runtime/platform/platform"
import type { UsageResetFailure, UsageResetState } from "./machine"

type OpenState = Extract<UsageResetState, { status: "missing" | "failed" }>

export function UsageResetDialog(props: { state: OpenState; onRetry: () => void }) {
  const dialog = useDialog()
  const language = useLanguage()
  const platform = usePlatform()

  const missing = () => props.state.status === "missing"
  const failure = () => (props.state.status === "failed" ? props.state : undefined)

  // The install command stays literal: it is a code token, not copy, and it only exists per platform.
  const command = () => {
    if (platform.platform !== "desktop") return undefined

    if (platform.os === "windows") return "winget install Cloudflare.Warp"

    if (platform.os === "macos") return "brew install --cask cloudflare-warp"

    return undefined
  }

  const description = () => {
    const value = failure()

    return value ? language.t(failureKey(value.reason)) : language.t("usageReset.missing.description")
  }

  const retry = () => {
    dialog.close()
    props.onRetry()
  }

  return (
    <Dialog fit containerClass="w-[min(calc(100vw-32px),460px)]!">
      <DialogHeader hideClose>
        <DialogTitleGroup
          title={missing() ? language.t("usageReset.missing.title") : language.t("usageReset.failed.title")}
          description={description()}
        />
      </DialogHeader>
      <DialogBody>
        <div class="flex flex-col gap-3 px-4">
          <Show when={missing()}>
            <Show when={command()}>
              {(value) => (
                <div class="flex items-center gap-2 rounded-md border border-v2-border-border-base bg-v2-background-bg-base px-2.5 py-2">
                  <Icon name="outline-code-brackets" size="small" class="shrink-0 text-v2-text-text-faint" />
                  <code
                    dir="ltr"
                    class="min-w-0 overflow-x-auto font-mono text-[12px] leading-4 text-v2-text-text-muted"
                  >
                    {value()}
                  </code>
                </div>
              )}
            </Show>
            <Button
              variant="outline"
              icon="outline-square-arrow"
              onClick={() => platform.openExternal("https://1.1.1.1/")}
            >
              {language.t("usageReset.download")}
            </Button>
          </Show>
          <Show when={failure()?.detail}>
            {(detail) => (
              <pre
                dir="ltr"
                class="m-0 max-h-40 overflow-auto break-all whitespace-pre-wrap rounded-md border border-v2-border-border-base bg-v2-background-bg-base p-2 font-mono text-[12px] leading-4 text-v2-text-text-faint"
              >
                {detail()}
              </pre>
            )}
          </Show>
        </div>
      </DialogBody>
      <DialogFooter>
        <Button variant="ghost" autofocus onClick={() => dialog.close()}>
          {language.t("common.cancel")}
        </Button>
        <Button variant="neutral" onClick={retry}>
          {language.t("usageReset.retry")}
        </Button>
      </DialogFooter>
    </Dialog>
  )
}

function failureKey(reason: UsageResetFailure) {
  if (reason === "managed") return "usageReset.failed.managed" as const

  if (reason === "command") return "usageReset.failed.command" as const

  return "usageReset.failed.verify" as const
}
