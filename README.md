# taskwe

A simple task management system for families and small teams. One binary, one SQLite file, your own server.

- Spaces with three roles: manager, editor, viewer. Every user has a personal space too.
- Tasks with a markdown body, comments, labels, an assignee, a due date, and "every N days" repeats.
- The full history of every change. Notifications, with Web Push to phones.
- Search over every space. Installs as a web app and opens offline.
- Backups and restore from the admin page.

## Requirements

- Server: a Linux host, x64 or arm64. The binary bundles the runtime and the web app, so nothing else.
- Development: [Bun](https://bun.sh) 1.4, [just](https://just.systems), and [uv](https://docs.astral.sh/uv/) for the git hooks.

## Run

`just build` makes `dist/taskwe` for Linux x64; `just build bun-linux-arm64` for arm64. The settings are environment
variables:

| Variable    | Default             | Meaning                                                                        |
| ----------- | ------------------- | ------------------------------------------------------------------------------ |
| `DATA_PATH` | `data`              | The folder of `taskwe.db` and `backups/`, created when missing.                |
| `HOST`      | `127.0.0.1`         | The address to listen on.                                                      |
| `PORT`      | `3000`              | The port to listen on.                                                         |
| `SITE_URL`  | `https://localhost` | The public address: `https:` makes the session cookie `Secure`, and every push names it. |

The first start creates the database with the user `admin`, password `admin`. Change it after the first login.
[Deployment](docs/deployment.md) puts the binary on a host behind Caddy with one command.

## Development

`just` lists the recipes. `just sync` installs; `just dev` runs the server on port 3000 against `data/taskwe.db`,
`just dev 3001` on another port; `just seed` fills the database with demo data; `just check` runs the lint, the type
checks, and the tests. A release is a tag: bump `version` in `package.json`, commit, push, then `just release` checks
and tags `v<version>`.

## Docs

- [Domain](docs/domain.md): users, spaces, tasks, and the rules of each.
- [Architecture](docs/architecture.md): the stack, the code layout, and where each rule lives.
- [Rejected](docs/rejected.md): ideas turned down, with the reason for each.
- [Deployment](docs/deployment.md): one binary on one Linux host, behind Caddy.

## License

[MIT](LICENSE)
