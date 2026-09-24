# PR validation probe: M3-B Windows playable entry.
param(
    [string]$RuntimeRoot = "G:\taurin4-openmmo-runtime",
    [switch]$ForceRebuild
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$PinnedOpenMmoCommit = "950e081c178d920c10c51f2d31f60c1b3383c925"
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$OpenMmoDir = Join-Path $RuntimeRoot "openmmo"
$CargoHome = Join-Path $RuntimeRoot ".cargo-home"
$CargoTargetDir = Join-Path $RuntimeRoot "openmmo-target"
$ToolsDir = Join-Path $RuntimeRoot ".tools"
$WasmPackRoot = Join-Path $ToolsDir "wasm-pack"
$TerrainDir = Join-Path $RuntimeRoot "empty-terrain"
$ServerPidFile = Join-Path $RuntimeRoot "openmmo-server.pid"
$ServerStdout = Join-Path $RuntimeRoot "openmmo-server.stdout.log"
$ServerStderr = Join-Path $RuntimeRoot "openmmo-server.stderr.log"
$ServerStamp = Join-Path $RuntimeRoot "server-pin.txt"

function Require-Command([string]$Name) {
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "Required command was not found: $Name"
    }
}

function Invoke-Checked {
    param(
        [Parameter(Mandatory = $true)]
        [string]$FilePath,
        [Parameter(ValueFromRemainingArguments = $true)]
        [string[]]$Arguments
    )

    & $FilePath @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "$FilePath failed with exit code $LASTEXITCODE"
    }
}

function Test-LocalPort([int]$Port) {
    $client = New-Object System.Net.Sockets.TcpClient
    try {
        $async = $client.BeginConnect("127.0.0.1", $Port, $null, $null)
        if (-not $async.AsyncWaitHandle.WaitOne(250)) {
            return $false
        }
        $client.EndConnect($async)
        return $true
    } catch {
        return $false
    } finally {
        $client.Close()
    }
}

if ($RuntimeRoot -notmatch "^[Gg]:\\") {
    throw "M3-B local runtime data must stay on G:. Use -RuntimeRoot G:\<folder>."
}

Require-Command "git"
Require-Command "cargo"
Require-Command "rustc"
Require-Command "npm"

New-Item -ItemType Directory -Force -Path $RuntimeRoot | Out-Null
New-Item -ItemType Directory -Force -Path $CargoHome | Out-Null
New-Item -ItemType Directory -Force -Path $CargoTargetDir | Out-Null
New-Item -ItemType Directory -Force -Path $ToolsDir | Out-Null
New-Item -ItemType Directory -Force -Path $TerrainDir | Out-Null

$env:CARGO_HOME = $CargoHome
$env:CARGO_TARGET_DIR = $CargoTargetDir

Write-Host "[M3-B] Runtime root: $RuntimeRoot"
Write-Host "[M3-B] Preparing pinned OpenMMO source..."

if (-not (Test-Path (Join-Path $OpenMmoDir ".git"))) {
    New-Item -ItemType Directory -Force -Path $OpenMmoDir | Out-Null
    Invoke-Checked "git" "-C" $OpenMmoDir "init"
    Invoke-Checked "git" "-C" $OpenMmoDir "remote" "add" "origin" "https://github.com/Julian-adv/OpenMMO.git"
} else {
    Invoke-Checked "git" "-C" $OpenMmoDir "remote" "set-url" "origin" "https://github.com/Julian-adv/OpenMMO.git"
}

Invoke-Checked "git" "-C" $OpenMmoDir "sparse-checkout" "init" "--no-cone"
Invoke-Checked "git" "-C" $OpenMmoDir "sparse-checkout" "set" "/Cargo.toml" "/Cargo.lock" "/.cargo/" "/agent-client/" "/server/" "/shared/" "/terrain/" "/tools/" "/data-src/" "/data/" "/client/public/models/objects/catalog.json"
Invoke-Checked "git" "-C" $OpenMmoDir "fetch" "--depth=1" "--filter=blob:none" "origin" $PinnedOpenMmoCommit
Invoke-Checked "git" "-C" $OpenMmoDir "checkout" "--detach" "FETCH_HEAD"

$ActualCommit = (& git -C $OpenMmoDir rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0 -or $ActualCommit -ne $PinnedOpenMmoCommit) {
    throw "Pinned OpenMMO verification failed. expected=$PinnedOpenMmoCommit actual=$ActualCommit"
}

if (-not (Test-Path (Join-Path $RepoRoot "node_modules"))) {
    Write-Host "[M3-B] Installing taurin4 dependencies..."
    Push-Location $RepoRoot
    try {
        Invoke-Checked "npm" "install" "--no-audit" "--no-fund"
    } finally {
        Pop-Location
    }
}

$WasmPack = Get-Command "wasm-pack" -ErrorAction SilentlyContinue
if (-not $WasmPack) {
    $LocalWasmPack = Join-Path $WasmPackRoot "bin\wasm-pack.exe"
    if (-not (Test-Path $LocalWasmPack)) {
        Write-Host "[M3-B] Installing wasm-pack under G: runtime tools..."
        Invoke-Checked "cargo" "install" "wasm-pack" "--locked" "--root" $WasmPackRoot
    }
    $env:PATH = (Join-Path $WasmPackRoot "bin") + ";" + $env:PATH
}

$ServerExe = Join-Path $CargoTargetDir "debug\onlinerpg-server.exe"
$ServerNeedsBuild =
    $ForceRebuild -or
    -not (Test-Path $ServerExe) -or
    -not (Test-Path $ServerStamp) -or
    ((Get-Content $ServerStamp -Raw).Trim() -ne $PinnedOpenMmoCommit)

