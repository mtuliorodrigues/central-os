$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
if (Test-Path variable:PSNativeCommandUseErrorActionPreference) { $PSNativeCommandUseErrorActionPreference=$false }
$Root=Split-Path -Parent $PSScriptRoot
$LogDir=Join-Path $Root 'logs\inicializador'; New-Item -ItemType Directory -Force -Path $LogDir|Out-Null
$Stamp=Get-Date -Format 'yyyyMMdd-HHmmss'; $Log=Join-Path $LogDir "inicializacao_$Stamp.log"
function Log($m){$line="[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $m";Write-Host $line;Add-Content -Path $Log -Value $line -Encoding UTF8}
trap { Log "[FALHA] $($_.Exception.Message)"; Write-Host "Log: $Log"; exit 1 }
function Invoke-ExternalLogged([string]$File,[object[]]$Arguments){
  $previous=$ErrorActionPreference
  $stderrFile=Join-Path $LogDir "external_stderr_$PID.tmp"
  try {
    $ErrorActionPreference='Continue'
    & $File @Arguments 2> $stderrFile|Tee-Object -FilePath $Log -Append|Out-Host
    $code=$LASTEXITCODE
    if(Test-Path $stderrFile){
      $stderr=@(Get-Content $stderrFile)
      if($stderr.Count){$stderr|Add-Content -Path $Log -Encoding UTF8;if($code -ne 0){$stderr|Out-Host}}
    }
    return $code
  } finally {Remove-Item $stderrFile -Force -ErrorAction SilentlyContinue;$ErrorActionPreference=$previous}
}
function Load-EnvFile($Path){if(-not(Test-Path $Path)){return};Get-Content $Path|ForEach-Object{$line=$_.Trim();if(-not $line -or $line.StartsWith('#') -or -not $line.Contains('=')){return};$parts=$line.Split('=',2);$k=$parts[0].Trim();$v=$parts[1].Trim().Trim('"').Trim("'");if(-not [Environment]::GetEnvironmentVariable($k,'Process')){[Environment]::SetEnvironmentVariable($k,$v,'Process')}}}
function Wait-Until([scriptblock]$Check,[int]$Seconds,[string]$Label){$end=(Get-Date).AddSeconds($Seconds);do{if(& $Check){Log "[OK] $Label";return $true};Start-Sleep -Seconds 2}while((Get-Date)-lt$end);throw "$Label nao ficou disponivel em $Seconds segundos."}
Log '=== CENTRAL OS LOCAL ==='
if(-not(Test-Path (Join-Path $Root 'config\app.env'))){Copy-Item (Join-Path $Root 'config\app.env.example') (Join-Path $Root 'config\app.env');Log '[INFO] config\app.env criado.'}
& (Join-Path $PSScriptRoot 'IMPORTAR_CONFIG_LOCAL.ps1') -Quiet
Load-EnvFile (Join-Path $Root 'config\app.env');Load-EnvFile (Join-Path $Root 'apps\relatorio-os\.env')
$env:CENTRAL_OS_ROOT=$Root
if(-not $env:CENTRAL_OS_PORT){$env:CENTRAL_OS_PORT='8788'}
if(-not $env:EVOLUTION_BASE_URL){$env:EVOLUTION_BASE_URL='http://127.0.0.1:8080'}
if(-not $env:EVOLUTION_INSTANCE){$env:EVOLUTION_INSTANCE='sgp-whatsapp'}
if(-not $env:EVOLUTION_CONTAINER){$env:EVOLUTION_CONTAINER='evolution_api'}
if(-not $env:EVOLUTION_EXPECTED_IMAGE){$env:EVOLUTION_EXPECTED_IMAGE='evolution-api-forward-sync-direct:2.3.7-phase2-fix1'}
if(-not $env:POSTGRES_CONTAINER){$env:POSTGRES_CONTAINER='evolution_postgres'}
if(-not $env:POSTGRES_USER){$env:POSTGRES_USER='evolution'}
if(-not $env:POSTGRES_DB){$env:POSTGRES_DB='evolution'}
if(-not $env:REDIS_CONTAINER){$env:REDIS_CONTAINER='evolution_redis'}
$env:RELATORIO_PLANILHAS_DIR= if($env:RELATORIO_PLANILHAS_DIR){$env:RELATORIO_PLANILHAS_DIR}else{Join-Path $Root 'data\planilhas'}
$env:RELATORIO_GROUPS_FILE= if($env:RELATORIO_GROUPS_FILE){$env:RELATORIO_GROUPS_FILE}else{Join-Path $Root 'apps\relatorio-os\config\grupos_relatorio_os.json'}
$env:RELATORIO_USERS_FILE= if($env:RELATORIO_USERS_FILE){$env:RELATORIO_USERS_FILE}else{Join-Path $Root 'apps\relatorio-os\config\usuarios_relatorio.json'}
$env:RELATORIO_OUTPUT_DIR= if($env:RELATORIO_OUTPUT_DIR){$env:RELATORIO_OUTPUT_DIR}else{Join-Path $Root 'data\relatorio-os\saida'}
$env:RELATORIO_LISTENER_LOG_DIR= if($env:RELATORIO_LISTENER_LOG_DIR){$env:RELATORIO_LISTENER_LOG_DIR}else{Join-Path $Root 'logs\relatorio-os\listener'}
New-Item -ItemType Directory -Force -Path $env:RELATORIO_PLANILHAS_DIR,$env:RELATORIO_OUTPUT_DIR,$env:RELATORIO_LISTENER_LOG_DIR|Out-Null

