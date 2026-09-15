#!/usr/bin/env bash
set -Eeuo pipefail

if [[ ${EUID} -ne 0 ]]; then
  echo "请使用 sudo bash deploy/install-native-backend.sh" >&2
  exit 1
fi

if [[ $(uname -m) != "x86_64" ]]; then
  echo "当前安装包只支持 x86_64 ECS。" >&2
  exit 1
fi

SOURCE_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
NODE_VERSION="22.17.0"
NODE_ARCHIVE="node-v${NODE_VERSION}-linux-x64.tar.xz"
NODE_SHA256="325c0f1261e0c61bcae369a1274028e9cfb7ab7949c05512c5b1e630f7e80e12"
NODE_HOME="/opt/node-v${NODE_VERSION}"

if [[ ! -x "${NODE_HOME}/bin/node" ]]; then
  DOWNLOAD_DIR=$(mktemp -d /tmp/mario-node-install.XXXXXX)
  trap 'rm -rf -- "${DOWNLOAD_DIR}"' EXIT
  curl --fail --location --show-error \
    "https://mirrors.aliyun.com/nodejs-release/v${NODE_VERSION}/${NODE_ARCHIVE}" \
    --output "${DOWNLOAD_DIR}/${NODE_ARCHIVE}"
  printf '%s  %s\n' "${NODE_SHA256}" "${DOWNLOAD_DIR}/${NODE_ARCHIVE}" | sha256sum --check --status
  install -d -m 0755 "${NODE_HOME}"
  tar -xJf "${DOWNLOAD_DIR}/${NODE_ARCHIVE}" -C "${NODE_HOME}" --strip-components=1
fi

if ! getent passwd mario-race >/dev/null; then
  useradd --system --home /var/lib/mario-race --shell /usr/sbin/nologin mario-race
fi

install -d -o root -g root -m 0755 /opt/mario-race-backend /opt/mario-race-backend/server /opt/mario-race-backend/shared /opt/mario-race-backend/scripts /opt/mario-race-backend/deploy
install -d -o mario-race -g mario-race -m 0750 /var/lib/mario-race /var/backups/mario-race
install -d -o root -g mario-race -m 0750 /etc/mario-race
cp -a "${SOURCE_DIR}/server/." /opt/mario-race-backend/server/
cp -a "${SOURCE_DIR}/shared/." /opt/mario-race-backend/shared/
cp -a "${SOURCE_DIR}/scripts/backup.mjs" /opt/mario-race-backend/scripts/backup.mjs
install -o root -g root -m 0644 "${SOURCE_DIR}/deploy/Caddyfile.host" /opt/mario-race-backend/deploy/Caddyfile.host
install -o root -g root -m 0644 "${SOURCE_DIR}/deploy/mario-race.service" /etc/systemd/system/mario-race.service

if [[ ! -f /etc/mario-race/backend.env ]]; then
  install -o root -g mario-race -m 0640 "${SOURCE_DIR}/deploy/backend-native.env.example" /etc/mario-race/backend.env
  echo "已创建 /etc/mario-race/backend.env；后续更新不会覆盖它。"
fi

systemctl daemon-reload
systemctl enable --now mario-race.service

if ! docker image inspect caddy:2 >/dev/null 2>&1; then
  echo "缺少本地 caddy:2 镜像，请先成功拉取或导入该镜像。" >&2
  exit 1
fi

docker volume create mario-race-caddy-data >/dev/null
docker volume create mario-race-caddy-config >/dev/null
if docker container inspect mario-race-caddy >/dev/null 2>&1; then
  docker rm --force mario-race-caddy >/dev/null
fi
docker run --detach \
  --name mario-race-caddy \
  --restart unless-stopped \
  --network host \
  --env DOMAIN=backend.zhangzidan.com \
  --volume /opt/mario-race-backend/deploy/Caddyfile.host:/etc/caddy/Caddyfile:ro \
  --volume mario-race-caddy-data:/data \
  --volume mario-race-caddy-config:/config \
  caddy:2 >/dev/null

echo "Node: $("${NODE_HOME}/bin/node" --version)"
echo "API service: $(systemctl is-active mario-race.service)"
echo "Caddy container: $(docker inspect --format '{{.State.Status}}' mario-race-caddy)"
echo "下一步检查: curl -i https://backend.zhangzidan.com/api/health"
