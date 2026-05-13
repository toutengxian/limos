import { spawnSync } from "node:child_process";

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: options.capture ? "pipe" : "inherit",
    encoding: "utf8",
  });

  if (result.status !== 0) {
    if (options.capture && result.stderr) process.stderr.write(result.stderr);
    process.exit(result.status || 1);
  }

  return options.capture ? result.stdout.trim() : "";
}

const currentBranch = run("git", ["branch", "--show-current"], { capture: true });
if (currentBranch !== "develop") {
  console.error(`Run this from develop. Current branch is "${currentBranch}".`);
  process.exit(1);
}

const status = run("git", ["status", "--porcelain"], { capture: true });
if (status) {
  console.error("Working tree is not clean. Commit or stash changes before promoting.");
  process.exit(1);
}

run("npm", ["run", "check"]);
run("git", ["fetch", "origin"]);
run("git", ["push", "origin", "develop"]);
run("git", ["checkout", "main"]);
run("git", ["pull", "--ff-only", "origin", "main"]);
run("git", ["merge", "--no-ff", "develop", "-m", "Promote develop to production"]);
run("git", ["push", "origin", "main"]);
run("git", ["checkout", "develop"]);

console.log("Promoted develop to main. Vercel production deployment should start from the main push.");
