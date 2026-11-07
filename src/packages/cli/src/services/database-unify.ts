export * as DatabaseUnify from "./database-unify"

import { existsSync, readdirSync, renameSync } from "node:fs"
import { basename, join } from "node:path"
import { Effect } from "effect"

// Every release channel opens its own SQLite file next to opencode.db (the dev channel's opencode-local.db,
// for example), so sessions created under one channel stayed invisible in the elected engine of another. At
// service boot a sibling database is folded into the one this process is about to open and then renamed, which
// turns the whole history into a single library. Copies are INSERT OR IGNORE, so a merge that runs twice (a
// crash before the rename, or a live local channel engine still holding the file) converges to the same state.
const siblings = /^opencode(?:-[A-Za-z0-9._-]+)?\.db$/

// The migration ledger belongs to whichever file the process opened; the copy must not hand it ledger rows.
const skipTables = new Set(["migration"])

type Outcome = { readonly copied: number; readonly skipped: readonly [string, string][] } | { readonly failure: unknown }

export const unify = Effect.fnUntraced(function* (data: string, target: string) {
  // An explicit database belongs to whoever asked for it (tests, a developer shell); channel folding stays off.
  if (process.env.OPENCODE_DB) return

  // Folding only ever points at the shared file: a channel engine that copies opencode.db away would eat the
  // elected engine's history, so a non-canonical target leaves its siblings alone.
  if (basename(target) !== "opencode.db") return

  const candidates = readdirSync(data)
    .filter((name) => siblings.test(name) && name !== "opencode.db")
    .filter((name) => !name.endsWith(".imported"))
    .map((name) => join(data, name))

  for (const source of candidates) {
    if (!existsSync(source)) continue

    const outcome = yield* merge(target, source)

    if ("failure" in outcome) {
      yield* Effect.logWarning("channel database left unmerged", { source, target, failure: text(outcome.failure) })
      continue
    }

    yield* Effect.logInfo("channel database merged", {
      source,
      target,
      copied: outcome.copied,
      skipped: outcome.skipped.length,
    })

    // A still-running engine of the old channel holds the file on Windows: copies are idempotent, so the next
    // start simply retries. The main file moves first so the WAL sidecars go along only on success.
    if (!retire(source)) yield* Effect.logInfo("channel database kept for a retry at the next start", { source })
  }
})

const merge = Effect.fnUntraced(function* (target: string, source: string) {
  const { Database } = yield* Effect.promise(() => import("bun:sqlite"))
  const db = new Database(target, { create: false })

  return yield* Effect.try(() => copy(db, source)).pipe(
    Effect.tap(() => Effect.sync(() => db.close())),
    Effect.tapError(() => Effect.sync(() => db.close())),
    Effect.catch((cause) => Effect.succeed({ failure: cause } satisfies Outcome)),
  )
})

function copy(db: import("bun:sqlite").Database, source: string): Exclude<Outcome, { failure: unknown }> {
  db.exec("PRAGMA busy_timeout = 5000")
  // Children find the rows they point at by the end of the pass, so constraint checking waits for real use.
  db.exec("PRAGMA foreign_keys = OFF")
  db.exec(`ATTACH DATABASE '${source.replaceAll("'", "''")}' AS sibling`)

  let copied = 0
  const skipped: [string, string][] = []

  db.transaction(() => {
    for (const { name } of names(db)) {
      if (skipTables.has(name)) continue

      const merged = copyTable(db, name)

      if (typeof merged === "number") {
        copied += merged
        continue
      }

      skipped.push([name, merged])
    }
  })()
  db.exec("PRAGMA wal_checkpoint(TRUNCATE)")
  db.exec("DETACH DATABASE sibling")

  return { copied, skipped }
}

function names(db: import("bun:sqlite").Database) {
  return db.prepare("SELECT name FROM main.sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all() as {
    name: string
  }[]
}

function copyTable(db: import("bun:sqlite").Database, table: string): number | string {
  const target = columns(db, "main", table)
  const source = columns(db, "sibling", table)

  if (target.length === 0 || source.length === 0) return "table unreadable"

  // The names this channel's schema wants, limited to what the source still knows: an older source loses only
  // columns it never wrote.
  const shared = target.filter((column) => source.some((named) => named.name === column.name))
  if (shared.length === 0) return "no shared columns"

  const names = shared.map((column) => quote(column.name)).join(", ")
  return db.run(`INSERT OR IGNORE INTO main.${quote(table)} (${names}) SELECT ${names} FROM sibling.${quote(table)}`)
    .changes
}

function columns(db: import("bun:sqlite").Database, alias: string, table: string) {
  return db.prepare(`PRAGMA ${alias}.table_info('${table}')`).all() as { name: string }[]
}

function quote(identifier: string) {
  return `"${identifier.replaceAll(`"`, `""`)}"`
}

function retire(source: string) {
  try {
    renameSync(source, `${source}.imported`)
  } catch {
    return false
  }

  for (const sidecar of [`${source}-wal`, `${source}-shm`]) {
    try {
      renameSync(sidecar, `${sidecar}.imported`)
    } catch {}
  }

  return true
}

function text(cause: unknown) {
  return cause instanceof Error ? cause.message : String(cause)
}
