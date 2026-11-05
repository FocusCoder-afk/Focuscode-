
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

$failure = $null

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

  $before = $null
  try { $before = TraceIp } catch {}

  Step 'asking Cloudflare for a fresh registration...'

  & $cli --accept-tos --no-ansi disconnect | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'WARP disconnect failed.' }

  & $cli --accept-tos --no-ansi registration delete | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'WARP registration deletion failed.' }

  & $cli --accept-tos --no-ansi registration new | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'WARP refused the new registration.' }

  & $cli --accept-tos --no-ansi connect | Out-Null
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

  if (-not $after) {
    throw 'WARP connected, but the address did not change in time.'
  }

  Write-Host ''

  if ($before) {
    Ok "new ip: $after (was $before)"
  } else {
    Ok "new ip: $after"
  }

  Ok 'done. back to vibecoding.'

} catch {
  $failure = $_.Exception.Message
  Write-Host ''
  Bad "reset failed: $failure"
}

Write-Host ''

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
