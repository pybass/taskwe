# Domain

Small by design: around 10 users, 10 spaces, and 50k tasks. These are expectations, not limits.
This is the summary. Every rule lives in a reference file in the code, listed in [architecture.md](architecture.md).

## Users

- No self-registration. Only an admin adds users.
- A user is a username and a password. The username is the name every page shows. An admin is a user with the
  `admin` flag. An admin sets the flag of any other user and cannot clear their own, so the app always keeps at least
  one admin.
- A user changes their own password with the current one; an admin sets anyone's without it. A change ends every
  other session of that user.
- A session lasts 30 days from the last use.
- After 5 wrong passwords for a username within 15 minutes, its logins are refused until the window has passed. The
  count is in memory: a restart clears it.
- An admin renames a user. The new username must be free of every username, space slug, and space name. The personal
  space takes the new username as its slug and name, so its URL changes. Sessions stay.
- The app never deletes a user.

## Spaces

A space holds tasks. A member of a space has one of three roles:

| Role      | Can                                                                          |
| --------- | ---------------------------------------------------------------------------- |
| `manager` | Everything: the member list and roles, labels, moving a task out, and all an editor can. |
| `editor`  | Create tasks; edit, close, assign, and label any task; comment.              |
| `viewer`  | Read only.                                                                   |

- Each user has a personal space. It is created with the user, who is its owner, its only member, and its manager,
  for good. Its name and slug are the username.
- Any user creates shared spaces. The creator is a manager; invited users start as editors. A space always keeps at
  least one manager.
- A space name is unique among the names, as a slug is among the slugs: the name is what every page shows. A
  shared space's slug may match another's name. A username takes both, since a personal space has it as its slug
  and its name.
- The admin flag gives no role in a space. An admin sees and edits only the spaces they are a member of, like
  anyone; what the flag adds is the admin pages. On `/admin/spaces` an admin sets their own role in any shared space,
  or leaves it: the one way into a space nobody invited them to. The member rules still hold, so the only manager
  cannot leave or step down. A personal space is private from every other user. An admin is a trusted operator:
  the delete page shows them any task by number, and a backup holds the whole database.
- Only an admin deletes a space, and only a shared one. Its tasks go with it.

## Tasks

- A task belongs to one space and has a number: #1, #2, ... One sequence over every space, so #42 is one task
  wherever it is. A number is never reused and never changes: a move keeps it, so a link or a `#42` in a text keeps
  working for good. The URL is `/t/{number}`. `#42` in a body or a comment, or its URL pasted, renders as a link with
  the task's title. A task the reader may not read, a number no task has, and a deleted task all show the same
  "unavailable", so a mention leaks nothing.
- A task is open or closed. Only an admin deletes a task, by number.
- Fields: title, body, author, assignee, labels, an optional due date (a day, with no time), and the repeat below.
- An assignee is any member of the space, a viewer included. A task in a personal space is always assigned to its
  owner, and a task moved in gets the owner. The rule is checked when an assignee is picked: a member left out of a
  space stays the assignee of their tasks there until someone picks another, and nothing clears it on their leave.
- A task has comments. The body and the comments are markdown, GitHub flavor.
- Every change of a task is one write: the fields, close or reopen, the Done of a repeating task, and a new comment
  go in one patch, so one press of the user is one change. A patch that changes nothing is rejected. Apart from it, a
  task is only created, moved, and deleted. A patch names the labels added and removed, not the whole set, so two
  users' label changes add up.
- The body is the task's own text: any editor or manager rewrites it. A comment is a message: only its author edits
  it, and only while still an editor of the space; a manager or an admin who is not the author cannot. A comment is
  never deleted: a mistake is edited.
- A task list shows the open or the closed tasks. It is filtered by author, assignee, and labels, a task must
  carry every label chosen, and sorted by last update, creation, or due date; the default is last update, newest
  first. A user's own open tasks across their spaces come as one list: the overdue and the due within 3 days first,
  soonest first, then the rest by last update, newest first, whatever their due date, so a routine due in months
  does not sit on top for good.

## Repeating tasks

Clean the pool every 2 months, see the dentist every 6 months, check a device every 2 days: one task each, which never
ends. It carries a number of days, "every N days", and a list of dones.

- The days are a helper for the due date, not a rule. Setting them suggests a due date, today plus the days, and
  pressing Done records who did it and when and suggests the next one. The user may pick another day, or none. The
  task stays open. So a month is 30 days: the drift does not matter for a suggestion.
- Any editor removes a mistaken done. The due date does not move back.
- The days are set with a new task or changed and removed later. Removing them drops the dones too. Closing the task
  keeps everything: that is how a routine ends.
- No task is ever created by the app. Nothing runs in the background.

## Labels

A label is a named, colored tag, like a GitHub issue label. It is global, for every space, or belongs to one space.
A task carries its labels as names, any number of them. The list of a space is its own labels plus the global ones
it does not shadow: the names an editor may put on a task there, each with a color and a place. The list constrains
writes, not what a task holds: a task keeps its names through a move and a delete. A name the list does not have
shows in grey after the known ones, a filter may name it, and a task keeps or drops it but never adds one. A label
of that name created later gives it a color and a place again.

