import { app } from "electron"

type Channel = "local" | "dev" | "beta" | "prod"

const raw = import.meta.env.OPENCODE_CHANNEL

export const CHANNEL: Channel = raw === "local" || raw === "dev" || raw === "beta" || raw === "prod" ? raw : "dev"

export const VERSION = app.isPackaged ? app.getVersion() : (process.env.OPENCODE_VERSION ?? app.getVersion())

const appNames = {
  local: "FocusCode Dev",
  dev: "FocusCode Dev",
  beta: "FocusCode Beta",
  prod: "FocusCode",
} satisfies Record<Channel, string>

const appIDs = {
  local: "ai.focuscode.desktop.dev",
  dev: "ai.focuscode.desktop.dev",
  beta: "ai.focuscode.desktop.beta",
  prod: "ai.focuscode.desktop",
} satisfies Record<Channel, string>

// Local renderer/server mode keeps the dev application identity.
export const APP_NAME = app.isPackaged ? appNames[CHANNEL] : "FocusCode Dev"

export const APP_ID = app.isPackaged ? appIDs[CHANNEL] : "ai.focuscode.desktop.dev"