if(-not(Get-Command docker.exe -ErrorAction SilentlyContinue)){throw 'Docker CLI nao encontrado.'}
function Docker-Up { try { & docker info *> $null; return ($LASTEXITCODE -eq 0) } catch { return $false } }
if(-not(Docker-Up)){
  $dockerDesktop=@("$env:ProgramFiles\Docker\Docker\Docker Desktop.exe","$env:LOCALAPPDATA\Docker\Docker Desktop.exe")|Where-Object{Test-Path $_}|Select-Object -First 1
  if(-not $dockerDesktop){throw 'Docker Desktop nao encontrado.'}
  Log '[INFO] Iniciando Docker Desktop existente...';Start-Process $dockerDesktop -WindowStyle Hidden
  Wait-Until { Docker-Up } 180 'Docker Engine pronto'|Out-Null
}else{Log '[OK] Docker Engine ativo.'}

$base=$env:EVOLUTION_BASE_URL.TrimEnd('/')
function Evo-Up { try {Invoke-WebRequest -Uri $base -UseBasicParsing -TimeoutSec 3|Out-Null;return $true}catch{if($_.Exception.Response){return $true};return $false} }
if(-not(Evo-Up)){
  if($env:ALLOW_START_EXISTING_EVOLUTION -match '^(?i:true|1|yes|sim)$'){
    $evoDir=if($env:EVOLUTION_EXISTING_DIR){$env:EVOLUTION_EXISTING_DIR}else{'C:\EvolutionSGP\evolution'}
    $compose=@('docker-compose.yml','docker-compose.yaml','compose.yml','compose.yaml')|ForEach-Object{Join-Path $evoDir $_}|Where-Object{Test-Path $_}|Select-Object -First 1
    if(-not $compose){throw "Compose existente nao encontrado em $evoDir"}
    Log "[INFO] Subindo SOMENTE a stack Evolution existente: $compose"
    $composeExit=Invoke-ExternalLogged -File 'docker.exe' -Arguments @('compose','-f',$compose,'up','-d')
    if($composeExit -ne 0){throw 'Falha ao subir a stack Evolution existente.'}
  }else{throw 'Evolution indisponivel e inicio automatico da stack existente desativado.'}
}
Wait-Until { Evo-Up } 120 'Evolution respondendo'|Out-Null
$activeEvolutionImage=(& docker inspect --format '{{.Config.Image}}' $env:EVOLUTION_CONTAINER 2>$null | Select-Object -First 1)
if(-not $activeEvolutionImage){throw "Container Evolution nao encontrado: $($env:EVOLUTION_CONTAINER)."}
if($activeEvolutionImage.Trim() -ne $env:EVOLUTION_EXPECTED_IMAGE){throw "Imagem Evolution ativa inesperada: $activeEvolutionImage. Esperada: $($env:EVOLUTION_EXPECTED_IMAGE)."}
Log "[OK] Evolution usa a imagem aprovada: $activeEvolutionImage."
function Postgres-Up { try { $v=& docker exec $env:POSTGRES_CONTAINER psql -U $env:POSTGRES_USER -d $env:POSTGRES_DB -t -A -c 'SELECT 1;' 2>$null; return ($LASTEXITCODE -eq 0 -and ($v -join '').Trim() -eq '1') } catch { return $false } }
function Redis-Up { try { $v=& docker exec $env:REDIS_CONTAINER redis-cli ping 2>$null; return ($LASTEXITCODE -eq 0 -and ($v -join '').Trim() -eq 'PONG') } catch { return $false } }
Wait-Until { Postgres-Up } 120 'PostgreSQL SELECT 1'|Out-Null
Wait-Until { Redis-Up } 120 'Redis PING'|Out-Null
if(-not $env:AUTHENTICATION_API_KEY){throw 'AUTHENTICATION_API_KEY ausente. Importe/configure o .env local.'}
$script:WhatsAppState=$null
function WhatsApp-Up {
  try {
    $state=Invoke-RestMethod -Uri "$base/instance/connectionState/$($env:EVOLUTION_INSTANCE)" -Headers @{apikey=$env:AUTHENTICATION_API_KEY} -TimeoutSec 10
    $script:WhatsAppState=if($state.instance.state){$state.instance.state}else{$state.state}
    return ($script:WhatsAppState -in @('open','connected'))
  } catch {$script:WhatsAppState='indisponivel';return $false}
}
Wait-Until { WhatsApp-Up } 180 "WhatsApp $($env:EVOLUTION_INSTANCE) conectado"|Out-Null
Log "[OK] Estado final do WhatsApp: $script:WhatsAppState."

