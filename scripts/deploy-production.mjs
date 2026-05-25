import { existsSync, unlinkSync } from "node:fs";
import { basename, join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

const args = new Set(process.argv.slice(2));
const refArg = process.argv.find((arg) => arg.startsWith("--ref="));

const config = {
  ref: refArg ? refArg.slice("--ref=".length) : process.env.LIMOS_DEPLOY_REF || "main",
  host: process.env.LIMOS_DEPLOY_HOST || "root@81.70.48.181",
  sshKey: process.env.LIMOS_DEPLOY_KEY || join(process.env.HOME || "", ".ssh/limos_deploy_ed25519"),
  appDir: process.env.LIMOS_REMOTE_APP_DIR || "/opt/limos",
  releasesDir: process.env.LIMOS_REMOTE_RELEASES_DIR || "/opt/limos.releases",
  backupsDir: process.env.LIMOS_REMOTE_BACKUPS_DIR || "/opt/limos.backups",
  domain: process.env.LIMOS_PRODUCTION_URL || "https://limos.top",
  skipCheck: args.has("--skip-check") || process.env.LIMOS_DEPLOY_SKIP_CHECK === "1",
  allowDirty: args.has("--allow-dirty") || process.env.LIMOS_DEPLOY_ALLOW_DIRTY === "1",
  allowNonMain: args.has("--allow-non-main") || process.env.LIMOS_DEPLOY_ALLOW_NON_MAIN === "1",
};

if (args.has("--help") || args.has("-h")) {
  console.log(`Usage: npm run deploy:prod -- [options]

Options:
  --ref=<git-ref>        Git ref to archive. Default: main
  --skip-check           Skip local npm run check
  --allow-dirty          Allow deploying while working tree has local changes
  --allow-non-main       Allow deploying from a branch other than main

Environment overrides:
  LIMOS_DEPLOY_HOST      Default: root@81.70.48.181
  LIMOS_DEPLOY_KEY       Default: ~/.ssh/limos_deploy_ed25519
  LIMOS_PRODUCTION_URL   Default: https://limos.top
`);
  process.exit(0);
}

main();

function main() {
  ensureSshKey();
  ensureMainBranch();
  ensureCleanTree();

  if (!config.skipCheck) {
    run("npm", ["run", "check"]);
  }

  const shortSha = capture("git", ["rev-parse", "--short", config.ref]);
  const archivePath = join(tmpdir(), `limos-${config.ref.replace(/[^a-zA-Z0-9._-]/g, "-")}-${shortSha}.tgz`);
  const remoteArchivePath = `/root/${basename(archivePath)}`;

  run("git", ["archive", "--format=tar.gz", "-o", archivePath, config.ref]);
  run("scp", [
    "-i",
    config.sshKey,
    "-o",
    "StrictHostKeyChecking=accept-new",
    archivePath,
    `${config.host}:${remoteArchivePath}`,
  ]);

  run("ssh", [
    "-i",
    config.sshKey,
    "-o",
    "StrictHostKeyChecking=accept-new",
    config.host,
    "bash",
    "-se",
  ], {
    input: buildRemoteDeployScript(remoteArchivePath, shortSha),
  });

  run("curl", ["-fsS", "--connect-timeout", "20", `${config.domain}/healthz`]);
  run("curl", ["-fsS", "--connect-timeout", "30", `${config.domain}/api/diagnostics`]);

  try {
    unlinkSync(archivePath);
  } catch {
    // Leaving a temp archive behind is harmless.
  }

  console.log(`\nDeployed ${config.ref} (${shortSha}) to ${config.domain}`);
}

function ensureSshKey() {
  if (!existsSync(config.sshKey)) {
    fail(`Missing SSH key: ${config.sshKey}`);
  }
}

function ensureMainBranch() {
  if (config.allowNonMain) return;
  const branch = capture("git", ["branch", "--show-current"]);
  if (branch !== "main") {
    fail(`Production deploy must run from main. Current branch is "${branch}". Use --allow-non-main only for emergencies.`);
  }
}

function ensureCleanTree() {
  if (config.allowDirty) return;
  const status = capture("git", ["status", "--porcelain"]);
  if (status) {
    fail("Working tree is not clean. Commit, stash, or pass --allow-dirty for an emergency deploy.");
  }
}

function buildRemoteDeployScript(remoteArchivePath, shortSha) {
  return `set -euo pipefail

APP_DIR=${shQuote(config.appDir)}
RELEASES_DIR=${shQuote(config.releasesDir)}
BACKUPS_DIR=${shQuote(config.backupsDir)}
ARCHIVE=${shQuote(remoteArchivePath)}
RELEASE_ID="$(date +%Y%m%d%H%M%S)-${shortSha}"
RELEASE_DIR="$RELEASES_DIR/$RELEASE_ID"
ENV_FILE="$APP_DIR/.env.production"
ENV_COPY="/root/limos.env.production.$RELEASE_ID"

if [ ! -f "$ARCHIVE" ]; then
  echo "Missing uploaded archive: $ARCHIVE" >&2
  exit 2
fi

if [ ! -f "$ENV_FILE" ]; then
  echo "Missing production env: $ENV_FILE" >&2
  exit 2
fi

mkdir -p "$RELEASES_DIR" "$BACKUPS_DIR"
cp "$ENV_FILE" "$ENV_COPY"

mkdir -p "$RELEASE_DIR"
tar -xzf "$ARCHIVE" -C "$RELEASE_DIR"
mv "$ENV_COPY" "$RELEASE_DIR/.env.production"
chmod 600 "$RELEASE_DIR/.env.production"

cd "$RELEASE_DIR"
npm ci
set -a
. ./.env.production
set +a
npm run build

if [ -L "$APP_DIR" ]; then
  rm "$APP_DIR"
elif [ -d "$APP_DIR" ]; then
  mv "$APP_DIR" "$BACKUPS_DIR/limos.$RELEASE_ID"
fi

ln -s "$RELEASE_DIR" "$APP_DIR"
systemctl restart limos
systemctl reload nginx

for attempt in $(seq 1 20); do
  if curl -fsS http://127.0.0.1:3000/healthz >/dev/null; then
    break
  fi
  if [ "$attempt" -eq 20 ]; then
    echo "Limos did not become healthy after restart." >&2
    systemctl --no-pager --full status limos || true
    journalctl -u limos -n 80 --no-pager || true
    exit 1
  fi
  sleep 1
done

curl -fsS http://127.0.0.1:3000/healthz
curl -fsS http://127.0.0.1:3000/api/diagnostics
rm -f "$ARCHIVE"
`;
}

function shQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function capture(command, commandArgs) {
  const result = spawnSync(command, commandArgs, {
    cwd: process.cwd(),
    encoding: "utf8",
  });

  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout || "");
    fail(`Command failed: ${command} ${commandArgs.join(" ")}`);
  }

  return result.stdout.trim();
}

function run(command, commandArgs, options = {}) {
  console.log(`\n$ ${command} ${commandArgs.join(" ")}`);
  const result = spawnSync(command, commandArgs, {
    cwd: process.cwd(),
    stdio: options.input ? ["pipe", "inherit", "inherit"] : "inherit",
    input: options.input,
    encoding: "utf8",
  });

  if (result.status !== 0) {
    fail(`Command failed: ${command} ${commandArgs.join(" ")}`);
  }
}

function fail(message) {
  console.error(`\n[deploy] ${message}`);
  process.exit(1);
}
