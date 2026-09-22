$ErrorActionPreference='Stop'
$Root=Split-Path -Parent $PSScriptRoot
$LogDir=Join-Path $Root 'logs\inicializador'; New-Item -ItemType Directory -Force -Path $LogDir|Out-Null
$Stamp=Get-Date -Format 'yyyyMMdd-HHmmss'; $Log=Join-Path $LogDir "inicializacao_$Stamp.log"
function Log($m){$line="[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $m";Write-Host $line;Add-Content -Path $Log -Value $line -Encoding UTF8}
function Load-EnvFile($Path){if(-not(Test-Path $Path)){return};Get-Content $Path|ForEach-Object{$line=$_.Trim();if(-not $line -or $line.StartsWith('#') -or -not $line.Contains('=')){return};$parts=$line.Split('=',2);$k=$parts[0].Trim();$v=$parts[1].Trim().Trim('"').Trim("'");if(-not [Environment]::GetEnvironmentVariable($k,'Process')){[Environment]::SetEnvironmentVariable($k,$v,'Process')}}}
function Wait-Until([scriptblock]$Check,[int]$Seconds,[string]$Label){$end=(Get-Date).AddSeconds($Seconds);do{if(& $Check){Log "[OK] $Label";return $true};Start-Sleep -Seconds 2}while((Get-Date)-lt$end);throw "$Label nao ficou disponivel em $Seconds segundos."}
Log '=== CENTRAL OS INTEGRADA ==='
if(-not(Test-Path (Join-Path $Root 'config\app.env'))){Copy-Item (Join-Path $Root 'config\app.env.example') (Join-Path $Root 'config\app.env');Log '[INFO] config\app.env criado.'}
& (Join-Path $PSScriptRoot 'IMPORTAR_CONFIG_LOCAL.ps1') -Quiet
Load-EnvFile (Join-Path $Root 'config\app.env');Load-EnvFile (Join-Path $Root 'apps\relatorio-os\.env')
$env:CENTRAL_OS_ROOT=$Root
if(-not $env:CENTRAL_OS_PORT){$env:CENTRAL_OS_PORT='8788'}
if(-not $env:EVOLUTION_BASE_URL){$env:EVOLUTION_BASE_URL='http://127.0.0.1:8080'}
if(-not $env:EVOLUTION_INSTANCE){$env:EVOLUTION_INSTANCE='sgp-whatsapp'}
if(-not $env:POSTGRES_CONTAINER){$env:POSTGRES_CONTAINER='evolution_postgres'}
if(-not $env:POSTGRES_USER){$env:POSTGRES_USER='evolution'}
if(-not $env:POSTGRES_DB){$env:POSTGRES_DB='evolution'}
$env:RELATORIO_PLANILHAS_DIR= if($env:RELATORIO_PLANILHAS_DIR){$env:RELATORIO_PLANILHAS_DIR}else{Join-Path $Root 'data\planilhas'}
$env:RELATORIO_GROUPS_FILE= if($env:RELATORIO_GROUPS_FILE){$env:RELATORIO_GROUPS_FILE}else{Join-Path $Root 'apps\relatorio-os\config\grupos_relatorio_os.json'}
$env:RELATORIO_USERS_FILE= if($env:RELATORIO_USERS_FILE){$env:RELATORIO_USERS_FILE}else{Join-Path $Root 'apps\relatorio-os\config\usuarios_relatorio.json'}
$env:RELATORIO_OUTPUT_DIR= if($env:RELATORIO_OUTPUT_DIR){$env:RELATORIO_OUTPUT_DIR}else{Join-Path $Root 'data\relatorio-os\saida'}
$env:RELATORIO_LISTENER_LOG_DIR= if($env:RELATORIO_LISTENER_LOG_DIR){$env:RELATORIO_LISTENER_LOG_DIR}else{Join-Path $Root 'logs\relatorio-os\listener'}
New-Item -ItemType Directory -Force -Path $env:RELATORIO_PLANILHAS_DIR,$env:RELATORIO_OUTPUT_DIR,$env:RELATORIO_LISTENER_LOG_DIR|Out-Null

