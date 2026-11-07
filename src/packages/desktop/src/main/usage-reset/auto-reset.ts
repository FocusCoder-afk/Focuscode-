export * as UsageAutoReset from "./auto-reset"

import { closeSync, existsSync, openSync, readSync, readdirSync, statSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { app } from "electron"
import { USAGE_AUTO_CONTINUE_KEY, USAGE_AUTO_RESET_KEY } from "../storage/keys"
import { getStore } from "../storage/store"
import { UsageReset } from "./index"

const poll = 4_000


const cooldown = 10 * 60_000

const tail = 1024 * 1024


const limit =
  /free usage limit reached|free usage limit exceeded|go usage limit reached|provider\.free-limit|provider\.go-limit/i

const readers = new Map<string, number>()

let resetting = false

let retryAt = 0

export function enabled() {
  return getStore().get(USAGE_AUTO_RESET_KEY) === true
}

export function setEnabled(value: boolean) {
  getStore().set(USAGE_AUTO_RESET_KEY, value)
}

// A retry the engine scheduled for an interrupted turn lives in memory and dies with the killed
// engine, so the reset relaunch has to hand the failed prompt back itself. The marker is armed
// only when the reset was automatic; a manual reset has a human at the composer already.
export function armAutoContinue() {
  if (!enabled()) return
  getStore().set(USAGE_AUTO_CONTINUE_KEY, Date.now())
}

export function autoContinueAt() {
  const at = getStore().get(USAGE_AUTO_CONTINUE_KEY)
  return typeof at === "number" && Number.isFinite(at) ? at : 0
}

export function clearAutoContinue() {
  getStore().delete(USAGE_AUTO_CONTINUE_KEY)
}


export function start() {
  const timer = setInterval(tick, poll)
  timer.unref()

  return () => clearInterval(timer)
}

function tick() {
  if (resetting || Date.now() < retryAt || !enabled()) return

  try {
    const source = scan()

    if (!source) return

    resetting = true
    void trigger(source)
  } catch (error) {

    console.warn("usage auto-reset could not scan the log", error)
  }
}

async function trigger(source: string) {
  armAutoContinue()

  const result = await UsageReset.resetUsage({ automatic: true }).catch(() => undefined)

  if (result?.status === "started") {
  
    setTimeout(() => app.quit(), 900)
    return
  }

  resetting = false
  retryAt = Date.now() + cooldown

  console.warn("usage auto-reset did not start", { source, result })
}

function scan() {
  let hit: string | undefined

  for (const file of files()) {
    const size = statSync(file).size
    const offset = readers.get(file)

    if (offset === undefined) {
     
      readers.set(file, size)
      continue
    }

    if (size < offset) {
      readers.set(file, size)
      continue
    }

    if (size === offset) continue

    const start = Math.max(offset, size - tail)
    const length = size - start
    const buffer = Buffer.alloc(length)
    const fd = openSync(file, "r")

    try {
      readSync(fd, buffer, 0, length, start)
    } finally {
      closeSync(fd)
    }

    readers.set(file, size)

    if (!hit && limit.test(buffer.toString("utf8"))) hit = file
  }

  return hit
}


function files() {
  const roots = [
    join(process.env.XDG_DATA_HOME || join(homedir(), ".local", "share"), "opencode", "log"),
    join(app.getPath("userData"), "opencode", "log"),
  ]

  return roots.flatMap((directory) => {
    if (!existsSync(directory)) return []

    return readdirSync(directory)
      .filter((entry) => entry.endsWith(".log"))
      .map((entry) => join(directory, entry))
  })
}
