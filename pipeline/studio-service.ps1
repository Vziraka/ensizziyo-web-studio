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
if ($Action -eq 'Install') {
  $studioExisting = Get-ScheduledTask -TaskName $studioTaskName -ErrorAction SilentlyContinue
  if ($studioExisting) { throw 'The startup task already exists; inspect it instead of overwriting it.' }
  $studioArgs = '-NoProfile -NonInteractive -WindowStyle Hidden -File "' + $PSCommandPath + '" -Action Run -StateDirectory "' + $studioState + '"'
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
  Start-ScheduledTask -TaskName $studioTaskName
} elseif ($Action -eq 'Stop') {
  Stop-ScheduledTask -TaskName $studioTaskName
} elseif ($Action -eq 'Uninstall') {
  $studioTask = Get-ScheduledTask -TaskName $studioTaskName
  if ($studioTask.State -eq 'Running') { throw 'Stop and verify the owned process first.' }
  Unregister-ScheduledTask -TaskName $studioTaskName -Confirm:$false
} else {
  Get-ScheduledTask -TaskName $studioTaskName -ErrorAction SilentlyContinue | Select-Object TaskName, State
  Get-ScheduledTaskInfo -TaskName $studioTaskName -ErrorAction SilentlyContinue | Select-Object LastRunTime, LastTaskResult, NextRunTime
}
