export * as UsageReset from "./index"

import { execFile, spawn } from "node:child_process"
import { existsSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { promisify } from "node:util"
import type { UsageResetResult } from "@opencode/app/desktop"
import { app } from "electron"
import { Option, Schema } from "effect"
import { consoleScript, type RestartCommand } from "./console-script"

const locate = promisify(execFile)


const Registration = Schema.fromJsonString(Schema.Struct({ managed: Schema.optionalKey(Schema.Boolean) }))

const Settings = Schema.fromJsonString(
  Schema.Struct({
    settings: Schema.Struct({
      operation_mode: Schema.optionalKey(Schema.String),
      proxy_port: Schema.optionalKey(Schema.Number),
    }),
  }),
)


const installed: Partial<Record<NodeJS.Platform, readonly string[]>> = {
  win32: ["C:\\Program Files\\Cloudflare\\Cloudflare WARP\\warp-cli.exe"],
  darwin: [
    "/Applications/Cloudflare WARP.app/Contents/Resources/warp-cli",
    "/usr/local/bin/warp-cli",
    "/opt/homebrew/bin/warp-cli",
  ],
  linux: ["/usr/bin/warp-cli", "/usr/local/bin/warp-cli"],
}


export async function resetUsage(options: { automatic?: boolean } = {}): Promise<UsageResetResult> {
  const cli = await resolveCli()

  if (!cli) return { status: "missing" }

  
  if (await isManaged(cli)) return { status: "failed", reason: "managed" }


  if (process.platform !== "win32") return resetInPlace(cli)

  try {
    openConsole(cli, await restartCommand(), await proxyPort(cli), options.automatic === true)
  } catch (error) {
    return {
      status: "failed",
      reason: "command",
      detail: error instanceof Error ? error.message : String(error),
    }
  }

  return { status: "started" }
}

async function resetInPlace(cli: string): Promise<UsageResetResult> {

  await run(cli, ["connect"], 30_000).catch(() => undefined)

  const previous = await egressAddress()


  await run(cli, ["disconnect"], 30_000).catch(() => undefined)

  try {
    await run(cli, ["registration", "new"], 60_000)
    await run(cli, ["connect"], 30_000)
  } catch (error) {
    return {
      status: "failed",
      reason: "command",
      detail: error instanceof Error ? error.message : String(error),
    }
  }

  const ip = await waitForAddress(previous)

  if (!ip) return { status: "failed", reason: "verify" }

  return previous ? { status: "done", ip, previous } : { status: "done", ip }
}


async function proxyPort(cli: string) {
  try {
    const decoded = Schema.decodeUnknownOption(Settings)(await run(cli, ["settings"], 15_000, true))

    if (Option.isSome(decoded) && decoded.value.settings.operation_mode === "proxy")
      return decoded.value.settings.proxy_port ?? 40000

    if (Option.isSome(decoded)) return undefined
  } catch {
  
  
  }

  return 40000
}

function openConsole(cli: string, restart: RestartCommand, port: number | undefined, automatic: boolean) {
  const script = join(tmpdir(), `focuscode-usage-reset-${process.pid}.ps1`)

  
  writeFileSync(
    script,
    `\uFEFF${consoleScript({ cli, restart, port, automatic, pid: process.pid })}`,
    "utf8",
  )

  spawn(
    "cmd.exe",
    ["/c", "start", "", "powershell.exe", "-NoLogo", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script],
    { cwd: process.cwd(), detached: true, stdio: "ignore", windowsHide: false },
  ).unref()
}


async function restartCommand(): Promise<RestartCommand> {
  if (app.isPackaged) {
    return { executable: process.execPath, args: process.argv.slice(1), directory: dirname(process.execPath) }
  }


  return {
    executable: await resolveBun(),
    args: ["run", "dev:desktop"],
    directory: resolve(app.getAppPath(), "../.."),
  }
}

async function resolveBun() {
  try {
    const { stdout } = await locate("where", ["bun"], { timeout: 10_000, windowsHide: true })

    return (
      stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find(Boolean) ?? "bun.exe"
    )
  } catch {
    return "bun.exe"
  }
}

async function resolveCli() {
  const override = process.env.WARP_CLI

  if (override && existsSync(override)) return override

  const known = installed[process.platform]?.find((path) => existsSync(path))

  if (known) return known

  try {
    const { stdout } = await locate(process.platform === "win32" ? "where" : "which", ["warp-cli"], {
      timeout: 10_000,
      windowsHide: true,
    })

    return stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean)
  } catch {
    return undefined
  }
}

async function isManaged(cli: string) {
  try {
    const decoded = Schema.decodeUnknownOption(Registration)(await run(cli, ["registration", "show"], 15_000, true))

    return Option.isSome(decoded) && decoded.value.managed === true
  } catch {
  
    return false
  }
}

async function waitForAddress(previous: string | undefined) {
  const deadline = Date.now() + 25_000
  let last: string | undefined

  while (Date.now() < deadline) {
    last = await egressAddress()

    if (last && last !== previous) return last

    await pause(500)
  }

  return last
}

async function egressAddress() {
  try {
    const response = await fetch("https://www.cloudflare.com/cdn-cgi/trace", { signal: AbortSignal.timeout(8_000) })

    if (!response.ok) return undefined

    return /^ip=(.+)$/m.exec(await response.text())?.[1]?.trim()
  } catch {
    return undefined
  }
}

function run(executable: string, args: string[], timeout: number, json = false) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(executable, ["--accept-tos", "--no-ansi", ...(json ? ["-j"] : []), ...args], {
      windowsHide: true,
     
      stdio: ["ignore", "pipe", "pipe"],
    })

    const output: string[] = []
    const errors: string[] = []
    const timer = setTimeout(() => child.kill(), timeout)

    child.stdout?.setEncoding("utf8").on("data", (chunk: string) => output.push(chunk))
    child.stderr?.setEncoding("utf8").on("data", (chunk: string) => errors.push(chunk))

    child.once("error", (error) => {
      clearTimeout(timer)
      reject(error)
    })
    child.once("close", (code, signal) => {
      clearTimeout(timer)

      if (code === 0) return resolve(output.join(""))

      reject(new Error(errors.join("").trim() || output.join("").trim() || String(signal ?? code)))
    })
  })
}

function pause(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
