import { SessionMessage } from "@opencode/schema/session-message"
import type { SessionModel } from "./model"
import type { Platform } from "@/runtime/platform/platform"
import type { ServerCtx } from "@/runtime/server/runtime"
import { noticeUsageAutoContinue } from "@/runtime/persistence/usage-notice"

/**
 * An automatic usage reset kills the engine before its in-memory retry timer can fire, so a
 * failed turn has nothing left to resume it after the relaunch. The main process arms a marker
 * when the reset started; the first mounted session whose history ends in a limit failure
 * re-admits that prompt through the normal admission path. Re-admitting the original prompt ID
 * is idempotent on the server, so a boot that reads the marker without replaying cannot
 * duplicate the turn once the interrupted session mounts again.
 */

const limitKinds = new Set(["provider.free-limit", "provider.go-limit"])

// One check per session per webview: two regions that mount before the first replay resolves
// must not both read the marker. The replay clears it, so a later boot re-checks freely.
const checked = new Set<string>()

export async function attemptUsageAutoContinue(input: {
  readonly platform: Platform
  readonly session: SessionModel
  readonly data: ServerCtx["data"]
}): Promise<void> {
  const sessionID = input.session.identity.sessionID()

  if (!sessionID || checked.has(sessionID)) return
  checked.add(sessionID)

  // Set once a replayable turn is found: the failed toast only fires for a replay that was
  // identified and then failed, never for a window that mounted an unrelated session.
  let armed = false

  try {
    const get = input.platform?.getUsageAutoContinue

    if (!get) return

    const at = await get().catch(() => 0)

    if (!at) return

    const replay = interruptedTurn({ at, messages: input.session.history.messages() })

    // This window mounted a different session than the one that failed. The marker stays armed
    // so the interrupted session replays the first time this runs in a later window.
    if (!replay) return

    armed = true

    const admission: Parameters<ServerCtx["data"]["session"]["prompt"]>[0] = { ...replay, sessionID }

    await input.data.session.prompt(admission)

    // The toast is the only thing the relaunched app shows about the reset: the window that ran
    // the automatic reset is gone, so the resumed turn is what dj sees on boot.
    noticeUsageAutoContinue("resumed")

    await input.platform?.clearUsageAutoContinue?.()
  } catch {
    // A failed admission keeps the marker armed; the next boot of this session retries the step.
    // The error toast fires only when a replay was found and failed, not when none matched.
    if (armed) noticeUsageAutoContinue("failed")
  }
}

type DataMessage = ReturnType<SessionModel["history"]["messages"]>[number]

function interruptedTurn(input: { readonly at: number; readonly messages: ReadonlyArray<DataMessage> }) {
  const reversed = [...input.messages].reverse()

  const failed = reversed.findIndex((item) => item.type === "assistant" && limitKind(item.error?.type))

  if (failed < 0) return undefined

  const assistant = reversed[failed]

  // The failure must postdate the marker, or an old failure would replay against a fresh reset.
  if (assistant?.type !== "assistant") return undefined

  const completed = "completed" in assistant.time ? assistant.time.completed : undefined

  if (completed !== undefined && completed < input.at) return undefined

  for (let i = failed + 1; i < reversed.length; i++) {
    const item = reversed[i]

    if (!item) return undefined

    if (item.type === "shell" || item.type === "idle") return undefined

    if (item.type !== "user") continue

    if (!item.text.trim()) return undefined
    // A stored file re-admits by the URI it came from (as the queued edits do), so a file:// reference
    // keeps its provenance instead of turning into an inline snapshot.
    return {
      id: SessionMessage.ID.make(item.id),
      text: item.text,
      ...(item.files?.length
        ? {
            files: item.files.map((file) => ({
              uri: storedFileUri(file),
              name: file.name,
              description: file.description,
              mention: file.mention,
            })),
          }
        : {}),
      ...(item.agents?.length ? { agents: item.agents } : {}),
      ...(item.skills?.length ? { skills: item.skills } : {}),
    }
  }

  return undefined
}

function storedFileUri(file: NonNullable<SessionMessage.User["files"]>[number]): string {
  const source = file.source

  if (source?.type === "uri") return source.uri

  if ("uri" in file && typeof file.uri === "string") return file.uri

  if ("data" in file && typeof file.data === "string" && "mime" in file) return `data:${file.mime};base64,${file.data}`

  return ""
}

function limitKind(type: unknown): type is string {
  return typeof type === "string" && limitKinds.has(type)
}
