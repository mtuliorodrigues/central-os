param([switch]$Json)
$ErrorActionPreference = 'SilentlyContinue'
$ProgressPreference = 'SilentlyContinue'
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
$evolutionContainer= if ($env:EVOLUTION_CONTAINER) {$env:EVOLUTION_CONTAINER} else {'evolution_api'}
$expectedEvolutionImage= if ($env:EVOLUTION_EXPECTED_IMAGE) {$env:EVOLUTION_EXPECTED_IMAGE} else {'evolution-api-forward-sync-direct:2.3.7-phase2-fix1'}
$container= if ($env:POSTGRES_CONTAINER) {$env:POSTGRES_CONTAINER} else {'evolution_postgres'}
$redisContainer= if ($env:REDIS_CONTAINER) {$env:REDIS_CONTAINER} else {'evolution_redis'}
$dbuser= if ($env:POSTGRES_USER) {$env:POSTGRES_USER} else {'evolution'}
$db= if ($env:POSTGRES_DB) {$env:POSTGRES_DB} else {'evolution'}
$port= if ($env:CENTRAL_OS_PORT) {[int]$env:CENTRAL_OS_PORT} else {8788}
$groupsFile= if ($env:RELATORIO_GROUPS_FILE) {$env:RELATORIO_GROUPS_FILE} else {Join-Path $Root 'apps\relatorio-os\config\grupos_relatorio_os.json'}
$usersFile= if ($env:RELATORIO_USERS_FILE) {$env:RELATORIO_USERS_FILE} else {Join-Path $Root 'apps\relatorio-os\config\usuarios_relatorio.json'}
$result=[ordered]@{}
& docker info *> $null; $result.Docker=($LASTEXITCODE -eq 0)
$pg = & docker exec $container psql -U $dbuser -d $db -t -A -c 'SELECT 1;' 2>$null
$result.PostgreSQL=($LASTEXITCODE -eq 0 -and ($pg -join '').Trim() -eq '1')
$redis = & docker exec $redisContainer redis-cli ping 2>$null
$result.Redis=($LASTEXITCODE -eq 0 -and ($redis -join '').Trim() -eq 'PONG')
try { $r=Invoke-WebRequest -Uri $base -UseBasicParsing -TimeoutSec 5; $result.Evolution=$true } catch { if ($_.Exception.Response) {$result.Evolution=$true} else {$result.Evolution=$false} }
$activeEvolutionImage = (& docker inspect --format '{{.Config.Image}}' $evolutionContainer 2>$null | Select-Object -First 1)
$result.EvolutionImage=([bool]$activeEvolutionImage -and $activeEvolutionImage.Trim() -eq $expectedEvolutionImage)
$result.EvolutionImageActive=if($activeEvolutionImage){$activeEvolutionImage.Trim()}else{$null}
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
try {
  $groups=Get-Content -LiteralPath $groupsFile -Raw | ConvertFrom-Json
  $origin=if($groups.origem){$groups.origem}elseif($groups.grupo_origem){$groups.grupo_origem}else{$null}
  $destination=if($groups.destino){$groups.destino}elseif($groups.grupo_destino){$groups.grupo_destino}else{$null}
  $originId=if($origin){if($origin.id){$origin.id}elseif($origin.jid){$origin.jid}else{$origin.group_id}}else{$null}
  $destinationId=if($destination){if($destination.id){$destination.id}elseif($destination.jid){$destination.jid}else{$destination.group_id}}else{$null}
  $users=Get-Content -LiteralPath $usersFile -Raw | ConvertFrom-Json
  $result.RelatorioConfig=([bool]$originId -and [bool]$destinationId -and $null -ne $users)
} catch {$result.RelatorioConfig=$false}
try {
  $h=Invoke-RestMethod -Uri "http://127.0.0.1:$port/api/health" -TimeoutSec 5
  $summary=Invoke-RestMethod -Uri "http://127.0.0.1:$port/api/resumo" -TimeoutSec 5
  $result.CentralOS=([bool]$h.ok -and $null -ne $summary)
} catch {$result.CentralOS=$false}
$result.OK=($result.Docker -and $result.PostgreSQL -and $result.Redis -and $result.Evolution -and $result.EvolutionImage -and $result.WhatsApp -and $result.RelatorioConfig -and $result.Listener -and $result.CentralOS)
if ($Json) { $result | ConvertTo-Json -Depth 4 } else {
  Write-Host ''
  Write-Host '=== RESUMO CENTRAL OS LOCAL ==='
  foreach($k in @('Docker','PostgreSQL','Redis','Evolution','EvolutionImage','WhatsApp','RelatorioConfig','Listener','CentralOS')) { $v=if($result[$k]){'OK'}else{'ERRO'}; Write-Host ("{0,-24} {1}" -f ($k+' .......'),$v) }
  if (-not $result.EvolutionImage) { Write-Host "Evolution image: $($result.EvolutionImageActive)" }
  if (-not $result.WhatsApp) { Write-Host "WhatsApp state: $($result.WhatsAppState)" }
  if ($result.ListenerCount -ne 1) { Write-Host "Listeners encontrados: $($result.ListenerCount)" }
  $ready=if($result.OK){'SIM'}else{'NAO'}
  Write-Host "Central OS Local pronta para uso: $ready"
}
if ($result.OK) { exit 0 } else { exit 1 }
