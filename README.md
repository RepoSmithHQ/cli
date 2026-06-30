# Repo Smith CLI

[![npm version](https://img.shields.io/npm/v/@reposmith/cli)](https://www.npmjs.com/package/@reposmith/cli)
[![CI](https://github.com/RepoSmithHQ/cli/actions/workflows/ci.yml/badge.svg)](https://github.com/RepoSmithHQ/cli/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

The `reposmith` command-line tool — manage your GitHub backups from the terminal. Browse backups, list jobs, and download archive tarballs for any repository you've connected to [Repo Smith](https://reposmith.com). Every command also speaks JSON for piping into `jq`, `fzf`, or your shell pipeline.

This package is **independent of the Repo Smith web app** — it talks to a public HTTP API (`/api/cli/v1/*`) and stores its config locally. It does not import or depend on anything in `../web/` at runtime.

## Install

```bash
npm install -g @reposmith/cli
```

Node 20+ is required.

## Quick start

```bash
reposmith auth login              # opens your browser, you approve, done
reposmith workspace list          # shows workspaces you belong to
reposmith workspace use ws_abc123  # sets the active workspace
reposmith repos list              # lists repositories in the active workspace
reposmith repos list --search my-cool-repo
reposmith jobs list --status succeeded --limit 5
reposmith jobs get <job-id>
reposmith archives download <job-id>
reposmith archives download <job-id> --out /tmp/repo.tar.gz
```

All list commands default to a human-readable table when stdout is a TTY. Pass `--json` to get machine-readable output:

```bash
reposmith repos list --json | jq '.[0].id'
```

## Commands

### `auth`

| Command | Description |
|---|---|
| `reposmith auth login` | Opens the browser to `/app/cli/authorize`. Approve in the browser; the CLI receives a scoped API key. |
| `reposmith auth logout` | Revoke the CLI key server-side and remove the local token. Idempotent. |

### `workspace`

| Command | Description |
|---|---|
| `reposmith workspace list` | List the workspaces you're a member of. |
| `reposmith workspace use <id\|name>` | Set the active workspace (stored locally). |

### `repos`

| Command | Description |
|---|---|
| `reposmith repos list` | List repos in a workspace. `--limit N`, `--offset M`, `--search <q>`, `--workspace <id>`, `--json`. |
| `reposmith repos get <id>` | Show one repo by id. |

### `jobs`

| Command | Description |
|---|---|
| `reposmith jobs list` | List backup jobs. `--limit N`, `--offset M`, `--status <s>`, `--workspace <id>`, `--json`. |
| `reposmith jobs get <id>` | Show one job by id. |

### `archives`

| Command | Description |
|---|---|
| `reposmith archives download <job-id>` | Download a backup archive. Streams directly from object storage — Nitro is never on the bandwidth path. `--out <path>` to override the destination. |

## Configuration

The CLI stores its config in:

- `${~/.config}/reposmith/config.json` (mode 0600)

The file holds the API base URL, your CLI bearer token, and the active workspace id. To wipe local state:

```bash
rm -rf ~/.config/reposmith
```

To target a local dev server instead of production:

```bash
REPOSMITH_API=http://localhost:3000 reposmith auth login
```

…or pass `--api http://localhost:3000` to any command.

## Auth model

The CLI uses a dedicated API key issued by the Repo Smith server. Keys are 90 days by default and minted via the **device-flow login**: the CLI opens the web app, the user approves, and the CLI receives a scoped API key in the background.

**Keys are scoped to the CLI only.** A CLI key is rejected by every `/api/*` route (the session middleware doesn't accept `Authorization: Bearer` for non-CLI routes). A regular session cookie is rejected by every `/api/cli/*` route (the CLI middleware doesn't accept session cookies). The two namespaces are isolated by design.

The CLI never sees your password. 2FA works for free: the web app enforces TOTP before the user can click Approve, so the CLI doesn't have to.

## Releasing

Publishing is manual for v0.1.0 — every PR runs the CI workflow (`.github/workflows/ci.yml`) as a required check, so by the time you tag, you know the build is green.

```bash
# 1. Bump version (creates a commit + tag)
npm version patch    # 0.1.0 → 0.1.1
# or `npm version minor` / `npm version major`

# 2. Build + verify (prepublishOnly does this automatically)
npm run build && npm run publint

# 3. Publish to npm
npm publish --access public

# 4. Push the tag
git push --follow-tags
```

## License

MIT. See [`LICENSE`](./LICENSE).
