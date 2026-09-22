param([switch]$Json)
$ErrorActionPreference = 'SilentlyContinue'
$Root = Split-Path -Parent $PSScriptRoot
function Load-EnvFile($Path) {
  if (-not (Test-Path $Path)) { return }
  Get-Content $Path | ForEach-Object {
    $line=$_.Trim(); if (-not $line -or $line.StartsWith('#') -or -not $line.Contains('=')) { return }
    $parts=$line.Split('=',2); $key=$parts[0].Trim(); $value=$parts[1].Trim().Trim('"').Trim("'")
    if (-not [Environment]::GetEnvironmentVariable($key,'Process')) { [Environment]::SetEnvironmentVariable($key,$value,'Process') }
  }
}
Load-EnvFile (Join-Path $Root 'config\app.env')
Load-EnvFile (Join-Path $Root 'apps\relatorio-os\.env')
$base= if ($env:EVOLUTION_BASE_URL) {$env:EVOLUTION_BASE_URL.TrimEnd('/')} else {'http://127.0.0.1:8080'}
$instance= if ($env:EVOLUTION_INSTANCE) {$env:EVOLUTION_INSTANCE} else {'sgp-whatsapp'}
$container= if ($env:POSTGRES_CONTAINER) {$env:POSTGRES_CONTAINER} else {'evolution_postgres'}
$dbuser= if ($env:POSTGRES_USER) {$env:POSTGRES_USER} else {'evolution'}
$db= if ($env:POSTGRES_DB) {$env:POSTGRES_DB} else {'evolution'}
$port= if ($env:CENTRAL_OS_PORT) {[int]$env:CENTRAL_OS_PORT} else {8788}
$result=[ordered]@{}
& docker info *> $null; $result.Docker=($LASTEXITCODE -eq 0)
$pg = & docker exec $container psql -U $dbuser -d $db -t -A -c 'SELECT 1;' 2>$null
$result.PostgreSQL=($LASTEXITCODE -eq 0 -and ($pg -join '').Trim() -eq '1')
try { $r=Invoke-WebRequest -Uri $base -UseBasicParsing -TimeoutSec 5; $result.Evolution=$true } catch { if ($_.Exception.Response) {$result.Evolution=$true} else {$result.Evolution=$false} }
$result.WhatsApp=$false; $result.WhatsAppState=$null
if ($env:AUTHENTICATION_API_KEY) {
  try { $state=Invoke-RestMethod -Uri "$base/instance/connectionState/$instance" -Headers @{apikey=$env:AUTHENTICATION_API_KEY} -TimeoutSec 8; $s=if($state.instance.state){$state.instance.state}else{$state.state};$result.WhatsAppState=$s;$result.WhatsApp=($s -in @('open','connected')) } catch {}
}
$listenerProcesses=@(
  Get-CimInstance Win32_Process | Where-Object {
    ($_.Name -match '^python(w)?\.exe$') -and
    ($_.CommandLine -like '*COMANDO_WHATSAPP_RELATORIO_USUARIOS.py*')
  }
)
$listenerPids=@($listenerProcesses | ForEach-Object { $_.ProcessId })
$listeners=@(
  $listenerProcesses | Where-Object {
    $_.ParentProcessId -notin $listenerPids
  }
)
$result.Listener=($listeners.Count -eq 1)
$result.ListenerCount=$listeners.Count
$result.ListenerProcessCount=$listenerProcesses.Count
try { $h=Invoke-RestMethod -Uri "http://127.0.0.1:$port/api/resumo" -TimeoutSec 5; $result.CentralOS=$true } catch {$result.CentralOS=$false}
$result.OK=($result.Docker -and $result.PostgreSQL -and $result.Evolution -and $result.WhatsApp -and $result.Listener -and $result.CentralOS)
if ($Json) { $result | ConvertTo-Json -Depth 4 } else {
  foreach($k in @('Docker','PostgreSQL','Evolution','WhatsApp','Listener','CentralOS')) { $v=if($result[$k]){'OK'}else{'ERRO'}; Write-Host ("{0,-18} {1}" -f ($k+' .......'),$v) }
  if (-not $result.WhatsApp) { Write-Host "WhatsApp state: $($result.WhatsAppState)" }
  if ($result.ListenerCount -ne 1) { Write-Host "Listeners encontrados: $($result.ListenerCount)" }
}
if ($result.OK) { exit 0 } else { exit 1 }
