
export type RestartCommand = {
  executable: string
  args: string[]
  directory: string
}

export type ConsoleScriptOptions = {
  cli: string
  restart: RestartCommand
  port: number | undefined
  automatic: boolean
  pid: number
}

function ps(value: string): string {
  return "'" + value.replace(/'/g, "''") + "'"
}

function windowsArgument(value: string): string {
  if (!/[\s"]/u.test(value)) return value

  let result = '"'
  let backslashes = 0

  for (const character of value) {
    if (character === "\\") {
      backslashes++
      continue
    }

    if (character === '"') {
      result += "\\".repeat(backslashes * 2 + 1) + '"'
      backslashes = 0
      continue
    }

    result += "\\".repeat(backslashes) + character
    backslashes = 0
  }

  result += "\\".repeat(backslashes * 2) + '"'
  return result
}

export function consoleScript(options: ConsoleScriptOptions): string {
  // Arguments arrive as one pre-windowsArgument-quoted command line: Start-Process passes
  // a single string verbatim to CreateProcess, so the quoting must be done here.
  const argumentList = options.restart.args
    .map(windowsArgument)
    .join(" ")

  return `$ErrorActionPreference = 'Stop'
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}
try { $Host.UI.RawUI.WindowTitle = 'FocusCode - usage reset' } catch {}
Clear-Host

Write-Host '#####   ####    ####   #   #   ####' -ForegroundColor Cyan
Write-Host '#       #   #  #       #   #  #' -ForegroundColor Cyan
Write-Host '####    #   #  #       #   #   ###' -ForegroundColor Cyan
Write-Host '#       #   #  #       #   #      #' -ForegroundColor Cyan
Write-Host '#        ####    ####    ###   ####' -ForegroundColor Cyan
Write-Host ''
Write-Host ' hollup mate - resetting ur ip to another one so u can use ai again.' -ForegroundColor White
Write-Host ''

$cli = ${ps(options.cli)}
$appPid = ${options.pid}
$proxy = ${ps(options.port !== undefined ? `http://127.0.0.1:${options.port}` : "")}
$proxied = $false
$automatic = ${options.automatic ? "$true" : "$false"}
$restartExe = ${ps(options.restart.executable)}
$restartArgs = ${ps(argumentList)}
$restartCwd = ${ps(options.restart.directory)}

$torProxy = 'http://127.0.0.1:9250'
$torData = Join-Path $env:TEMP 'focustor-data'
$viaTor = $false
$torProcess = $null

function Step($text) { Write-Host "  > $text" -ForegroundColor DarkGray }
function Ok($text) { Write-Host "  + $text" -ForegroundColor Green }
function Bad($text) { Write-Host "  x $text" -ForegroundColor Red }

function TraceIp {
  $request = @{
    UseBasicParsing = $true
    Uri = 'https://www.cloudflare.com/cdn-cgi/trace'
    TimeoutSec = 8
  }

  $content = $null

  if ($proxy) {
    try {
      $content = (Invoke-WebRequest @request -Proxy $proxy).Content
      $script:proxied = $true
    } catch {}
  }

  if (-not $content) {
    $content = (Invoke-WebRequest @request).Content
  }

  $content -split '\\r?\\n' |
    Where-Object { $_ -match '^ip=' } |
    ForEach-Object { $_.Substring(3).Trim() } |
    Select-Object -First 1
}

# Strict tor-only trace: never falls back to the direct request, so a still-bootstrapping
# tunnel reads as no address instead of the machine's own one.
function TraceTor {
  $request = @{
    UseBasicParsing = $true
    Uri = 'https://www.cloudflare.com/cdn-cgi/trace'
    TimeoutSec = 12
  }

  try {
    $content = (Invoke-WebRequest @request -Proxy $torProxy).Content
  } catch {
    return $null
  }

  $content -split '\\r?\\n' |
    Where-Object { $_ -match '^ip=' } |
    ForEach-Object { $_.Substring(3).Trim() } |
    Select-Object -First 1
}

# Finds a tor.exe: PATH first, then the expert bundle and Tor Browser installs.
function FindTor {
  $candidates = @(
    (Join-Path $env:ProgramFiles 'Tor\\Tor\\tor.exe'),
    (Join-Path $env:ProgramFiles 'Tor Browser\\Browser\\TorBrowser\\Tor\\tor.exe'),
    (Join-Path $env:LOCALAPPDATA 'Tor Browser\\Browser\\TorBrowser\\Tor\\tor.exe'),
    (Join-Path $env:USERPROFILE 'Desktop\\Tor Browser\\Browser\\TorBrowser\\Tor\\tor.exe')
  )

  $x86 = [Environment]::GetEnvironmentVariable('ProgramFiles(x86)')

  if ($x86) {
    $candidates = @((Join-Path $x86 'Tor\\Tor\\tor.exe')) + $candidates
  }

  try {
    $paths = @((where.exe tor 2> $null) | Where-Object { $_ -match '\\.exe\\z' })
    if ($paths.Count -gt 0) { $candidates = $paths + $candidates }
  } catch {}

  foreach ($path in $candidates) {
    if ($path -and (Test-Path -LiteralPath $path.Trim() -PathType Leaf)) {
      return $path.Trim()
    }
  }

  return $null
}

# Ends every bun.exe and opencode*.exe on the machine, engine or not. This is deliberately blunt: a
# surviving engine gets adopted by the relaunched app with pre-reset API connections, which reads as
# a failed reset. Collateral is accepted: other bun projects lose their processes until relaunched.
function StopEngine {
  foreach ($name in @('bun', 'opencode*')) {
    try { Stop-Process -Name $name -Force -ErrorAction SilentlyContinue } catch {}
  }

  Start-Sleep -Milliseconds 600
}

# Kills a tor binary previously spawned by this script (recognised by the focustor
# data directory in its command line) so a new start gets fresh circuits. A user's
# own tor, such as Tor Browser's, has a different command line and survives.
function KillOldTor {  try {
    Get-CimInstance Win32_Process -Filter "Name = 'tor.exe'" -ErrorAction Stop |
      Where-Object { $_.CommandLine -and $_.CommandLine.Contains('focustor') } |
      ForEach-Object {
        try { Stop-Process -Id $_.ProcessId -Force -ErrorAction Stop } catch {}
      }
  } catch {}

  Start-Sleep -Milliseconds 500
}

$failure = $null
$warpDone = $false
$refusals = 0
$sameIp = 0

try {
  Step 'closing FocusCode...'

  $exitDeadline = (Get-Date).AddSeconds(30)

  while ((Get-Process -Id $appPid -ErrorAction SilentlyContinue) -and (Get-Date) -lt $exitDeadline) {
    Start-Sleep -Milliseconds 250
  }

  if (Get-Process -Id $appPid -ErrorAction SilentlyContinue) {
    throw 'FocusCode did not close within 30 seconds.'
  }

  Start-Sleep -Milliseconds 400

  Step 'stopping the background engine so the fresh session starts clean...'
  StopEngine

  $before = $null
  try { $before = TraceIp } catch {}

  Step 'asking Cloudflare for a fresh registration...'

  for ($attempt = 1; $attempt -le 4; $attempt++) {
    if ($attempt -gt 1) {
      $backoff = [int](5 * [Math]::Pow(2, $attempt - 2) + (Get-Random -Minimum 0 -Maximum 4))
      Step "attempt $attempt of 4: waiting $backoff seconds for the rate-limit window..."

      Start-Sleep -Seconds $backoff
    }

    & $cli --accept-tos --no-ansi disconnect | Out-Null
    if ($LASTEXITCODE -ne 0) { Step 'already disconnected.' }

    & $cli --accept-tos --no-ansi registration delete | Out-Null
    if ($LASTEXITCODE -ne 0) { Step 'no old registration to delete; continuing.' }

    & $cli --accept-tos --no-ansi registration new | Out-Null

    if ($LASTEXITCODE -ne 0) {
      Start-Sleep -Seconds 8
      & $cli --accept-tos --no-ansi registration new | Out-Null
    }

    if ($LASTEXITCODE -ne 0) {
      $failure = 'WARP refused the new registration (Cloudflare often rate-limits these after a few resets).'
      $refusals = $refusals + 1
      if ($refusals -ge 2) { break }

      continue
    }

    $refusals = 0

    & $cli --accept-tos --no-ansi connect | Out-Null
    if ($LASTEXITCODE -ne 0) {
      Start-Sleep -Seconds 3
      & $cli --accept-tos --no-ansi connect | Out-Null
    }

    if ($LASTEXITCODE -ne 0) { throw 'WARP refused to connect.' }

    Step 'waiting for the new address...'

    $after = $null
    $deadline = (Get-Date).AddSeconds(25)

    while ((Get-Date) -lt $deadline) {
      try {
        $ip = TraceIp
        if ($ip -and $ip -ne $before) {
          $after = $ip
          break
        }
      } catch {}

      Start-Sleep -Milliseconds 500
    }

    if ($after) {
      Write-Host ''

      if ($before) {
        Ok "new ip: $after (was $before)"
      } else {
        Ok "new ip: $after"
      }

      Ok 'done. back to vibecoding.'

      $warpDone = $true
      break
    }

    $failure = 'WARP connected, but the address did not change in time.'
    $sameIp = $sameIp + 1
    if ($sameIp -ge 2) { break }
  }
} catch {
  $failure = $_.Exception.Message
}

# WARP exhausted: Cloudflare refused or handed back the same address. Different transport
# instead of a third registration: tor on a dedicated HTTP tunnel port, which both the app
# (Chromium proxy switch) and the engine (HTTPS_PROXY) can traverse; socks5 by contrast
# stops the engine bridge.
if (-not $warpDone) {
  Write-Host ''
  Bad "reset failed: $failure"

  Step 'falling back to a tor exit so the ip still changes...'

  $torExe = FindTor

  if ($torExe) {
    Step "using $torExe"

    KillOldTor

    try {
      $torProcess = Start-Process -FilePath $torExe -ArgumentList @('--HTTPTunnelPort', '9250', '--SocksPort', '0', '--DataDirectory', $torData) -WindowStyle Hidden -PassThru -ErrorAction Stop
      Start-Sleep -Seconds 2
    } catch {
      $torProcess = $null
    }

    if ($torProcess) {
      Step 'waiting for tor to pick an exit node (up to 90 seconds)...'

      $after = $null
      $gone = $false
      $torDeadline = (Get-Date).AddSeconds(90)

      while ((Get-Date) -lt $torDeadline) {
        $gone = $false
        try { $gone = [bool]$torProcess.HasExited } catch {}

        if ($gone) { break }

        try {
          $ip = TraceTor
          if ($ip -and $ip -ne $before) { $after = $ip; break }
        } catch {}

        Start-Sleep -Milliseconds 1500
      }

      if ($after) {
        $viaTor = $true
        $failure = $null

        Write-Host ''
        Ok "new ip: $after (via tor)"
        Ok 'done. back to vibecoding.'
      } else {
        KillOldTor

        if ($gone) {
          Bad 'tor exited immediately (port busy, or this tor build lacks HTTPTunnelPort).'
        } else {
          Bad 'tor did not deliver an address in time.'
        }
      }
    } else {
      Bad 'tor could not be started.'
    }
  } else {
    Bad 'no tor.exe found on this machine (install Tor Browser or the Tor expert bundle).'
  }

  if (-not $viaTor) {
    Step 'reconnecting the tunnel so the machine still has net...'

    & $cli --accept-tos --no-ansi connect | Out-Null
    if ($LASTEXITCODE -ne 0) {
      & $cli --accept-tos --no-ansi registration new | Out-Null
      & $cli --accept-tos --no-ansi connect | Out-Null
    }
  }
}

Write-Host ''

if ($viaTor) {
  $proxy = $torProxy
  $proxied = $true
}

if ($proxied) {
  Step 'pointing FocusCode at the new address...'

  $env:HTTPS_PROXY = $proxy
  $env:HTTP_PROXY = $proxy
  $env:FOCUSCODE_PROXY = $proxy

  $env:NO_PROXY = (
    @($env:NO_PROXY, '127.0.0.1', 'localhost', '::1') |
      Where-Object { $_ } |
      ForEach-Object { $_.Trim() } |
      Where-Object { $_ } |
      Select-Object -Unique
  ) -join ','
} else {
  Remove-Item Env:HTTPS_PROXY -ErrorAction SilentlyContinue
  Remove-Item Env:HTTP_PROXY -ErrorAction SilentlyContinue
  Remove-Item Env:FOCUSCODE_PROXY -ErrorAction SilentlyContinue
}

if ($viaTor -and -not $automatic) {
  Write-Host ' (tor keeps running in the background; a new reset will pick up a fresh exit.)'
}

Step 'detaching FocusCode from the terminal...'

try {
  if (-not (Test-Path -LiteralPath $restartExe -PathType Leaf)) {
    throw "Executable not found: $restartExe"
  }

  if (-not (Test-Path -LiteralPath $restartCwd -PathType Container)) {
    throw "Working directory not found: $restartCwd"
  }

  $commandLine = '"' + $restartExe + '"'

  if ($restartArgs) {
    $commandLine = $commandLine + ' ' + $restartArgs
  }

  # The relaunched app must not share the reset console's process set: closing the window
  # sends the console close event down the chain, Chromium's network service dies with
  # STATUS_CONTROL_C_EXIT (0xC000013A) and the app follows. The cmd start relay is how
  # run.bat launches focuscode; it detaches the app from the console entirely.
  Start-Process -FilePath $env:ComSpec -ArgumentList ('/c start "" ' + $commandLine) -WorkingDirectory $restartCwd -WindowStyle Hidden -ErrorAction Stop

  Ok 'FocusCode launcher started independently.'

} catch {
  Bad "Launch failed: $($_.Exception.Message)"
}

Write-Host ''
Write-Host '========================================' -ForegroundColor Cyan
Write-Host ' Finished. Check the messages above.' -ForegroundColor Cyan
Write-Host '========================================' -ForegroundColor Cyan

Read-Host 'Press Enter to close this window'

if ($failure) { exit 1 }
exit 0
`
}