if ($ServerNeedsBuild) {
    Write-Host "[M3-B] Building pinned OpenMMO server..."
    Push-Location $OpenMmoDir
    try {
        Invoke-Checked "cargo" "build" "-p" "onlinerpg-server" "--locked"
    } finally {
        Pop-Location
    }
    Set-Content -Path $ServerStamp -Value $PinnedOpenMmoCommit -NoNewline
} else {
    Write-Host "[M3-B] Reusing pinned OpenMMO server build."
}

$CodecPinFile = Join-Path $RepoRoot "public\openmmo-wasm\PINNED_OPENMMO.txt"
$CodecNeedsBuild = $ForceRebuild -or -not (Test-Path $CodecPinFile)
if (-not $CodecNeedsBuild) {
    $CodecNeedsBuild =
        -not ((Get-Content $CodecPinFile -Raw).Contains("source_commit=$PinnedOpenMmoCommit"))
}

if ($CodecNeedsBuild) {
    Write-Host "[M3-B] Building pinned OpenMMO browser codec..."
    $PreviousSourceDir = $env:OPENMMO_SOURCE_DIR
    $env:OPENMMO_SOURCE_DIR = $OpenMmoDir
    Push-Location $RepoRoot
    try {
        Invoke-Checked "npm" "run" "openmmo:codec"
    } finally {
        Pop-Location
        if ($null -eq $PreviousSourceDir) {
            Remove-Item Env:OPENMMO_SOURCE_DIR -ErrorAction SilentlyContinue
        } else {
            $env:OPENMMO_SOURCE_DIR = $PreviousSourceDir
        }
    }
} else {
    Write-Host "[M3-B] Reusing pinned OpenMMO browser codec."
}

if (Test-Path $ServerPidFile) {
    $OldPidText = (Get-Content $ServerPidFile -Raw).Trim()
    if ($OldPidText -match "^\d+$") {
        $OldProcess = Get-Process -Id ([int]$OldPidText) -ErrorAction SilentlyContinue
        if ($OldProcess) {
            Write-Host "[M3-B] Stopping previous managed OpenMMO server..."
            Stop-Process -Id $OldProcess.Id -Force
            $OldProcess.WaitForExit()
        }
    }
    Remove-Item $ServerPidFile -Force -ErrorAction SilentlyContinue
}

Remove-Item $ServerStdout -Force -ErrorAction SilentlyContinue
Remove-Item $ServerStderr -Force -ErrorAction SilentlyContinue

$ServerArgs = @(
    "--port", "10006",
    "--terrain-port", "10007",
    "--bind", "127.0.0.1",
    "--api-bind", "127.0.0.1",
    "--terrain-dir", $TerrainDir
)

Write-Host "[M3-B] Starting local OpenMMO server..."
$ServerProcess = $null

try {
    $ServerProcess = Start-Process -FilePath $ServerExe -ArgumentList $ServerArgs -WorkingDirectory $OpenMmoDir -WindowStyle Hidden -RedirectStandardOutput $ServerStdout -RedirectStandardError $ServerStderr -PassThru
    Set-Content -Path $ServerPidFile -Value $ServerProcess.Id -NoNewline

    $TokenFile = Join-Path $OpenMmoDir "data\npc_token"
    $Ready = $false
    for ($Attempt = 0; $Attempt -lt 120; $Attempt++) {
        if ($ServerProcess.HasExited) {
            throw "OpenMMO server exited during startup. See $ServerStdout and $ServerStderr"
        }

        if ((Test-LocalPort 10006) -and (Test-Path $TokenFile)) {
            $Ready = $true
            break
        }

        Start-Sleep -Milliseconds 250
    }

    if (-not $Ready) {
        throw "OpenMMO server did not become ready. See $ServerStdout and $ServerStderr"
    }

    $NpcToken = (Get-Content $TokenFile -Raw).Trim()
    if (-not $NpcToken) {
        throw "OpenMMO NPC token was empty: $TokenFile"
    }

    $env:TAURIN4_OPENMMO_SERVER_URL = "ws://127.0.0.1:10006"
    $env:TAURIN4_OPENMMO_ACCOUNT = "npc_idea2_player"
    $env:TAURIN4_OPENMMO_NPC_TOKEN = $NpcToken
    $env:TAURIN4_OPENMMO_AUTOSTART = "1"

    Write-Host "[M3-B] Server ready. Starting taurin4 in Real OpenMMO mode..."
    Write-Host "[M3-B] Character/world database is preserved under G: runtime data."

    Push-Location $RepoRoot
    try {
        Invoke-Checked "npm" "run" "tauri:dev"
    } finally {
        Pop-Location
    }
} finally {
    Remove-Item Env:TAURIN4_OPENMMO_NPC_TOKEN -ErrorAction SilentlyContinue
    Remove-Item Env:TAURIN4_OPENMMO_AUTOSTART -ErrorAction SilentlyContinue
    Remove-Item Env:TAURIN4_OPENMMO_SERVER_URL -ErrorAction SilentlyContinue
    Remove-Item Env:TAURIN4_OPENMMO_ACCOUNT -ErrorAction SilentlyContinue

    if ($null -ne $ServerProcess -and -not $ServerProcess.HasExited) {
        Write-Host "[M3-B] Stopping managed OpenMMO server..."
        Stop-Process -Id $ServerProcess.Id -Force -ErrorAction SilentlyContinue
        $ServerProcess.WaitForExit()
    }

    Remove-Item $ServerPidFile -Force -ErrorAction SilentlyContinue
}
