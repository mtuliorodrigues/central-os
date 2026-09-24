$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $Root 'config\app.env'
$appRole = if ($env:CENTRAL_OS_DATABASE_APP_ROLE) { $env:CENTRAL_OS_DATABASE_APP_ROLE } else { 'central_os_app' }
$container = if ($env:POSTGRES_CONTAINER) { $env:POSTGRES_CONTAINER } else { 'evolution_postgres' }
$adminUser = if ($env:CENTRAL_OS_DATABASE_ADMIN_USER) { $env:CENTRAL_OS_DATABASE_ADMIN_USER } elseif ($env:POSTGRES_USER) { $env:POSTGRES_USER } else { 'evolution' }
$target = if ($env:CENTRAL_OS_DATABASE_NAME) { $env:CENTRAL_OS_DATABASE_NAME } else { 'central_os' }
if ($target -notmatch '^[A-Za-z_][A-Za-z0-9_]*$') { throw 'CENTRAL_OS_DATABASE_NAME inválido.' }
if ($adminUser -notmatch '^[A-Za-z_][A-Za-z0-9_]*$') { throw 'CENTRAL_OS_DATABASE_ADMIN_USER inválido.' }
if ($appRole -notmatch '^[A-Za-z_][A-Za-z0-9_]*$') { throw 'CENTRAL_OS_DATABASE_APP_ROLE inválido.' }

function Set-LocalEnvValue([string]$Key, [string]$Value) {
  $lines = if (Test-Path $envFile) { @(Get-Content $envFile) } else { @() }
  $replacement = "$Key=$Value"
  if ($lines -match "^$Key=") {
    $lines = $lines | ForEach-Object { if ($_ -match "^$Key=") { $replacement } else { $_ } }
  } else {
    $lines += $replacement
  }
  Set-Content -Path $envFile -Value $lines -Encoding utf8
}

Write-Host "Verificando database PostgreSQL separado: $target"
$exists = & docker exec $container psql -U $adminUser -d postgres -t -A -c "SELECT 1 FROM pg_database WHERE datname='$target';" 2>$null
if ($LASTEXITCODE -ne 0) { throw "Não foi possível consultar o PostgreSQL administrativo no container $container." }
if (($exists -join '').Trim() -eq '1') {
  Write-Host "Database $target já existe."
} else {
  & docker exec $container psql -U $adminUser -d postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE $target;"
  if ($LASTEXITCODE -ne 0) { throw "Falha ao criar o database $target." }
  Write-Host "Database $target criado."
}

$roleExists = (& docker exec $container psql -U $adminUser -d postgres -t -A -c "SELECT 1 FROM pg_roles WHERE rolname='$appRole';" 2>$null) -join ''
$configuredUrl = ''
if (Test-Path $envFile) {
  $configuredUrl = ((Get-Content $envFile | Where-Object { $_ -match '^CENTRAL_OS_DATABASE_URL=' }) -replace '^CENTRAL_OS_DATABASE_URL=', '') -join ''
}
if (-not $configuredUrl) {
  $bytes = New-Object byte[] 32
  [System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
  $password = [Convert]::ToBase64String($bytes).Replace('+','-').Replace('/','_').TrimEnd('=')
  $sql = @"
DO `$`$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '$appRole') THEN
    ALTER ROLE $appRole LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT PASSWORD '$password';
  ELSE
    CREATE ROLE $appRole LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT PASSWORD '$password';
  END IF;
END
`$`$;
"@
  $sql | docker exec -i $container psql -U $adminUser -d postgres -v ON_ERROR_STOP=1 | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Falha ao criar/configurar o role $appRole." }
  Set-LocalEnvValue 'CENTRAL_OS_DATABASE_URL' "postgresql://${appRole}:$password@127.0.0.1:15432/$target"
} elseif ($roleExists.Trim() -ne '1') {
  throw "CENTRAL_OS_DATABASE_URL existe, mas o role $appRole não foi encontrado."
}

$grantSql = @"
GRANT CONNECT ON DATABASE $target TO $appRole;
GRANT USAGE, CREATE ON SCHEMA public TO $appRole;
GRANT SELECT, INSERT, UPDATE, DELETE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public TO $appRole;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO $appRole;
DO `$`$
DECLARE r record;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I OWNER TO %I', r.tablename, '$appRole');
  END LOOP;
  FOR r IN SELECT sequencename FROM pg_sequences WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER SEQUENCE public.%I OWNER TO %I', r.sequencename, '$appRole');
  END LOOP;
END
`$`$;
"@
$grantSql | docker exec -i $container psql -U $adminUser -d $target -v ON_ERROR_STOP=1 | Out-Null
if ($LASTEXITCODE -ne 0) { throw "Falha ao conceder permissões no banco $target." }

Write-Host "Role $appRole configurado sem privilégios administrativos."
Push-Location (Join-Path $Root 'apps\central-os')
try {
  & npm run db:migrate
  if ($LASTEXITCODE -ne 0) { throw 'Migration da Central OS falhou.' }
} finally {
  Pop-Location
}
