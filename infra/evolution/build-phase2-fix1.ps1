param(
  [string]$SourceDir = 'C:\EvolutionSGP\evolution-forward-src',
  [string]$ImageTag = 'evolution-api-forward-sync-direct:2.3.7-phase2-fix1'
)

$ErrorActionPreference = 'Stop'
$BaseCommit = 'cd800f2976e1e5b682fbf86a01ee4d85ae61f370'
$Patch = Join-Path $PSScriptRoot 'patches\evolution-api-2.3.7-phase2-fix1.patch'
$Worktree = Join-Path ([IO.Path]::GetTempPath()) ("central-os-evolution-phase2-" + [guid]::NewGuid().ToString('N'))

if (-not (Test-Path (Join-Path $SourceDir '.git'))) { throw "Repositorio Evolution nao encontrado em $SourceDir" }
if (-not (Test-Path $Patch)) { throw "Patch nao encontrado: $Patch" }

try {
  & git -C $SourceDir cat-file -e "$BaseCommit^{commit}"
  if ($LASTEXITCODE -ne 0) { throw "Commit base Evolution indisponivel: $BaseCommit" }

  & git -C $SourceDir worktree add --detach $Worktree $BaseCommit
  if ($LASTEXITCODE -ne 0) { throw 'Falha ao criar worktree temporario da Evolution.' }

  & git -C $Worktree apply --check $Patch
  if ($LASTEXITCODE -ne 0) { throw 'O patch phase2-fix1 nao se aplica ao commit base.' }
  & git -C $Worktree apply $Patch
  if ($LASTEXITCODE -ne 0) { throw 'Falha ao aplicar o patch phase2-fix1.' }

  & docker build --tag $ImageTag $Worktree
  if ($LASTEXITCODE -ne 0) { throw 'Build Docker da Evolution phase2-fix1 falhou.' }

  Write-Host "Imagem criada: $ImageTag"
} finally {
  if (Test-Path $Worktree) {
    & git -C $SourceDir worktree remove --force $Worktree 2>$null
  }
}
