set default-list := true

# The declared version: the footer shows it, and `release` tags it.
version := `jq -r .version package.json`

# Install/update dependencies (writes bun.lock) and activate git hooks.
[group('env')]
sync:
    bun install
    uvx pre-commit install

# Bring node_modules to the exact locked state — the gate every env-consuming recipe depends on.
[private]
env:
    bun install --frozen-lockfile

# Canonical full gate - run before a PR or release.
[group('check')]
check: pre-commit lint test audit

# Modifies only src/frontend/routeTree.gen.ts, and only when it was stale.
# Code checks: regenerate the route tree, Biome (format + lint), then tsc for the backend and for the frontend.
[group('check')]
lint: env
    bunx --bun tsr generate
    bunx biome ci .
    bunx tsc --noEmit
    bunx tsc --noEmit -p src/frontend

# Run the test suite (bun test).
[group('check')]
test: env
    bun test

# Run all pre-commit hooks against every file.
[group('check')]
pre-commit:
    uvx pre-commit run --all-files

# Vulnerability scan of the locked tree (bun audit).
[group('check')]
audit: env
    bun audit

# Apply every autofix: Biome formatting + safe lint fixes, then pre-commit hooks.
[group('fix')]
fix: env && pre-commit
    bunx biome check --write .

# No browser hot reload: refresh the page by hand (see server.ts).
# Start the dev server on the given port; restarts it on any change under src.
[group('run')]
dev port="3000": env
    PORT={{port}} bun scripts/dev.ts

# size: small (500 tasks over 30 days) or full (50k tasks over 2 years). Pass --force to replace an existing file.
# Replace data/taskwe.db with a seeded development database; stop the dev server first.
[group('run')]
seed size="small" *flags: env
    bun scripts/seed.ts {{size}} {{flags}}

# Compile the server and the web app into one executable, dist/taskwe, for the given Bun target. See docs/deployment.md.
[group('release')]
build target="bun-linux-x64": env
    bunx --bun tsr generate
    bun build --compile --minify --target={{target}} src/backend/main.ts --outfile dist/taskwe

# Build, install Caddy, write the unit and the vhost under /apps/taskwe, upload the binary, swap it under the service.
# Asks for domain and port only on a fresh host. See docs/deployment.md.
# Deploy to a Debian/Ubuntu host over SSH, fresh or running.
[group('release')]
deploy host target="bun-linux-x64":
    bun scripts/deploy.ts {{host}} {{target}}

# Verify the repo is release-ready: clean tree, HEAD at origin/main tip, version not yet tagged.
[private]
release-preflight:
    #!/usr/bin/env bash
    set -euo pipefail
    if [[ -n "$(git status --porcelain)" ]]; then
        echo "error: working tree has uncommitted changes; commit them before releasing." >&2
        exit 1
    fi
    git fetch -q origin main
    # Exact tip, not just an ancestor: catches unpushed, stale, and feature-branch HEADs alike.
    if [[ "$(git rev-parse HEAD)" != "$(git rev-parse refs/remotes/origin/main)" ]]; then
        echo "error: HEAD is not at the tip of origin/main; switch to main and pull/push first." >&2
        exit 1
    fi
    # Origin is checked too: a remote-only tag would otherwise fail the push after the local tag is made.
    if git rev-parse -q --verify "refs/tags/v{{version}}" >/dev/null || git ls-remote --exit-code --tags origin "refs/tags/v{{version}}" >/dev/null 2>&1; then
        echo "error: tag v{{version}} already exists; bump 'version' in package.json." >&2
        exit 1
    fi

# A release is the tag and nothing more: nothing is built or published, and the host gets its binary from `deploy`,
# released or not.
# Run the release preflight and check, then tag v<version> and push the tag.
[group('release')]
release: release-preflight check
    git tag -a "v{{version}}" -m "v{{version}}"
    git push origin "v{{version}}"

# Remove build artifacts and tool caches, the hidden temp file of an interrupted `bun build --compile` included.
[group('maintenance')]
clean:
    rm -rf dist .tanstack .*.bun-build