if(-not(Get-Command docker.exe -ErrorAction SilentlyContinue)){throw 'Docker CLI nao encontrado.'}
& docker info *> $null
if($LASTEXITCODE -ne 0){
  $dockerDesktop=@("$env:ProgramFiles\Docker\Docker\Docker Desktop.exe","$env:LOCALAPPDATA\Docker\Docker Desktop.exe")|Where-Object{Test-Path $_}|Select-Object -First 1
  if(-not $dockerDesktop){throw 'Docker Desktop nao encontrado.'}
  Log '[INFO] Iniciando Docker Desktop existente...';Start-Process $dockerDesktop
  Wait-Until { & docker info *> $null; $LASTEXITCODE -eq 0 } 180 'Docker Engine pronto'|Out-Null
}else{Log '[OK] Docker Engine ativo.'}

$base=$env:EVOLUTION_BASE_URL.TrimEnd('/')
function Evo-Up { try {Invoke-WebRequest -Uri $base -UseBasicParsing -TimeoutSec 3|Out-Null;return $true}catch{if($_.Exception.Response){return $true};return $false} }
if(-not(Evo-Up)){
  if($env:ALLOW_START_EXISTING_EVOLUTION -match '^(?i:true|1|yes|sim)$'){
    $evoDir=if($env:EVOLUTION_EXISTING_DIR){$env:EVOLUTION_EXISTING_DIR}else{'C:\EvolutionSGP\evolution'}
    $compose=@('docker-compose.yml','docker-compose.yaml','compose.yml','compose.yaml')|ForEach-Object{Join-Path $evoDir $_}|Where-Object{Test-Path $_}|Select-Object -First 1
    if(-not $compose){throw "Compose existente nao encontrado em $evoDir"}
    Log "[INFO] Subindo SOMENTE a stack Evolution existente: $compose";& docker compose -f $compose up -d 2>&1|Tee-Object -FilePath $Log -Append|Out-Host
    if($LASTEXITCODE -ne 0){throw 'Falha ao subir a stack Evolution existente.'}
  }else{throw 'Evolution indisponivel e inicio automatico da stack existente desativado.'}
}
Wait-Until { Evo-Up } 120 'Evolution respondendo'|Out-Null
Wait-Until { $v=& docker exec $env:POSTGRES_CONTAINER psql -U $env:POSTGRES_USER -d $env:POSTGRES_DB -t -A -c 'SELECT 1;' 2>$null; ($LASTEXITCODE -eq 0 -and ($v -join '').Trim() -eq '1') } 120 'PostgreSQL SELECT 1'|Out-Null
if(-not $env:AUTHENTICATION_API_KEY){throw 'AUTHENTICATION_API_KEY ausente. Importe/configure o .env local.'}
$state=Invoke-RestMethod -Uri "$base/instance/connectionState/$($env:EVOLUTION_INSTANCE)" -Headers @{apikey=$env:AUTHENTICATION_API_KEY} -TimeoutSec 10
$s=if($state.instance.state){$state.instance.state}else{$state.state};if($s -notin @('open','connected')){throw "WhatsApp nao conectado. Estado: $s"};Log "[OK] WhatsApp $($env:EVOLUTION_INSTANCE) conectado ($s)."

