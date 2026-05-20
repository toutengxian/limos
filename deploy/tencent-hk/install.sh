#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/limos}"
BRANCH="${BRANCH:-main}"
DOMAIN="${DOMAIN:-hk.limos.best}"
PORT="${PORT:-3000}"
REPO_URL="${REPO_URL:-https://github.com/toutengxian/limos.git}"
SERVICE_NAME="${SERVICE_NAME:-limos}"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root: sudo bash deploy/tencent-hk/install.sh" >&2
  exit 1
fi

has_node_20() {
  if ! command -v node >/dev/null 2>&1; then
    return 1
  fi

  local major
  major="$(node -p 'Number(process.versions.node.split(".")[0])')"
  [[ "${major}" -ge 20 ]]
}

install_node_20() {
  if has_node_20; then
    return
  fi

  apt-get update
  apt-get install -y ca-certificates curl gnupg
  install -d -m 0755 /etc/apt/keyrings

  if [[ ! -f /etc/apt/keyrings/nodesource.gpg ]]; then
    curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
      | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
  fi

  echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_20.x nodistro main" \
    > /etc/apt/sources.list.d/nodesource.list
  apt-get update
  apt-get install -y nodejs
}

install_base_packages() {
  apt-get update
  apt-get install -y ca-certificates curl git nginx certbot python3-certbot-nginx
  install_node_20
}

sync_repo() {
  if [[ -d "${APP_DIR}/.git" ]]; then
    git -C "${APP_DIR}" fetch origin "${BRANCH}"
    git -C "${APP_DIR}" checkout "${BRANCH}"
    git -C "${APP_DIR}" pull --ff-only origin "${BRANCH}"
  else
    mkdir -p "$(dirname "${APP_DIR}")"
    git clone --branch "${BRANCH}" "${REPO_URL}" "${APP_DIR}"
  fi

  cd "${APP_DIR}"
  npm ci
}

write_env_template() {
  local env_file="${APP_DIR}/.env.production"
  if [[ -f "${env_file}" ]]; then
    return
  fi

  cat > "${APP_DIR}/.env.production.example" <<EOF
LIMOS_ENV=production
LIMOS_STORAGE_MODE=api
LIMOS_STATE_ID=limos-2026
LIMOS_SUPABASE_URL=https://YOUR_PROD_PROJECT_ID.supabase.co
LIMOS_SUPABASE_ANON_KEY=YOUR_PROD_SUPABASE_PUBLISHABLE_KEY
LIMOS_ADMIN_CODE_HASH=SHA256_OF_YOUR_PROD_ADMIN_CODE
PORT=${PORT}
HOST=127.0.0.1
EOF

  echo
  echo "Missing ${env_file}"
  echo "Created ${APP_DIR}/.env.production.example"
  echo "Copy it to ${env_file}, fill real production values, then rerun this script."
  exit 2
}

write_systemd_service() {
  cat > "/etc/systemd/system/${SERVICE_NAME}.service" <<EOF
[Unit]
Description=Limos Node Server
After=network.target

[Service]
Type=simple
WorkingDirectory=${APP_DIR}
Environment=LIMOS_ENV_FILE=${APP_DIR}/.env.production
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=5
User=root

[Install]
WantedBy=multi-user.target
EOF

  systemctl daemon-reload
  systemctl enable --now "${SERVICE_NAME}"
}

write_nginx_config() {
  cat > "/etc/nginx/sites-available/${SERVICE_NAME}" <<EOF
server {
  listen 80;
  server_name ${DOMAIN};

  location / {
    proxy_pass http://127.0.0.1:${PORT};
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
  }
}
EOF

  ln -sfn "/etc/nginx/sites-available/${SERVICE_NAME}" "/etc/nginx/sites-enabled/${SERVICE_NAME}"
  nginx -t
  systemctl reload nginx
}

verify_local() {
  curl -fsS "http://127.0.0.1:${PORT}/healthz" >/dev/null
}

install_base_packages
sync_repo
write_env_template
write_systemd_service
write_nginx_config
verify_local

echo
echo "Limos stage 1 server is running."
echo "Open http://${DOMAIN}/healthz after DNS points ${DOMAIN} to this server."
echo "For HTTPS, make sure Tencent Cloud firewall allows TCP 443 from 0.0.0.0/0, then run:"
echo "certbot --nginx --cert-name ${DOMAIN} -d ${DOMAIN} --key-type rsa --rsa-key-size 2048 --redirect"