- A name is unique within a space and unique among the global labels, exact match, and nothing more. Two spaces may
  hold the same name, and neither learns of the other: a personal space's labels stay its owner's business.
- A space label may take a global name. It then shadows the global one in that space: its color, its place, and its
  rename win there, and nothing else changes. That is how a space overrides a global label; the labels page offers
  "Override" on each global one, which creates the copy.
- An admin creates, renames, recolors, and deletes the global labels, on `/admin/labels`. A new database starts with
  three: `urgent`, `paused`, and `cancelled`, for a task closed without being done.
- A new space has none of its own. A manager creates, renames, recolors, and deletes them; an editor puts them and
  the global ones on tasks.
- Every label has a position, any integer, typed by the user. A space's list is on one line: its own labels and the
  global ones sorted by position, then name, so a space label goes before `urgent` with a smaller number. A new label
  without a position goes last. Every list of labels and the badges on a task follow this order.
- Renaming a label renames it on every task that carries it, of its space, or, for a global one, of every space
  that has no label of the name, in the same write. Nothing else moves: no `updatedAt`, no event.
- Deleting a label leaves the name on the tasks, in grey.
- There is no way to make a space's label global: an admin creates the global one, and the space deletes its own.
- There is no priority field. A space that wants one adds labels such as `urgent` or `low` and puts them first, or
  an admin adds them to the global list.

## Moving tasks

A space is also an audience: a move is "who sees this". A parent drafts a task in their own space and moves it to the
family space; a chore goes from the parents' space to the children's. The whole history goes with the task, the
comments and every earlier version of the text included, and becomes readable by the target's members; a move into
a personal space takes it away from everyone else. So the move is the call of a manager of the task's space, the
owner in a personal one, and the target must be a space where the mover is an editor or a manager. Nobody moves a
task into another user's personal space, an admin included: to hand work to a person, assign it.

The task keeps its number and its URL, and its labels go with it as they are: a name the target's list has shows
with the target's color, any other in grey. The assignee stays if a member of the target, else is cleared; a
personal target assigns the task to its owner.

## Events

One user action = one event. An event names its action, created, updated, moved, repeat done removed, or comment
updated, and carries that action's changes as one object, one key per kind of change, so it reads like a diff of the
task: who acted, when, and what moved from what to what. Events are written in the same transaction as the change and
never updated. A write that changes nothing writes no event and is rejected. The record of a task is its row plus its
events, and they go with it.

The events are append-only and complete. Every change of a task or its comments writes an event, so the task and
comment rows can be rebuilt from the events alone, each event's keys applied as its action's shape says. Every event
moves the task's `updatedAt`: a task that changed shows as updated. A label rename is the one
change of a task's row outside the events: the names in the events are the names as written, and `task_labels` holds
the names of today. The task and comment rows are the truth for every read, list, and search; nothing replays the
events. Both are written in one transaction by the services, the
only writers.

- Creating a task records the task as written, title, body, assignee, labels, due date, and repeat days, and the
  space it started in.
- The one write of a task records only what differed: close or reopen, title, body, assignee, due date, labels added
  and removed, repeat days, the Done, the new comment with its text. A Done is keyed by the event that recorded it,
  whose actor and time are the Done's.
- Removing a done, moving a task, and editing a comment each record an event too. A move records both spaces by id
  and name, and the assignee only when the target changed it; the labels go as they are.
- Labels are named in events, a snapshot. A label rename or delete writes no event: the tasks keep the name, renamed
  or in grey, and a page shows a name the space does not list in grey.

A member of a task's space reads its events, oldest first by id: the clock may step back, the id never does. The task
page shows them as the task's activity, one entry per action: a comment, with its current text under the line, or a
change, any other event. Newest first or oldest first, comments only by default, with the changes shown on request. A comment is shown only through its
events: no read returns a comment row, and the page takes a text's history and its current version from the same
chain of edits.

The home page's Activity tab is the newest 300 events over every space the user may read, grouped by task,
newest first, each with an excerpt of the text it added.

## Notifications

The actor says who should know. Creating, updating, and moving a task each take a list of members to notify, any
number of them, never the actor; the app adds nobody. The form ticks a new assignee, and the user unticks or adds; in
a personal space there is nobody to tick. An unread notification is one event for one user. It lives until the user
opens the task, which clears the task's notifications up to the newest event shown, or presses "Mark all read";
nothing is kept after that, so the app never knows who was told. The Notifications tab on the home page lists the
unread in the Activity tab's shape, newest first, over the spaces the user may read now: a task moved out of reach hides its
rows, and they come back with access. The tab's count is of tasks, not events. Editing a comment and removing a done
notify nobody.

