import { Schema } from "effect"
import { Rpc, RpcGroup } from "effect/rpc"

const ServerReadyData = Schema.Struct({
  url: Schema.String,
})

export const AppAwaitInitialization = Rpc.make("AppAwaitInitialization", { success: ServerReadyData })

export const AppReconnectService = Rpc.make("AppReconnectService", { success: ServerReadyData })

// The renderer listens for DeepLinksOpened before it reports ready, and acknowledges each delivery once handled.
export const AppReadyDeepLinks = Rpc.make("AppReadyDeepLinks")

export const AppAcknowledgeDeepLinks = Rpc.make("AppAcknowledgeDeepLinks", {
  payload: { attempt: Schema.Number },
})

export const AppIsFirstLaunchOnboardingPending = Rpc.make("AppIsFirstLaunchOnboardingPending", {
  success: Schema.Boolean,
})

export const AppFinishFirstLaunchOnboarding = Rpc.make("AppFinishFirstLaunchOnboarding", {
  payload: { createDefaultProject: Schema.Boolean },
  success: Schema.NullOr(Schema.String),
})

export const AppCheckAppExists = Rpc.make("AppCheckAppExists", {
  payload: { appName: Schema.String },
  success: Schema.Boolean,
})

export const AppResolveAppPath = Rpc.make("AppResolveAppPath", {
  payload: { appName: Schema.String },
  success: Schema.NullOr(Schema.String),
})

export const AppSetBackgroundColor = Rpc.make("AppSetBackgroundColor", {
  payload: { color: Schema.String },
})

export const AppExportDebugLogs = Rpc.make("AppExportDebugLogs", { success: Schema.String })

export const AppSetForceFocus = Rpc.make("AppSetForceFocus", {
  payload: { enabled: Schema.Boolean },
})

export const AppRecordFatalRendererError = Rpc.make("AppRecordFatalRendererError", {
  payload: {
    error: Schema.Struct({
      error: Schema.String,
      url: Schema.String,
      version: Schema.optionalKey(Schema.String),
      platform: Schema.String,
      os: Schema.optionalKey(Schema.String),
    }),
  },
})

export const AppGetSpellcheckEnabled = Rpc.make("AppGetSpellcheckEnabled", { success: Schema.Boolean })

export const AppSetSpellcheckEnabled = Rpc.make("AppSetSpellcheckEnabled", {
  payload: { enabled: Schema.Boolean },
})

export const AppSetNativeTranslations = Rpc.make("AppSetNativeTranslations", {
  payload: { value: Schema.Unknown },
})

export const AppRelaunch = Rpc.make("AppRelaunch")

// A reset reports status and raw tool output only; every user-facing sentence is rendered from an i18n key.
export const AppResetUsage = Rpc.make("AppResetUsage", {
  success: Schema.Union([
    Schema.Struct({ status: Schema.Literal("missing") }),
    // Windows hands the work to its own console, which closes the app before touching the tunnel.
    Schema.Struct({ status: Schema.Literal("started") }),
    Schema.Struct({
      status: Schema.Literal("done"),
      ip: Schema.String,
      previous: Schema.optionalKey(Schema.String),
    }),
    Schema.Struct({
      status: Schema.Literal("failed"),
      reason: Schema.Literals(["managed", "command", "verify"]),
      detail: Schema.optionalKey(Schema.String),
    }),
  ]),
})

// The auto-reset toggle lives in the main process: it keeps watching the server log while the window is closed.
export const AppGetUsageAutoReset = Rpc.make("AppGetUsageAutoReset", { success: Schema.Boolean })

export const AppSetUsageAutoReset = Rpc.make("AppSetUsageAutoReset", {
  payload: { enabled: Schema.Boolean },
})

export const AppRpcs = RpcGroup.make(
  AppAwaitInitialization,
  AppReconnectService,
  AppReadyDeepLinks,
  AppAcknowledgeDeepLinks,
  AppIsFirstLaunchOnboardingPending,
  AppFinishFirstLaunchOnboarding,
  AppCheckAppExists,
  AppResolveAppPath,
  AppSetBackgroundColor,
  AppExportDebugLogs,
  AppSetForceFocus,
  AppGetSpellcheckEnabled,
  AppSetSpellcheckEnabled,
  AppRecordFatalRendererError,
  AppSetNativeTranslations,
  AppRelaunch,
  AppResetUsage,
  AppGetUsageAutoReset,
  AppSetUsageAutoReset,
)
