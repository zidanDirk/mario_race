#!/usr/bin/env bash
set -Eeuo pipefail

ARCHIVE=${1:-/tmp/mario-backend-relay.tar.gz}
INCOMING_ENV=${2:-/tmp/mario-backend-relay.env}
APP_DIR=/opt/mario-race-backend
ENV_FILE=/etc/mario-race/backend.env
NODE=/opt/node-v22.17.0/bin/node
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
NEXT_DIR="${APP_DIR}.next-${STAMP}"
BACKUP_DIR="${APP_DIR}.pre-${STAMP}"
FAILED_DIR="${APP_DIR}.failed-${STAMP}"
ENV_BACKUP="${ENV_FILE}.pre-${STAMP}"
SWAPPED=false

if [[ ${EUID} -ne 0 ]]; then
  echo "Run as root" >&2
  exit 1
fi
[[ -f ${ARCHIVE} && -f ${INCOMING_ENV} && -d ${APP_DIR} && -f ${ENV_FILE} ]]

cleanup() {
  rm -f -- "${ARCHIVE}" "${INCOMING_ENV}"
  [[ ! -d ${NEXT_DIR} ]] || mv -- "${NEXT_DIR}" "${FAILED_DIR}.staging"
}

rollback() {
  local status=$?
  trap - ERR
  if [[ ${SWAPPED} == true && -d ${BACKUP_DIR} ]]; then
    systemctl stop mario-race.service || true
    [[ ! -d ${APP_DIR} ]] || mv -- "${APP_DIR}" "${FAILED_DIR}"
    mv -- "${BACKUP_DIR}" "${APP_DIR}"
    install -o root -g mario-race -m 0640 "${ENV_BACKUP}" "${ENV_FILE}"
    systemctl start mario-race.service || true
  fi
  cleanup
  exit "${status}"
}
trap rollback ERR

# Create an online SQLite snapshot before replacing code or configuration.
set -a
source "${ENV_FILE}"
set +a
(cd "${APP_DIR}" && "${NODE}" scripts/backup.mjs >/dev/null)

mkdir -m 0755 "${NEXT_DIR}"
tar -xzf "${ARCHIVE}" -C "${NEXT_DIR}"
chown -R root:root "${NEXT_DIR}"
find "${NEXT_DIR}" -type d -exec chmod 0755 {} +
find "${NEXT_DIR}" -type f -exec chmod 0644 {} +
chmod 0755 "${NEXT_DIR}/deploy/rollout-native-backend.sh"
install -o root -g mario-race -m 0640 "${ENV_FILE}" "${ENV_BACKUP}"

# Validate the incoming configuration before it can affect the running service.
unset GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET GOOGLE_RELAY_URL GOOGLE_RELAY_SECRET WECHAT_APP_ID WECHAT_APP_SECRET
set -a
source "${INCOMING_ENV}"
set +a
(cd "${NEXT_DIR}" && "${NODE}" --input-type=module -e "import('./server/config.mjs').then(({readConfig})=>readConfig())")

mv -- "${APP_DIR}" "${BACKUP_DIR}"
mv -- "${NEXT_DIR}" "${APP_DIR}"
install -o root -g mario-race -m 0640 "${INCOMING_ENV}" "${ENV_FILE}"
SWAPPED=true
systemctl restart mario-race.service

healthy=false
for _ in {1..15}; do
  if curl --fail --silent --show-error --max-time 2 http://127.0.0.1:3001/api/health >/dev/null; then
    healthy=true
    break
  fi
  sleep 1
done
[[ ${healthy} == true ]]

trap - ERR
cleanup
echo "Backend rollout complete: ${STAMP}"
systemctl is-active mario-race.service
