param(
  [string]$LegacyRelatorioApp = 'C:\EvolutionSGP\app',
  [string]$LegacyCentralUrl = 'http://127.0.0.1:8787'
)
$ErrorActionPreference = 'SilentlyContinue'
$Root = Split-Path -Parent $PSScriptRoot
$OutDir = Join-Path $Root 'logs\baseline'
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$Stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$Out = Join-Path $OutDir "baseline-atual-$Stamp.txt"
function W([string]$s=''){ $s | Tee-Object -FilePath $Out -Append | Out-Host }
function Load-EnvFile($Path){
  if(-not(Test-Path $Path)){return}
  Get-Content $Path | ForEach-Object {
    $line=$_.Trim(); if(-not $line -or $line.StartsWith('#') -or -not $line.Contains('=')){return}
    $parts=$line.Split('=',2); $k=$parts[0].Trim(); $v=$parts[1].Trim().Trim('"').Trim("'")
    if(-not [Environment]::GetEnvironmentVariable($k,'Process')){[Environment]::SetEnvironmentVariable($k,$v,'Process')}
  }
}
Load-EnvFile (Join-Path $LegacyRelatorioApp '.env')
$base = if($env:EVOLUTION_BASE_URL){$env:EVOLUTION_BASE_URL.TrimEnd('/')}else{'http://127.0.0.1:8080'}
$instance = if($env:EVOLUTION_INSTANCE){$env:EVOLUTION_INSTANCE}else{'sgp-whatsapp'}
$container = if($env:POSTGRES_CONTAINER){$env:POSTGRES_CONTAINER}else{'evolution_postgres'}
$dbuser = if($env:POSTGRES_USER){$env:POSTGRES_USER}else{'evolution'}
$db = if($env:POSTGRES_DB){$env:POSTGRES_DB}else{'evolution'}
W 'CENTRAL OS INTEGRADA - CAPTURA DE BASELINE DO SISTEMA ATUAL'
W ("Data: {0}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'))
W 'Somente leitura. Nenhum arquivo/volume/sessao e alterado.'
W ''
W '=== A - INFRAESTRUTURA ==='
& docker info *> $null; W ("Docker Engine: {0}" -f $(if($LASTEXITCODE -eq 0){'OK'}else{'ERRO'}))
$pg = & docker exec $container psql -U $dbuser -d $db -t -A -c 'SELECT 1;' 2>$null
W ("PostgreSQL SELECT 1: {0}" -f $(if($LASTEXITCODE -eq 0 -and ($pg -join '').Trim() -eq '1'){'OK'}else{'ERRO'}))
try { Invoke-WebRequest -Uri $base -UseBasicParsing -TimeoutSec 5 | Out-Null; W 'Evolution HTTP: OK' } catch { if($_.Exception.Response){W 'Evolution HTTP: OK (respondeu com status HTTP)'}else{W 'Evolution HTTP: ERRO'} }
if($env:AUTHENTICATION_API_KEY){
  try {
    $state=Invoke-RestMethod -Uri "$base/instance/connectionState/$instance" -Headers @{apikey=$env:AUTHENTICATION_API_KEY} -TimeoutSec 8
    $s=if($state.instance.state){$state.instance.state}else{$state.state}
    W ("WhatsApp {0}: {1}" -f $instance,$s)
  } catch { W ("WhatsApp {0}: ERRO" -f $instance) }
}else{ W 'WhatsApp: NAO TESTADO (chave ausente no ambiente carregado)' }
W ''
W '=== B - LISTENER ==='
$listeners=@(Get-CimInstance Win32_Process | Where-Object { ($_.Name -match '^python(w)?\.exe$') -and ($_.CommandLine -like '*COMANDO_WHATSAPP_RELATORIO_USUARIOS.py*') })
W ("Listeners encontrados: {0}" -f $listeners.Count)
$listeners | ForEach-Object { W ("PID: {0}" -f $_.ProcessId) }
W ''
W '=== D - HASHES DO RUNTIME ATUAL ==='
foreach($name in @('motor_relatorio_os.py','COMANDO_WHATSAPP_RELATORIO_USUARIOS.py')){
  $p=Join-Path $LegacyRelatorioApp $name
  if(Test-Path $p){$h=(Get-FileHash -Algorithm SHA256 $p).Hash.ToLower();W ("{0}: {1}" -f $name,$h)}else{W ("{0}: AUSENTE" -f $name)}
}
W ''
W '=== F/G/H/J - CENTRAL OS ATUAL ==='
try {
  $summary=Invoke-RestMethod -Uri "$LegacyCentralUrl/api/resumo" -TimeoutSec 5
  W 'API /api/resumo: OK'
  if($summary.counts){
    W ("Relatorios: {0}" -f $summary.counts.reportsGenerated)
    W ("Analisadas: {0}" -f $summary.counts.analyzed)
    W ("Localizadas: {0}" -f $summary.counts.located)
    W ("Nao localizadas: {0}" -f $summary.counts.notLocated)
    W ("Possivelmente fechadas: {0}" -f $summary.counts.possiblyClosed)
    W ("Pendentes: {0}" -f $summary.counts.pending)
  }
} catch { W 'API /api/resumo: ERRO/indisponivel' }
try { $hist=Invoke-RestMethod -Uri "$LegacyCentralUrl/api/historico" -TimeoutSec 5; W ("Historico: OK ({0} registro(s))" -f @($hist.history).Count) } catch { W 'Historico: ERRO/indisponivel' }
try { $groups=Invoke-RestMethod -Uri "$LegacyCentralUrl/api/grupos" -TimeoutSec 5; W ("Grupos: OK ({0} configurado(s), nomes/JIDs omitidos)" -f @($groups.groups).Count) } catch { W 'Grupos: ERRO/indisponivel' }
W ''
W '=== C/E - VALIDACAO MANUAL OBRIGATORIA ==='
W '[ ] Enviar !relatorio por usuario registrado.'
W '[ ] Confirmar deteccao do comando no log.'
W '[ ] Confirmar planilha/origem/destino esperados.'
W '[ ] Confirmar pelo menos uma mensagem realmente encaminhada no grupo destino.'
W '[ ] Anotar totais: original / apos filtros / encontradas / revisar / nao encontradas / enviadas.'
W ''
W ("Arquivo: {0}" -f $Out)
