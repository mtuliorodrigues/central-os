param([switch]$Force, [switch]$Quiet)
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$LegacyApp = 'C:\EvolutionSGP\app'
function Say($m) { if (-not $Quiet) { Write-Host $m } }

$rootEnv = Join-Path $Root 'config\app.env'
$rootExample = Join-Path $Root 'config\app.env.example'
if (-not (Test-Path $rootEnv) -and (Test-Path $rootExample)) {
  Copy-Item $rootExample $rootEnv
  Say '[OK] config\app.env criado a partir do exemplo.'
}

$copies = @(
  @{ Src=(Join-Path $LegacyApp '.env'); Dst=(Join-Path $Root 'apps\relatorio-os\.env'); Label='.env do Relatorio OS' },
  @{ Src=(Join-Path $LegacyApp 'grupos_relatorio_os.json'); Dst=(Join-Path $Root 'apps\relatorio-os\config\grupos_relatorio_os.json'); Label='grupos do Relatorio OS' },
  @{ Src=(Join-Path $LegacyApp 'usuarios_relatorio.json'); Dst=(Join-Path $Root 'apps\relatorio-os\config\usuarios_relatorio.json'); Label='usuarios do Relatorio OS' }
)
foreach ($item in $copies) {
  if (-not (Test-Path $item.Src)) { Say "[INFO] Origem ausente: $($item.Src)"; continue }
  $dir = Split-Path -Parent $item.Dst
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
  if ((Test-Path $item.Dst) -and -not $Force) { Say "[OK] $($item.Label) ja existe na copia; preservado."; continue }
  Copy-Item $item.Src $item.Dst -Force
  Say "[OK] $($item.Label) copiado para o projeto integrado (origem intacta)."
}