A user gets the same notifications as pushes on a phone: the Notifications tab has an Enable button on a device that
can receive them, the installed app on iOS, and the phone shows each one while the app is closed, "#42 Clean the
pool", "alice commented: ...", the first 100 characters of a comment, one per task, and sets the app icon's badge to
the unread task count. The subscription belongs to the session, so it ends with it: on logout, on a password change,
or when the session expires. The server posts only to the push services of the known browsers, listed in
`src/shared/push.ts`; a browser with another one cannot turn push on. The server's push key pair is made on first
use and kept in the database. A restored or seeded database brings other
keys, and a phone then subscribes again on its next open. A push is sent after the write and may arrive late or
never; the unread rows stay the truth, and the app sets the badge from them on every open.

Not built: subscribing to every event of a task.

## Search

One search over every space the user reads, of the current title, body, and comments of each task; the history in
the events is not searched. The query is plain words, no syntax: every word must be found in the task, each in its
title, its body, or any comment, as the start of a word, so `pool` finds `pools`. Case, the accents of Latin letters,
and `ё` against `е` do not count. There is no stemming, in any language: `задача` does not find `задачи`, `задач`
finds both.

The results rank by where the words were found: all in the title first, then all in the title and the body together,
then the rest, which needs the comments. Within each, the open before the closed, then by last update. A result found
in the body shows an excerpt of it; one found in a comment shows the comment's excerpt with its author and links to
the comment on the task page, `/t/42#c17`. The page has tabs for all, open, and closed, and a filter by space.

The header's search box is on every page, an icon below a tablet's width. A number alone, `42` or `#42`, opens that
task instead.

## Backups

An admin makes a backup: a consistent copy of the whole SQLite file, written while the server runs, into `backups/`
next to the database, named by its UTC time, `taskwe-2026-09-12T10-30-00Z.db`. The admin page lists the files with
their size, newest last event first, and downloads any of them. An admin renames a backup to any file name of
letters, digits, dots, hyphens, and underscores ending in `.db`, such as `before-cleanup.db`; a file with another name
is not listed. An admin deletes a backup from the list. A backup holds everything, password hashes and sessions
included. A backup has the schema of the binary that made it: after a migration edit, it restores only with that binary.

The list shows what each file holds, read from the file on every load: its spaces, each with its task count, the
time of its last task event, and its schema version. A file that does not open as a database, or lacks these tables,
is listed last, as unreadable. A few small indexed queries per file: the list stays cheap with many backups, and nothing is
cached, so files copied onto the host by hand show up as they are.

An admin uploads a backup: a file from their machine, saved under a name they choose, prefilled from the file's name.
The file is checked to hold info before it is kept; a name that is taken is refused. The upload only adds the file to
the list, so it can be inspected before a restore.

An admin restores a backup from the list, and the app keeps running. In this order: the file is checked, a backup of
the current database is made, and the file replaces `taskwe.db`. The check refuses a file that is not a SQLite
database, is damaged, or has a schema version other than the running build's; then nothing changes and no backup is
made. The restored file brings its own sessions: every session ends, the admin's included, and everyone logs in again
with the passwords of that time. The number counters do not go back: a task written after the backup is lost, but its
number is not given to a new task, so a link or a `#42` in a chat never names a second task. Only a restore by hand
onto a lost database can reuse numbers.

Nothing runs on a schedule: the app makes a backup when asked, and at start before a migration, named
`taskwe-2026-09-12T10-30-00Z-before-v3.db`. When the app cannot start, a restore is by hand on the host, see
[deployment.md](deployment.md).

## Pages

| Page                    | Shows                                                                               |
| ----------------------- | ----------------------------------------------------------------------------------- |
| `/`                     | Home, three tabs: My tasks, the user's open tasks as one list, the due within 3 days first, not paged; Notifications, the user's unread; Activity, what changed lately in the user's spaces. |
| `/s/{slug}`             | The tasks of a space, filtered and sorted by the URL, so a view is a link.          |
| `/t/{number}`           | One task: its body, its events with the comments, and the update form.              |
| `/search`               | The search results over the user's spaces, by status and space, as a link.          |
| `/t/new`                | A new task, in a space the user edits, picked in the form. The header's "New task" leads here from every page; a space page presets its space. |
| `/s/{slug}/labels`      | The labels of a space, for a manager.                                               |
| `/spaces/new`           | A new shared space.                                                                 |
| `/s/{slug}/members`     | The members of a space, for a manager.                                              |
| `/password`             | Change your own password.                                                           |
| `/admin/labels`         | The global labels, for an admin.                                                    |
| `/admin/users`          | Users: add, rename, set the admin flag, set a password.                             |
| `/admin/spaces`         | The shared spaces with their members: set one's own role, delete.                  |
| `/admin/tasks/delete`   | Delete a task by number.                                                            |
| `/admin/backups`        | Backups: whether the database matches the build's schema; the files with what they hold and whether each matches it too, each to rename, download, restore, or delete; a button to make one, a form to upload one. |

A personal space's slug is the user's username.
