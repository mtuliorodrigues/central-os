#!/usr/bin/env bash
set -euo pipefail

# User data is intentionally secret-free. Values arrive through IAM/SSM/Secrets Manager.
DATA_DEVICE="${CENTRAL_OS_DATA_DEVICE:-/dev/xvdf}"
DATA_MOUNT="/srv/central-os"

if ! command -v docker >/dev/null 2>&1; then
  dnf install -y docker
  systemctl enable --now docker
fi
mkdir -p "$DATA_MOUNT"

if ! findmnt -rn -T "$DATA_MOUNT" >/dev/null 2>&1; then
  if ! blkid "$DATA_DEVICE" >/dev/null 2>&1; then
    mkfs.xfs "$DATA_DEVICE"
  fi
  UUID="$(blkid -s UUID -o value "$DATA_DEVICE")"
  grep -q "UUID=$UUID" /etc/fstab || echo "UUID=$UUID $DATA_MOUNT xfs defaults,nofail 0 2" >> /etc/fstab
  mount "$DATA_MOUNT"
fi

install -d -o root -g docker -m 0750 \
  "$DATA_MOUNT"/{postgres,evolution,planilhas,reports,logs,backups,config}
install -d -o root -g docker -m 0750 /etc/central-os

# The deployment workflow obtains the ECR login token through the instance role.
# It must fetch runtime env from Secrets Manager/SSM; no secret is embedded here.
systemctl enable docker
