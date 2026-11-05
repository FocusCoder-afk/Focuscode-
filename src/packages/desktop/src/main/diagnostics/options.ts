import { debugBuild } from "@opencode/gui-plugins/debug/options"


export function remoteDebuggingPort(build: { readonly packaged: boolean; readonly channel: string }, value?: string) {
  if (!debugBuild(build)) return undefined

  if (value === undefined) return build.packaged ? undefined : "9222"

  if (!/^\d+$/.test(value)) return undefined

  return Number(value) <= 65535 ? String(Number(value)) : undefined
}