$ReportApp=Join-Path $Root 'apps\relatorio-os';$venvPy=Join-Path $ReportApp '.venv\Scripts\python.exe'
if(-not(Test-Path $venvPy)){
  $py=(Get-Command py.exe -ErrorAction SilentlyContinue);if($py){& py -3 -m venv (Join-Path $ReportApp '.venv')}else{& python -m venv (Join-Path $ReportApp '.venv')}
  if($LASTEXITCODE -ne 0){throw 'Falha ao criar .venv do Relatorio OS.'}
  $pipExit=Invoke-ExternalLogged -File $venvPy -Arguments @('-m','pip','install','-r',(Join-Path $ReportApp 'requirements.txt'))
  if($pipExit -ne 0){throw 'Falha ao instalar dependencias Python.'}
}
$env:RELATORIO_PYTHON=$venvPy
& $venvPy -m py_compile (Join-Path $ReportApp 'src\motor_relatorio_os.py') (Join-Path $ReportApp 'src\COMANDO_WHATSAPP_RELATORIO_USUARIOS.py');if($LASTEXITCODE -ne 0){throw 'Falha de sintaxe Python.'};Log '[OK] Runtime Python validado.'

if(-not(Get-Command node.exe -ErrorAction SilentlyContinue)){throw 'Node.js nao encontrado.'}
$Central=Join-Path $Root 'apps\central-os'
if(-not(Test-Path (Join-Path $Central 'node_modules'))){Log '[INFO] Instalando dependencias Node...';Push-Location $Central;try{$npmExit=Invoke-ExternalLogged -File 'npm.cmd' -Arguments @('install','--no-audit','--no-fund');if($npmExit -ne 0){throw 'npm install falhou.'}}finally{Pop-Location}}
$port=[int]$env:CENTRAL_OS_PORT;$existing=$false
try{$h=Invoke-RestMethod -Uri "http://127.0.0.1:$port/api/health" -TimeoutSec 3;if($h.service -eq 'central-os-integrada'){$existing=$true}}catch{}
if(-not $existing){
  $occupied=Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
  if($occupied){throw "Porta $port ja ocupada por outro processo."}
  $nodeOut=Join-Path $Root "logs\central-os\stdout_$Stamp.log";$nodeErr=Join-Path $Root "logs\central-os\stderr_$Stamp.log";New-Item -ItemType Directory -Force -Path (Split-Path $nodeOut)|Out-Null
  $np=Start-Process -FilePath 'node.exe' -ArgumentList @('src/server.js') -WorkingDirectory $Central -RedirectStandardOutput $nodeOut -RedirectStandardError $nodeErr -PassThru -WindowStyle Hidden
  Start-Sleep -Seconds 3;if($np.HasExited){throw "Central OS encerrou. Veja $nodeErr"};Log "[OK] Central OS iniciada. PID=$($np.Id)."
}else{Log '[OK] Central OS Local ja estava ativa.'}
Wait-Until { try { $x=Invoke-RestMethod -Uri "http://127.0.0.1:$port/api/resumo" -TimeoutSec 3; return $null -ne $x } catch { return $false } } 30 'API Central OS funcional'|Out-Null

