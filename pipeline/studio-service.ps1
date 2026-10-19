param(
  [ValidateSet('Install', 'Run', 'Start', 'Stop', 'Status', 'Uninstall')][string]$Action = 'Status',
  [Parameter(Mandatory = $true)][string]$StateDirectory
)
$ErrorActionPreference = 'Stop'
$studioState = (Resolve-Path -LiteralPath $StateDirectory).Path
$studioConfig = Get-Content -LiteralPath (Join-Path $studioState 'lifecycle-config.json') -Raw | ConvertFrom-Json
if ($studioConfig.mode -ne 'production' -or $studioConfig.run_id -ne 'evz-food-beverage') { throw 'Only the private production workspace is supported by this startup task.' }
if ($studioState.Contains('"') -or $PSCommandPath.Contains('"')) { throw 'Unsupported quote in startup path.' }
$studioTaskName = 'EVZ Studio Operations'
$studioArgs = '-NoProfile -NonInteractive -WindowStyle Hidden -File "' + $PSCommandPath + '" -Action Run -StateDirectory "' + $studioState + '"'
function Test-StudioPathIdentity([string]$Candidate, [string]$Expected) {
  if ([string]::IsNullOrWhiteSpace($Candidate) -or [string]::IsNullOrWhiteSpace($Expected) -or
      $Candidate -cnotmatch '^[A-Za-z]:[\\/]' -or $Expected -cnotmatch '^[A-Za-z]:[\\/]') { return $false }
  # Accept only Windows slash direction and path-letter case differences.
  # Exact equality after that normalization rejects prefixes, dot segments,
  # alternate release directories and other ambiguous path spellings.
  $left = $Candidate.Replace('/', '\')
  $right = $Expected.Replace('/', '\')
  return [string]::Equals($left, $right, [System.StringComparison]::OrdinalIgnoreCase)
}
function Assert-StudioTaskAction($Task, [string]$ScriptPath, [string]$StatePath, [string]$WorkingDirectory) {
  $mismatch = 'The installed task belongs to a different runtime; use its reviewed service script.'
  if (-not $Task -or $Task.TaskName -cne $studioTaskName -or $Task.Actions.Count -ne 1) { throw $mismatch }
  $taskAction = $Task.Actions[0]
  if (-not [string]::Equals($taskAction.Execute, 'powershell.exe', [System.StringComparison]::OrdinalIgnoreCase) -or
      -not (Test-StudioPathIdentity $taskAction.WorkingDirectory $WorkingDirectory)) { throw $mismatch }
  $argumentsPattern = '^-NoProfile -NonInteractive -WindowStyle Hidden -File "([^"]+)" -Action Run -StateDirectory "([^"]+)"$'
  if ($taskAction.Arguments -cnotmatch $argumentsPattern) { throw $mismatch }
  $taskScriptPath = $Matches[1]
  $taskStatePath = $Matches[2]
  if (-not (Test-StudioPathIdentity $taskScriptPath $ScriptPath) -or
      -not (Test-StudioPathIdentity $taskStatePath $StatePath)) { throw $mismatch }
}
if ($Action -eq 'Install') {
  $studioExisting = Get-ScheduledTask -TaskName $studioTaskName -ErrorAction SilentlyContinue
  if ($studioExisting) { throw 'The startup task already exists; inspect it instead of overwriting it.' }
  $studioRun = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $studioArgs -WorkingDirectory $PSScriptRoot
  $studioUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
  $studioTrigger = New-ScheduledTaskTrigger -AtLogOn -User $studioUser
  $studioPrincipal = New-ScheduledTaskPrincipal -UserId $studioUser -LogonType Interactive -RunLevel Limited
  $studioSettings = New-ScheduledTaskSettingsSet -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
  Register-ScheduledTask -TaskName $studioTaskName -Action $studioRun -Trigger $studioTrigger -Principal $studioPrincipal -Settings $studioSettings -Description 'Private EVZ Studio Operations host. Connector/research release remains separately gated.' | Select-Object TaskName, State
} elseif ($Action -eq 'Run') {
  $env:STUDIO_LIFECYCLE_STATE_DIR = $studioState
  $studioNode = (Get-Command node.exe).Source
  $studioLogDirectory = Join-Path $studioState 'service-logs'
  New-Item -ItemType Directory -Path $studioLogDirectory -Force | Out-Null
  $studioLog = Join-Path $studioLogDirectory ('service-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.log')
  & $studioNode (Join-Path $PSScriptRoot 'lifecycle-cli.mjs') service *> $studioLog
  exit $LASTEXITCODE
} elseif ($Action -eq 'Start') {
  $studioTask = Get-ScheduledTask -TaskName $studioTaskName
  Assert-StudioTaskAction $studioTask $PSCommandPath $studioState $PSScriptRoot
  Start-ScheduledTask -TaskName $studioTaskName
} elseif ($Action -eq 'Stop') {
  $studioTask = Get-ScheduledTask -TaskName $studioTaskName
  Assert-StudioTaskAction $studioTask $PSCommandPath $studioState $PSScriptRoot
  $studioLockPath = Join-Path $studioState 'operations-service.lock'
  $studioOwnedPid = $null
  if (Test-Path -LiteralPath $studioLockPath) {
    $studioLock = Get-Content -LiteralPath $studioLockPath -Raw | ConvertFrom-Json
    if ($studioLock.run_id -ne $studioConfig.run_id -or ($studioLock.pid -isnot [int] -and $studioLock.pid -isnot [long]) -or $studioLock.pid -le 0 -or $studioLock.pid -gt [int]::MaxValue) { throw 'Unrecognized service lock; preserve it for inspection.' }
    $studioProcess = Get-CimInstance Win32_Process -Filter ('ProcessId=' + $studioLock.pid)
    if ($studioProcess) {
      $studioNode = (Get-Command node.exe).Source
      $studioCommand = '"' + $studioNode + '" "' + (Join-Path $PSScriptRoot 'lifecycle-cli.mjs') + '" service'
      $studioStarted = [DateTimeOffset]::Parse($studioLock.started_at).UtcDateTime
      if ($studioProcess.ExecutablePath -ine $studioNode -or $studioProcess.CommandLine -cne $studioCommand -or $studioProcess.CreationDate.ToUniversalTime() -gt $studioStarted) { throw 'The recorded process identity changed; do not stop it.' }
      $studioOwnedPid = [int]$studioLock.pid
    }
  } elseif ($studioTask.State -eq 'Running') { throw 'The service has not saved its process identity yet; wait and inspect before stopping.' }
  Stop-ScheduledTask -TaskName $studioTaskName
  if ($studioOwnedPid -and (Get-Process -Id $studioOwnedPid -ErrorAction SilentlyContinue)) {
    # Task Scheduler stops the PowerShell wrapper but can leave Node and its connector children alive.
    & (Join-Path $env:SystemRoot 'System32/taskkill.exe') /PID $studioOwnedPid /T /F
    if ($LASTEXITCODE -ne 0 -and (Get-Process -Id $studioOwnedPid -ErrorAction SilentlyContinue)) { throw 'The owned service process did not stop.' }
  }
  if ($studioOwnedPid -and (Get-Process -Id $studioOwnedPid -ErrorAction SilentlyContinue)) { throw 'The owned service process is still running.' }
  # Retain its reservation/lock files; the exclusive host verifies and archives dead locks on restart.
} elseif ($Action -eq 'Uninstall') {
  $studioTask = Get-ScheduledTask -TaskName $studioTaskName
  Assert-StudioTaskAction $studioTask $PSCommandPath $studioState $PSScriptRoot
  if ($studioTask.State -eq 'Running') { throw 'Stop and verify the owned process first.' }
  Unregister-ScheduledTask -TaskName $studioTaskName -Confirm:$false
} else {
  Get-ScheduledTask -TaskName $studioTaskName -ErrorAction SilentlyContinue | Select-Object TaskName, State
  Get-ScheduledTaskInfo -TaskName $studioTaskName -ErrorAction SilentlyContinue | Select-Object LastRunTime, LastTaskResult, NextRunTime
}