$ReportApp=Join-Path $Root 'apps\relatorio-os';$venvPy=Join-Path $ReportApp '.venv\Scripts\python.exe'
if(-not(Test-Path $venvPy)){
  $py=(Get-Command py.exe -ErrorAction SilentlyContinue);if($py){& py -3 -m venv (Join-Path $ReportApp '.venv')}else{& python -m venv (Join-Path $ReportApp '.venv')}
  if($LASTEXITCODE -ne 0){throw 'Falha ao criar .venv do Relatorio OS.'}
  & $venvPy -m pip install -r (Join-Path $ReportApp 'requirements.txt') 2>&1|Tee-Object -FilePath $Log -Append|Out-Host
  if($LASTEXITCODE -ne 0){throw 'Falha ao instalar dependencias Python.'}
}
$env:RELATORIO_PYTHON=$venvPy
& $venvPy -m py_compile (Join-Path $ReportApp 'src\motor_relatorio_os.py') (Join-Path $ReportApp 'src\COMANDO_WHATSAPP_RELATORIO_USUARIOS.py');if($LASTEXITCODE -ne 0){throw 'Falha de sintaxe Python.'};Log '[OK] Runtime Python validado.'
$listeners=@(Get-CimInstance Win32_Process|Where-Object{($_.Name -match '^python(w)?\.exe$') -and ($_.CommandLine -like '*COMANDO_WHATSAPP_RELATORIO_USUARIOS.py*')})
if($listeners.Count -gt 1){throw "Ha $($listeners.Count) listeners ativos. Pare duplicatas antes de continuar."}
if($listeners.Count -eq 0){
  $listenerScript=Join-Path $ReportApp 'src\COMANDO_WHATSAPP_RELATORIO_USUARIOS.py';$out=Join-Path $env:RELATORIO_LISTENER_LOG_DIR "stdout_$Stamp.log";$err=Join-Path $env:RELATORIO_LISTENER_LOG_DIR "stderr_$Stamp.log"
  $listenerArg='"'+$listenerScript+'"'
  $p=Start-Process -FilePath $venvPy -ArgumentList @('-u',$listenerArg) -WorkingDirectory (Join-Path $ReportApp 'src') -RedirectStandardOutput $out -RedirectStandardError $err -PassThru -WindowStyle Hidden
  Start-Sleep -Seconds 5;if($p.HasExited){throw "Listener integrado encerrou. Veja $err"};Log "[OK] Listener integrado iniciado. PID=$($p.Id)."
}else{Log "[OK] Listener ja ativo. PID=$($listeners[0].ProcessId). Nenhuma duplicata criada."}

if(-not(Get-Command node.exe -ErrorAction SilentlyContinue)){throw 'Node.js nao encontrado.'}
$Central=Join-Path $Root 'apps\central-os'
if(-not(Test-Path (Join-Path $Central 'node_modules'))){Log '[INFO] Instalando dependencias Node...';Push-Location $Central;try{& npm install --no-audit --no-fund 2>&1|Tee-Object -FilePath $Log -Append|Out-Host;if($LASTEXITCODE -ne 0){throw 'npm install falhou.'}}finally{Pop-Location}}
$port=[int]$env:CENTRAL_OS_PORT;$existing=$false
try{$h=Invoke-RestMethod -Uri "http://127.0.0.1:$port/api/health" -TimeoutSec 3;if($h.service -eq 'central-os-integrada'){$existing=$true}}catch{}
if(-not $existing){
  $occupied=Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
  if($occupied){throw "Porta $port ja ocupada por outro processo."}
  $nodeOut=Join-Path $Root "logs\central-os\stdout_$Stamp.log";$nodeErr=Join-Path $Root "logs\central-os\stderr_$Stamp.log";New-Item -ItemType Directory -Force -Path (Split-Path $nodeOut)|Out-Null
  $np=Start-Process -FilePath 'node.exe' -ArgumentList @('src/server.js') -WorkingDirectory $Central -RedirectStandardOutput $nodeOut -RedirectStandardError $nodeErr -PassThru -WindowStyle Hidden
  Start-Sleep -Seconds 3;if($np.HasExited){throw "Central OS encerrou. Veja $nodeErr"};Log "[OK] Central OS iniciada. PID=$($np.Id)."
}else{Log '[OK] Central OS Integrada ja estava ativa.'}
Wait-Until { try { $x=Invoke-RestMethod -Uri "http://127.0.0.1:$port/api/resumo" -TimeoutSec 3; return $null -ne $x } catch { return $false } } 30 'API Central OS funcional'|Out-Null
Log "[OK] Sistema iniciado. Painel: http://127.0.0.1:$port"
Write-Host ''; & (Join-Path $PSScriptRoot 'healthcheck.ps1');$hc=$LASTEXITCODE
Write-Host "`nLog: $Log"
if($hc -ne 0){exit 1}
