// this will keep focuscode up to date otherwise the fucking ai wont fucking WORK OK
// uhm why r u even looking trough my beautifull code
// uhm add me on discord if ya want: focuscoder.lol 
// Usage:
//   bun update.ts           update now if a newer release exists
//   bun update.ts --check   report only, change nothing
//   bun update.ts --if-due  update only when the last check is older than DUE_HOURS
//   bun update.ts --quiet   no console output unless something changed

import { $ } from "bun"
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs"
import { join } from "node:path"

const root = import.meta.dir
const build = join(root, "build")
const resources = join(build, "resources")
const engine = join(resources, "opencode-cli.exe")
const versionFile = join(resources, "opencode-cli.version")
const stamp = join(root, "backup", ".last-update-check")
const backup = join(root, "backup")
const DUE_HOURS = 6
const FEED = "https://opencode.ai/update/api/latest/cli/npm"

const flags = new Set(process.argv.slice(2))
const quiet = flags.has("--quiet")
const check = flags.has("--check")
const ifDue = flags.has("--if-due")

const log = (message: string) => {
  if (!quiet) console.log(message)
}

function currentVersion() {
  try {
    return readFileSync(versionFile, "utf8").trim()
  } catch {
    return ""
  }
}

function semver(input: string) {
  const match = input.trim().match(/^v?(\d+)\.(\d+)\.(\d+)/)
  if (!match) return
  return [Number(match[1]), Number(match[2]), Number(match[3])] as const
}

function isNewer(candidate: string, existing: string) {
  const next = semver(candidate)
  const prev = semver(existing)
  if (!next) return false
  if (!prev) return true
  for (let index = 0; index < 3; index++) {
    if (next[index] !== prev[index]) return next[index] > prev[index]
  }
  return false
}

async function latestRelease() {
  const response = await fetch(FEED, { signal: AbortSignal.timeout(20_000) })
  if (!response.ok) throw new Error(`release feed returned HTTP ${response.status}`)
  const data: { version?: string; metadata?: { package?: string } } = await response.json()
  if (!data.version) throw new Error("release feed returned no version")
  return { version: data.version, package: data.metadata?.package ?? "@opencode/cli" }
}

function due() {
  if (!ifDue) return true
  try {
    const wrote = readFileSync(stamp, "utf8").trim()
    const age = Date.now() - Date.parse(wrote)
    return !Number.isFinite(age) || age > DUE_HOURS * 60 * 60 * 1000
  } catch {
    return true
  }
}

function markChecked() {
  mkdirSync(backup, { recursive: true })
  writeFileSync(stamp, new Date().toISOString())
}


function pruneBackups() {
  const kept = readdirSync(backup)
    .filter((name) => /^opencode-cli-.+\.exe$/.test(name))
    .map((name) => ({ name, at: statSync(join(backup, name)).mtimeMs }))
    .sort((a, b) => b.at - a.at)
    .slice(2)
  kept.forEach((entry) => rmSync(join(backup, entry.name), { force: true }))
}

if (!existsSync(engine)) {
  console.error(`No engine at ${engine}. Run build.bat first.`)
  process.exit(1)
}

if (!due()) process.exit(0)

const installed = currentVersion()
let release
try {
  release = await latestRelease()
} catch (error) {

  log(`update check skipped: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(0)
}

if (installed === release.version) {
  markChecked()
  log(`FocusCode engine ${installed} is current`)
  process.exit(0)
}

if (!isNewer(release.version, installed)) {
  markChecked()
  log(`FocusCode engine ${installed} is newer than the release feed (${release.version}); nothing to do`)
  process.exit(0)
}

log(`FocusCode engine ${installed || "unknown"} -> ${release.version}`)
if (check) {
  console.log(`update available: ${release.version}`)
  process.exit(0)
}

const staging = join(root, "backup", `cli-${release.version}`)
rmSync(staging, { recursive: true, force: true })
mkdirSync(staging, { recursive: true })

log(`downloading ${release.package}@${release.version}`)
const result = await $`npm install ${release.package}@${release.version} --prefix ${staging} --no-save --no-audit --no-fund --loglevel=error`.quiet()
if (result.exitCode !== 0) {
  console.error(result.stderr.toString().trim() || `npm exited with ${result.exitCode}`)
  process.exit(1)
}

const downloaded = join(staging, "node_modules", "@opencode", "cli", "bin", "opencode.exe")
if (!existsSync(downloaded)) {
  console.error(`The ${release.package} package did not contain bin/opencode.exe`)
  process.exit(1)
}

const probe = await $`${downloaded} --version`.quiet()
const reported = probe.stdout.toString().trim()
if (!reported.includes(release.version)) {
  console.error(`The downloaded engine reports "${reported}", expected ${release.version}`)
  process.exit(1)
}


if (installed) {
  mkdirSync(backup, { recursive: true })
  copyFileSync(engine, join(backup, `opencode-cli-${installed}.exe`))
  pruneBackups()
}

copyFileSync(downloaded, engine)
writeFileSync(versionFile, release.version)
rmSync(staging, { recursive: true, force: true })
markChecked()

log(`engine updated to ${release.version}. Relaunch FocusCode to use it.`)
