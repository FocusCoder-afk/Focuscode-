export * as AuthPurge from "./auth-purge"

import { existsSync, unlinkSync } from "node:fs"
import { join } from "node:path"
import { Effect } from "effect"

// A usage reset marks the service directory before the app closes, so the next boot starts with a clean
// provider identity instead of reconnecting with the exact credentials the reset is escaping: the marker
// makes the engine drop its stored connections and the legacy auth file right before it opens its database.
const markerName = "focuscode-auth-reset"

const tables = ["credential", "account", "account_state", "control_account"]

export function pending(state: string) {
  return existsSync(join(state, markerName))
}

interface Identity {
  readonly database: string
  readonly data: string
  readonly state: string
}

export const consume = Effect.fnUntraced(function* (input: Identity) {
  const file = join(input.data, "auth.json")

  if (existsSync(file)) {
    try {
      unlinkSync(file)
    } catch (error) {
      yield* Effect.logWarning("usage reset could not remove the legacy auth file", { error: message(error) })
    }
  }

  // The engine hands in the exact database it is about to open, so the purge never guesses a channel name.
  yield* clear(input.database)

  if (existsSync(join(input.state, markerName))) unlinkSync(join(input.state, markerName))

  yield* Effect.logInfo("usage reset cleared the stored auth identity", { data: input.data })
})

function clear(target: string) {
  return Effect.gen(function* () {
    if (!existsSync(target)) return

    const { Database } = yield* Effect.promise(() => import("bun:sqlite"))
    const db = new Database(target, { create: false })

    yield* Effect.try(() => {
      db.exec("PRAGMA busy_timeout = 5000")

      let dropped = 0

      db.transaction(() => {
        for (const table of tables) {
          try {
            dropped += db.run(`DELETE FROM ${quote(table)}`).changes
          } catch {
            // A schema without this table (an older channel database) has nothing of that kind to clear.
          }
        }
      })()
      db.exec("PRAGMA wal_checkpoint(TRUNCATE)")

      return dropped
    }).pipe(
      Effect.tap(() => Effect.sync(() => db.close())),
      Effect.tapError(() => Effect.sync(() => db.close())),
      Effect.tap((dropped) => Effect.logInfo("stored auth connections removed", { target, dropped })),
      Effect.catch((error) =>
        Effect.logWarning("usage reset could not clear stored auth", { target, error: message(error) }),
      ),
      Effect.asVoid,
    )
  })
}

function quote(identifier: string) {
  return `"${identifier.replaceAll(`"`, `""`)}"`
}

function message(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}