function Get-ListenerRoots {
  $all=@(Get-CimInstance Win32_Process|Where-Object{($_.Name -match '^python(w)?\.exe$') -and ($_.CommandLine -like '*COMANDO_WHATSAPP_RELATORIO_USUARIOS.py*')})
  $pids=@($all|ForEach-Object{$_.ProcessId})
  return @($all|Where-Object{$_.ParentProcessId -notin $pids})
}
$listeners=@(Get-ListenerRoots)
if($listeners.Count -gt 1){throw "Ha $($listeners.Count) listeners independentes ativos. Pare duplicatas antes de continuar."}
if($listeners.Count -eq 0){
  $listenerScript=Join-Path $ReportApp 'src\COMANDO_WHATSAPP_RELATORIO_USUARIOS.py';$out=Join-Path $env:RELATORIO_LISTENER_LOG_DIR "stdout_$Stamp.log";$err=Join-Path $env:RELATORIO_LISTENER_LOG_DIR "stderr_$Stamp.log"
  $listenerArg='"'+$listenerScript+'"'
  $p=Start-Process -FilePath $venvPy -ArgumentList @('-u',$listenerArg) -WorkingDirectory (Join-Path $ReportApp 'src') -RedirectStandardOutput $out -RedirectStandardError $err -PassThru -WindowStyle Hidden
  Start-Sleep -Seconds 5
  $listeners=@(Get-ListenerRoots)
  if($listeners.Count -ne 1){throw "Listener nao permaneceu ativo. Veja $err"}
  Log "[OK] Listener iniciado uma unica vez. PID=$($listeners[0].ProcessId)."
}else{Log "[OK] Listener ja ativo. PID=$($listeners[0].ProcessId). Nenhuma duplicata criada."}

Log "[OK] Componentes iniciados. Painel: http://127.0.0.1:$port"
Write-Host ''; & (Join-Path $PSScriptRoot 'healthcheck.ps1');$hc=$LASTEXITCODE
Write-Host "`nLog: $Log"
if($hc -ne 0){throw 'Um ou mais healthchecks falharam.'}
Log '[OK] CENTRAL OS LOCAL PRONTA PARA USO.'
