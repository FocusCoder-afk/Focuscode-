import { Icon, type IconProps } from "@opencode/ui/icon"
import { Toast, showToast, type ToastOptions } from "@opencode/ui/toast"
import { createEffect, type JSX } from "solid-js"
import { Predicate } from "effect"
import { useLanguage } from "@/runtime/i18n/language"
import {
  acknowledgeLocalStorageNotice,
  localStorageNoticePending,
} from "@/runtime/persistence/storage"
import {
  acknowledgeUsageAutoContinue,
  usageAutoContinueNotice,
} from "@/runtime/persistence/usage-notice"

type AppToastOptions = Omit<ToastOptions, "icon"> & {
  icon?: IconProps["name"]
}

export function ToastRegion() {
  const language = useLanguage()

  // A write can fail before this region mounts, so the notice waits in storage state until shown once.
  createEffect(() => {
    if (!localStorageNoticePending()) return
    acknowledgeLocalStorageNotice()
    showAppToast({
      variant: "error",
      title: language.t("toast.storage.writeFailed.title"),
      description: language.t("toast.storage.writeFailed.description"),
    })
  })

  // The usage reset replay reports through a signal, so the notice translates here with the language context.
  createEffect(() => {
    const notice = usageAutoContinueNotice()

    if (!notice) return

    acknowledgeUsageAutoContinue()
    showAppToast({
      variant: notice === "failed" ? "error" : "success",
      title: language.t(notice === "failed" ? "usageAutoContinue.failed.title" : "usageAutoContinue.resumed.title"),
      description: language.t(
        notice === "failed" ? "usageAutoContinue.failed.description" : "usageAutoContinue.resumed.description",
      ),
    })
  })

  return <Toast.Region />
}

function showAppToast(options: AppToastOptions | string) {
  if (Predicate.isString(options)) return showToast(options)

  return showToast({
    ...options,
    icon: resolveIcon(options.icon, options.variant),
    actions: options.actions?.map((action) => ({
      ...action,
      variant: action.onClick === "dismiss" ? "secondary" : "primary",
    })),
  })
}

export { showAppToast as showToast }

function resolveIcon(icon: IconProps["name"] | undefined, variant: ToastOptions["variant"]) {
  const name = icon ?? (variant === "success" ? "check" : undefined)

  if (!name) return undefined

  // SAFETY: Solid resolves a function child as a JSX accessor under the toast's render owner, not this imperative
  // call site, so the accessor stands in for the element.
  // oxlint-disable-next-line anti-slop/no-chained-type-assertions -- see SAFETY above
  return (() => <Icon name={name} />) as unknown as JSX.Element
}
