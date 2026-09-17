# Architecture

## Stack

- Bun 1.4: runtime, package manager, bundler, test runner
- Backend: `Bun.serve`, no web framework
- Frontend: React, [TanStack Router](https://tanstack.com/router) and [Query](https://tanstack.com/query), [Mantine](https://mantine.dev/)
- Schemas: [zod](https://zod.dev/), shared by both sides
- Database: SQLite

## Layout

One Bun process serves the API and the web app. The code is four folders:

- `src/backend/`: the application and the HTTP server in front of it.
- `src/frontend/`: a React single-page app. `Bun.serve` bundles it from `index.html` and serves it for every path
  that is not `/api/*`. Always a production bundle: the dev runtime breaks on an import cycle inside TanStack Router,
  so there is no hot reload, and the page is refreshed by hand.
- `src/shared/`: the zod schemas both sides import, one file per entity: the JSON shapes, the request bodies, and the
  enums. A form in the browser and a route on the server validate with the same schema. This folder never imports
  Bun, the DOM, or React.
- `scripts/`: `dev.ts` runs the server and restarts it on a change; `deploy.ts` builds and ships the binary.

A request goes: browser → `web` route → `Api` → a service → SQLite. The rest explains the backend half of that path,
from the inside out.

## Backend

The backend is built around one idea: **the whole application lives in `core`, and `core` knows nothing about who
calls it.** Everything else is a thin client.

**Core.** `src/backend/core/` is the whole application: the database, the schema migrations, and every operation.
It has no notion of a request, a response, or HTTP. The class `Core` (`core/core.ts`) is a container: it opens the
SQLite file, runs the migrations, and builds one service per feature. A test or a script creates a `Core` and calls
the services directly, as the system: `Core` trusts its caller.

**Database.** `core/db/` holds the connection, the schema, the migrations, and the parser of a JSON column; the
queries live in the services.
`db.ts` opens the file with strict named parameters, so a missing `$param` throws instead of
binding null, and turns foreign keys on for the connection. `schema.sql` is the full current schema, with a
comment on every table and column; a new database is made from it at the latest version. `migrations.ts`
brings an older database up and is append-only: a released migration never changes, and a mistake is fixed by a new
one. Every schema change adds a migration and makes the same change in `schema.sql`; the one test of the project
checks that both give the same structure. The app refuses a database a newer build has migrated. The search indexes
are the one thing the database writes on its own: triggers keep them in step with the tasks and the comments.

**Services.** A feature is one job, and its service is the code for it, in `core/features/<name>/service.ts`, with a
`models.ts` next to it when the rows need parsing. Most features serve one record, such as `task` or `space`: the
service holds the SQL for that record and the rules every caller must obey, such as "an assignee must be a member".
A feature can also be a system job, such as `backup`, which owns no record and works on the files under the data
path. Every
service is built with `Core` and reaches the rest of the app only through it: `this.core.db` for SQL,
`this.core.services.<other>` for another feature. There is no other wiring. A service never asks who acts: a user id
comes in as data.

**Push.** The one thing core does after a transaction: `core/features/push/service.ts` posts to the phones' push
services, one HTTPS request per subscribed device, called by the task service after a write that notified someone
and never awaited. A failed push is logged, since the write is done and nobody waits for the push. `Core` takes
`SITE_URL` for it, the contact every push names; the web layer reads the same variable to decide whether the session
cookie is `Secure`.

**Api.** `core/api.ts` is the checked door into `Core`, for any client that acts for a user. Every method takes the
session token, resolves the user through the `session` service, checks the role in the space or the admin flag, and
then calls the services. Every access rule is stated and checked there, with one exception: the login lockout, 5
wrong passwords in 15 minutes, lives in the web layer, since it counts requests, which core never sees.

**Errors.** Core throws four errors (`core/errors.ts`): unauthorized, forbidden, not found, and invalid operation.
A client maps them to its own vocabulary; the web layer answers 401, 403, 404, and 400. Any other error is a bug:
the web layer logs it with the method and the path to stderr and answers 500. There is no log file: on the host
stderr is the journal, see [deployment.md](deployment.md).

**Clients.** A client calls `Api` in-process and renders the result. `src/backend/web/` is the one client today: a
`Bun.serve` server whose routes parse the params and the body with a shared schema, call one `Api` method, and
return JSON. No other rule lives there. A CLI would be another client, at the cost of an adapter and nothing more.

`main.ts` wires it: `new Api(new Core(DATA_PATH))`, then the server. `DATA_PATH` is the one folder of the app's files:
`taskwe.db` and `backups/`. `Core` opens the database there, gives `dataPath` to the services that work on files, and
swaps the file in on a restore, so `core.db` is read at call time and never kept.

## Frontend

`src/frontend/` is a single-page app on TanStack Router and Query, with Mantine for the UI.

- `routes/`: the pages. The route tree is `routes/routes.ts`, not the file names; `tsr generate` turns it into
  `routeTree.gen.ts`. A file the tree does not name is not a route, so a `-local/` folder holds the components of one
  page and a `-shared/` folder those of its siblings, next to the pages that use them. A route file with local
  components gets its own folder, so a layout and the index page never share one `-local/` (`auth/`, `home/`).
- `api/`: the one import for data. `api.queries.*` in loaders, `api.cache.*` and `api.mutations.*` in components.
  Every response is parsed with the shared schema. A query key follows the API path where it can, so invalidating a
  prefix refetches every query under it.
- `components/` and `utils/`: what more than one page uses.

No accessibility work: no screen reader support, so no `aria-*` attributes and no hidden text for icon-only controls.

CSS, in this order:

- Mantine props first (`mb="md"`, `c="dimmed"`, `miw={0}`), then an inline `style` for a single property. A `.css` file
  is for what those cannot say: grid areas, media queries, `:hover`, a descendant selector, or a block of properties.
- A component or page that needs CSS has one `.css` file beside it, named after it and imported by it. Every class in
  the file carries the owner's prefix (`task-row-*`, `tab-*`), and a file never styles another file's element.
- A file that writes a class name imports the `.css` that defines it. No class works through a transitive import.
- A class no one component owns, such as `list-toolbar` or `task-list`, lives in `app.css`, imported once by
  `main.tsx`. It is the only file with unprefixed classes, and it stays small.
- State the CSS reads goes in a `data-*` attribute, never a modifier class: `.tab[data-current]`, not `.tab-current`.
- Colors, spacing, and sizes are `var(--mantine-*)`. A breakpoint is Mantine's step in `em`, with a comment naming
  it. A raw `px` is for a hairline or the geometry of one drawing, with a comment.

A route's loader prefetches its data, and the page reads the same query. The auth layout's loader loads the spaces,
the users, and the task counts once, so every page under it reads them with no request. A loader reads through
`context.load`: the cached data when there is any, however old, else a fetch; the page's own query then refetches on
mount, so a page opens at once with what it showed last and refreshes behind. The server is the source of truth:
a write invalidates its query, and the page refetches.

Offline: the installed app opens without a network and shows what it loaded last. `api/queryClient.ts` keeps a copy of
the query cache in localStorage, restored before the first render and dropped after a week or on a new build; `sw.js`
keeps the page, its bundle files, and the fonts in the browser's cache. A request that cannot reach the server fails at
once, the layout shows a banner until one gets through, and a page with nothing cached shows the error. Nothing is
queued: a write offline fails and the user tries again.

## Reference files

Below this doc, the code is the documentation. The rules of the data and the actions live in files whose first line
starts with `Reference file:`. Every export there carries its full contract. A rule is stated in full once, in its
reference file. Elsewhere it is repeated in at most one line, and never with more detail than the reference file has.
A pointer names a symbol, such as `Api.moveTask`, not a file. [domain.md](domain.md) is the summary; a reference
file is the source of truth.

| File                                          | Holds                                                                      |
| --------------------------------------------- | -------------------------------------------------------------------------- |
| `src/backend/core/api.ts`                     | Every operation: who may call it, what it does, its side effects, its errors. |
| `src/backend/core/db/schema.sql`              | The SQLite schema: what the database enforces, the cascades, the indexes.  |
| `src/shared/base.ts`                          | The primitives: ids, timestamps, days, slugs, and the conventions of every field. |
| `src/shared/user.ts`                          | A user, the login body, the create body, and the rename.                   |
| `src/shared/space.ts`                         | A space, personal or shared, its members with their roles, and the role check both sides use. |
| `src/shared/label.ts`                         | A label, global or of a space, the bodies that create and change labels, and the order both sides show. |
| `src/shared/task.ts`                          | A task with its repeat, and the bodies and queries of the task routes.     |
| `src/shared/comment.ts`                       | A comment and the bodies that add and edit one.                            |
| `src/shared/event.ts`                         | An event of a task and the changes each write records.                     |
| `src/shared/search.ts`                        | A text search over the tasks: the query, what a word matches, and the ranked results. |
| `src/shared/notification.ts`                  | The unread notifications of a user and the bodies that clear them.         |
| `src/shared/push.ts`                          | Web Push on one device: the server's key, a device's push address, and what a push carries. |
| `src/shared/backup.ts`                        | A backup file of the database, as the list of backups shows it.            |
