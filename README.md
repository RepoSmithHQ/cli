# @reposmith/cli

Command line interface for [Repo Smith](https://reposmith.com) — manage your GitHub backups from the terminal.

## Installation

```bash
npm install -g @reposmith/cli
```

Requires Node.js 20+.

## Usage

```
reposmith <command> [flags]
```

Run `reposmith help` to see all available commands, or `reposmith <command> help` for details on a specific command.

Pass `--json` (or `-j`) to any list or get command to emit machine-readable output. The flag is also implied when stdout is piped.

### Commands

| Command | Description |
|---------|-------------|
| `reposmith auth login` | Authenticate via browser — opens the Repo Smith web app for approval via the device flow |
| `reposmith auth logout` | Revoke the CLI token and clear the local config. Idempotent |
| `reposmith workspace list` | List the workspaces the current user is a member of |
| `reposmith workspace use <id\|name>` | Set the active workspace by id or unique name. Stored locally |
| `reposmith repos list` | List repositories in the active workspace. Supports substring filtering |
| `reposmith repos get <id>` | Show one repository by id |
| `reposmith jobs list` | List recent backup jobs in the active workspace |
| `reposmith jobs get <id>` | Show one backup job by id, including archive availability |
| `reposmith archives download <job-id>` | Download a backup archive for a completed job. Streams directly from object storage |

---

### `reposmith auth login`

Authenticate via browser — opens the Repo Smith web app for approval via the RFC 8628 device flow. After you click Approve, the CLI receives a scoped API key. Your password never reaches the CLI; 2FA is enforced by the web app before approval.

If your account belongs to a single workspace, the CLI auto-selects it on login, so you can immediately run `reposmith repos list` etc. with no extra setup. When you belong to multiple workspaces, the CLI lists them and asks you to run `reposmith workspace use <id>` to pick one.

```
reposmith auth login
```

**Examples:**

```bash
reposmith auth login
```

### `reposmith auth logout`

Revoke the CLI token and clear the local config. Idempotent — safe to run if you're not logged in.

```
reposmith auth logout
```

**Examples:**

```bash
reposmith auth logout
```

### `reposmith workspace list`

List the workspaces the current user is a member of.

```
reposmith workspace list [flags]
```

| Flag | Description |
|------|-------------|
| `-j, --json` | Output JSON instead of a table |

**Examples:**

```bash
reposmith workspace list
reposmith workspace list --json | jq '.[0].id'
```

### `reposmith workspace use`

Set the active workspace by id or unique name. Stored locally, defaults every subsequent `repos` and `jobs` command. You only need this if your account belongs to more than one workspace — `auth login` auto-selects the only workspace when there's just one.

```
reposmith workspace use <id|name>
```

**Examples:**

```bash
reposmith workspace use ws_abc123
reposmith workspace use "Acme Engineering"
```

### `reposmith repos list`

List repositories in the active workspace.

```
reposmith repos list [flags]
```

| Flag | Description |
|------|-------------|
| `-w, --workspace` | Workspace id (defaults to the one set by `reposmith workspace use`) |
| `-q, --search` | Substring filter against repository name or external id |
| `--limit` | Maximum rows to return, 1-200 (default: `50`) |
| `--offset` | Skip this many rows before returning (default: `0`) |
| `-j, --json` | Output JSON instead of a table |

**Examples:**

```bash
reposmith repos list
reposmith repos list --search my-cool-repo
reposmith repos list --json | jq '.[].name'
```

### `reposmith repos get`

Show one repository by id.

```
reposmith repos get <id> [flags]
```

| Flag | Description |
|------|-------------|
| `-j, --json` | Output JSON instead of a key/value block |

**Examples:**

```bash
reposmith repos get repo_abc123
```

### `reposmith jobs list`

List recent backup jobs in the active workspace.

```
reposmith jobs list [flags]
```

| Flag | Description |
|------|-------------|
| `-w, --workspace` | Workspace id (defaults to the one set by `reposmith workspace use`) |
| `--status` | Filter by job status (`pending`, `cloning`, `uploading`, `succeeded`, `failed`) |
| `--limit` | Maximum rows to return, 1-200 (default: `50`) |
| `--offset` | Skip this many rows before returning (default: `0`) |
| `-j, --json` | Output JSON instead of a table |

**Examples:**

```bash
reposmith jobs list --status succeeded --limit 5
reposmith jobs list --json | jq '.items[].id'
```

### `reposmith jobs get`

Show one backup job by id, including archive availability and encryption mode.

```
reposmith jobs get <id> [flags]
```

| Flag | Description |
|------|-------------|
| `-j, --json` | Output JSON instead of a key/value block |

**Examples:**

```bash
reposmith jobs get job_abc123
```

### `reposmith archives download`

Download a backup archive for a completed job. Streams directly from object storage via a short-lived presigned URL — no proxy through the API.

```
reposmith archives download <job-id> [flags]
```

| Flag | Description |
|------|-------------|
| `-o, --out` | Destination path. Defaults to `./<repoSlug>-<jobPrefix>.<ext>` in the current directory |

If the archive lives in cold storage, the server queues a restore and emails you the download link (and the per-backup password, if applicable) when it's ready.

**Examples:**

```bash
reposmith archives download job_abc123
reposmith archives download job_abc123 --out /tmp/repo.tar.gz
```

## Configuration

The CLI stores its config at `~/.config/reposmith/config.json` (mode `0600`). The file holds the API base URL, your CLI bearer token, and the active workspace id.

To wipe local state:

```bash
rm -rf ~/.config/reposmith
```

To target a local dev server instead of production, set `REPOSMITH_API` for a single invocation:

```bash
REPOSMITH_API=http://localhost:3000 reposmith auth login
```

## License

MIT. See [`LICENSE`](./LICENSE).
