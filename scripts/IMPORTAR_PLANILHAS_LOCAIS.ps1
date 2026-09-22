param([switch]$Force)
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$Source = 'C:\RelatoriosSGP'
$Destination = Join-Path $Root 'data\planilhas'
New-Item -ItemType Directory -Force -Path $Destination | Out-Null
if (-not (Test-Path $Source)) { throw "Pasta legada nao encontrada: $Source" }
Get-ChildItem $Source -File | Where-Object { $_.Extension -in '.csv','.xlsx' } | ForEach-Object {
  $target = Join-Path $Destination $_.Name
  if ((Test-Path $target) -and -not $Force) { Write-Host "[PRESERVADO] $($_.Name)"; return }
  Copy-Item $_.FullName $target -Force
  Write-Host "[COPIADO] $($_.Name)"
}
$legacyReceived = Join-Path $Source 'Recebidas'
if (Test-Path $legacyReceived) {
  $received = Join-Path $Destination 'recebidas'; New-Item -ItemType Directory -Force -Path $received | Out-Null
  Get-ChildItem $legacyReceived -File | Where-Object { $_.Extension -in '.csv','.xlsx' } | ForEach-Object {
    $target=Join-Path $received $_.Name
    if ((Test-Path $target) -and -not $Force) { return }
    Copy-Item $_.FullName $target -Force
  }
}
Write-Host '[OK] Copia concluida. Nenhum arquivo da origem foi movido ou alterado.'
