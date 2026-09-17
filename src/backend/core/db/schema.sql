-- Reference file: the SQLite schema, what the database itself enforces, and why each index exists.
--
-- The full current schema, as if the database were made from scratch: a new database runs this file alone, at the
-- latest version. A schema change edits it and appends a migration to migrations.ts that brings an older database to
-- the same result; the test in tests/core.test.ts checks that both give the same structure.
--
-- Conventions: a column is snake_case here and camelCase in the API. A `*_at` column is ISO 8601 in UTC and `due_date`
-- a YYYY-MM-DD day, both text. The schemas in src/shared own the format and length rules; the database checks only
-- what is declared below. Every table is STRICT, so a column holds only its declared type. A cascade relies on
-- `PRAGMA foreign_keys = ON`, which db.ts sets on every connection since SQLite does not store it.
-- A list that belongs to a row is a child table, never a JSON column: a read packs it with json_group_array. The one
-- JSON column is task_events.changes, a document of varying shape that nothing filters on.
-- AUTOINCREMENT on every id: an id is never reused after a delete. A restore keeps the counters at the higher of the
-- two databases' (Core.replaceDatabase), so a task id in a link never names a second task.

-- A user; see user.ts. Never deleted by the app: every author, actor, owner, and assignee column below points here
-- without a cascade, so a script that deletes a user must first delete what refers to it.
CREATE TABLE users (
	id            INTEGER PRIMARY KEY AUTOINCREMENT,
	username      TEXT    NOT NULL UNIQUE, -- also the slug and the name of the personal space; the app keeps all three unique together
	password_hash TEXT    NOT NULL,        -- argon2id from Bun.password; never leaves core
	admin         INTEGER NOT NULL DEFAULT 0 CHECK (admin IN (0, 1)), -- a boolean in the API
	created_at    TEXT    NOT NULL
) STRICT;

-- A login session, never exposed by the API. Created at login and deleted at logout; the expired ones of every user
-- are deleted at each login, and a password change deletes the user's other sessions. A browser holds at most one
-- push subscription per site, and a session is one browser, so the subscription is three columns here and ends with
-- the session; see push.ts.
CREATE TABLE sessions (
	token_hash    TEXT    PRIMARY KEY, -- SHA-256 hex of the cookie token; the token itself is never stored
	user_id       INTEGER NOT NULL REFERENCES users (id),
	expires_at    TEXT    NOT NULL,    -- the last use plus 30 days, moved forward at most once a day
	push_endpoint TEXT,                -- the push service's URL for this browser; NULL: no push on this device
	push_p256dh   TEXT,                -- the browser's public key, base64url
	push_auth     TEXT,                -- the browser's auth secret, base64url
	-- The three push columns are set together or not at all.
	CHECK ((push_endpoint IS NULL) = (push_p256dh IS NULL) AND (push_endpoint IS NULL) = (push_auth IS NULL))
) STRICT, WITHOUT ROWID;

-- The sessions of a user, for the delete on a password change and the push subscriptions of a user.
CREATE INDEX sessions_user ON sessions (user_id);

-- An endpoint is one browser, so it belongs to one session: a login there takes it off the old session row.
CREATE UNIQUE INDEX sessions_push_endpoint ON sessions (push_endpoint) WHERE push_endpoint IS NOT NULL;

-- A space; see space.ts. Personal when owner_id is set. Deleting a row takes its members, labels, tasks, comments,
-- and events by cascade; the app deletes only a shared one.
CREATE TABLE spaces (
	id         INTEGER PRIMARY KEY AUTOINCREMENT,
	slug       TEXT    NOT NULL UNIQUE,      -- shares its namespace with users.username; the app checks both
	name       TEXT    NOT NULL UNIQUE,      -- a personal space is named by its owner's username, so a name is checked against usernames too
	owner_id   INTEGER UNIQUE REFERENCES users (id), -- the user whose personal space this is; NULL: a shared space
	created_at TEXT    NOT NULL
) STRICT;

-- The members of a space with their roles, one row each; `members` on a space in the API. Owned by the space service
-- together with `spaces`. The "at least one manager" rule is the app's.
CREATE TABLE space_members (
	space_id INTEGER NOT NULL REFERENCES spaces (id) ON DELETE CASCADE,
	user_id  INTEGER NOT NULL REFERENCES users (id),
	role     TEXT    NOT NULL CHECK (role IN ('manager', 'editor', 'viewer')),
	PRIMARY KEY (space_id, user_id)
) STRICT, WITHOUT ROWID;

CREATE INDEX space_members_user ON space_members (user_id);

-- A task; see task.ts. The id is the task's public number, the same in every space: a move changes only space_id.
-- A row goes with its labels, dones, comments, and events.
CREATE TABLE tasks (
	id          INTEGER PRIMARY KEY AUTOINCREMENT,
	space_id    INTEGER NOT NULL REFERENCES spaces (id) ON DELETE CASCADE,
	title       TEXT    NOT NULL,
	body        TEXT    NOT NULL,              -- '' when empty, never null
	closed_at   TEXT,                          -- null means open
	due_date    TEXT,
	assignee_id INTEGER REFERENCES users (id), -- a member of the space; the app checks it on write only
	repeat_days INTEGER CHECK (repeat_days IS NULL OR repeat_days >= 1), -- null: the task does not repeat
	author_id   INTEGER NOT NULL REFERENCES users (id),
	created_at  TEXT    NOT NULL,
	updated_at  TEXT    NOT NULL               -- the last change to the task or its comments; the list order
) STRICT;

-- The task list of a space, newest change first; the other sorts read the space's tasks through it too.
CREATE INDEX tasks_space_updated ON tasks (space_id, updated_at DESC);

-- The open tasks of an assignee, the home page's My tasks. Partial: the closed ones are never listed this way.
CREATE INDEX tasks_assignee_open ON tasks (assignee_id) WHERE closed_at IS NULL;

-- The label names on a task, one row each; `labels` in task.ts. Names, not label ids: a name the space's `labels`
-- has is a known label, any other an unknown one, and a move keeps them all.
CREATE TABLE task_labels (
	task_id INTEGER NOT NULL REFERENCES tasks (id) ON DELETE CASCADE,
	name    TEXT    NOT NULL,
	PRIMARY KEY (task_id, name)
) STRICT, WITHOUT ROWID;

-- The tasks carrying a name: the label filter of a list, a rename, and the unknown labels of a space.
CREATE INDEX task_labels_name ON task_labels (name, task_id);

-- A comment; see comment.ts. Follows its task on a move, since it points to the task's id. A row goes only with its
-- task.
CREATE TABLE comments (
	id         INTEGER PRIMARY KEY AUTOINCREMENT,
	task_id    INTEGER NOT NULL REFERENCES tasks (id) ON DELETE CASCADE,
	author_id  INTEGER NOT NULL REFERENCES users (id),
	body       TEXT    NOT NULL,
	created_at TEXT    NOT NULL
) STRICT;

-- The comments of a task, and their count on every task read.
CREATE INDEX comments_task ON comments (task_id);

-- A label, global or of one space: a name with a color and an order; see label.ts. Owned by the label service, which
-- also writes the names in task_labels. Tasks name labels, they do not reference this table: a rename rewrites
-- task_labels in the same transaction, a delete leaves the name on the tasks. A space label may take a global name
-- and then shadows it there: its color, place, and rename win in that space.
CREATE TABLE labels (
	id         INTEGER PRIMARY KEY AUTOINCREMENT,
	space_id   INTEGER REFERENCES spaces (id) ON DELETE CASCADE, -- NULL: a global label, of every space
	name       TEXT    NOT NULL, -- exact match; unique within the space (below) and among the globals (labels_global_name)
	color      TEXT    NOT NULL,
	position   INTEGER NOT NULL, -- the order among the global ones or within the space; a delete leaves a gap
	created_at TEXT    NOT NULL,
	UNIQUE (space_id, name)      -- NULLs are distinct to SQLite, so this alone lets two globals share a name
) STRICT;

-- The labels of a space in their order, and the cascade of a space delete.
CREATE INDEX labels_space_position ON labels (space_id, position);

-- One global label per name.
CREATE UNIQUE INDEX labels_global_name ON labels (name) WHERE space_id IS NULL;

-- One user action on a task, one row; see event.ts. Rows are never updated. Written by the app inside the
-- transaction of the change, never by a trigger: SQLite cannot know who acted. `changes` is JSON: it names its
-- action and its keys vary with it, it is read whole, and no query filters on its content.
CREATE TABLE task_events (
	id         INTEGER PRIMARY KEY AUTOINCREMENT, -- the order within a task; the id of a done that the event recorded
	task_id    INTEGER NOT NULL REFERENCES tasks (id) ON DELETE CASCADE,
	actor_id   INTEGER NOT NULL REFERENCES users (id),
	changes    TEXT    NOT NULL CHECK (json_valid(changes) AND json_type(changes) = 'object'), -- TaskChanges in event.ts
	created_at TEXT    NOT NULL                   -- the write's time
) STRICT;

-- The events of a task, oldest first: by id, since the clock may step back and the id never does.
CREATE INDEX task_events_task ON task_events (task_id, id);

-- The time of the newest event, which the backup list shows for every file.
CREATE INDEX task_events_time ON task_events (created_at, id);

-- One press of Done on a repeating task; `repeatDones` in task.ts. Keyed by the event that recorded it, whose actor
-- and time the row repeats: the state of a task never reads from its events. The app deletes a task's rows when it
-- drops the days; a removed done goes, its event stays.
CREATE TABLE repeat_dones (
	event_id INTEGER PRIMARY KEY REFERENCES task_events (id),
	task_id  INTEGER NOT NULL REFERENCES tasks (id) ON DELETE CASCADE,
	done_at  TEXT    NOT NULL,
	actor_id INTEGER NOT NULL REFERENCES users (id)
) STRICT;

-- The dones of a task, newest first.
CREATE INDEX repeat_dones_task ON repeat_dones (task_id, event_id DESC);

-- An unread notification: the actor chose to tell this user about this event. Inserted in the event's transaction,
-- never for the actor; deleted when the user reads the task. Nothing is kept once read.
CREATE TABLE notifications (
	user_id  INTEGER NOT NULL REFERENCES users (id),
	event_id INTEGER NOT NULL REFERENCES task_events (id) ON DELETE CASCADE,
	PRIMARY KEY (user_id, event_id) -- also the unread of a user, newest first
) STRICT, WITHOUT ROWID;

-- The cascade from the event.
CREATE INDEX notifications_event ON notifications (event_id);

-- Values of the server as a whole, as text, one row each. The push service keeps its VAPID key pair here: a
-- subscription is bound to the key it was made with, so the keys stay with the subscriptions through every backup.
CREATE TABLE settings (
	key   TEXT NOT NULL PRIMARY KEY,
	value TEXT NOT NULL
) STRICT, WITHOUT ROWID;

-- Full-text search over the current text of the tasks and their comments; see the search service. Two FTS5 indexes
-- over the rows themselves (external content), so the text is not stored twice: `task_search` over the title and the
-- body, rowid the task id, and `comment_search` over the body, rowid the comment id. Kept by the triggers below, not
-- by the services: an index needs no actor, and a trigger also sees the deletes a cascade makes. An FTS5 delete must
-- repeat the values indexed, so every trigger folds the old text the same way as the new.
-- `unicode61` folds the case of every script and drops the accents of Latin; it keeps `ё` apart from `е`, so the
-- index holds `е` for both, and the search service folds a query the same way. `rebuild` would re-read the unfolded
-- rows: the indexes are filled by the triggers only.
CREATE VIRTUAL TABLE task_search USING fts5(
	title, body, content = 'tasks', content_rowid = 'id', tokenize = 'unicode61 remove_diacritics 2'
);

CREATE TRIGGER tasks_search_insert AFTER INSERT ON tasks BEGIN
	INSERT INTO task_search (rowid, title, body) VALUES (new.id, replace(replace(new.title, 'ё', 'е'), 'Ё', 'Е'), replace(replace(new.body, 'ё', 'е'), 'Ё', 'Е'));
END;

-- Every task write sets both columns, so the WHEN skips the writes that leave the text as it was.
CREATE TRIGGER tasks_search_update AFTER UPDATE OF title, body ON tasks
WHEN old.title IS NOT new.title OR old.body IS NOT new.body BEGIN
	INSERT INTO task_search (task_search, rowid, title, body) VALUES ('delete', old.id, replace(replace(old.title, 'ё', 'е'), 'Ё', 'Е'), replace(replace(old.body, 'ё', 'е'), 'Ё', 'Е'));
	INSERT INTO task_search (rowid, title, body) VALUES (new.id, replace(replace(new.title, 'ё', 'е'), 'Ё', 'Е'), replace(replace(new.body, 'ё', 'е'), 'Ё', 'Е'));
END;

CREATE TRIGGER tasks_search_delete AFTER DELETE ON tasks BEGIN
	INSERT INTO task_search (task_search, rowid, title, body) VALUES ('delete', old.id, replace(replace(old.title, 'ё', 'е'), 'Ё', 'Е'), replace(replace(old.body, 'ё', 'е'), 'Ё', 'Е'));
END;

CREATE VIRTUAL TABLE comment_search USING fts5(
	body, content = 'comments', content_rowid = 'id', tokenize = 'unicode61 remove_diacritics 2'
);

CREATE TRIGGER comments_search_insert AFTER INSERT ON comments BEGIN
	INSERT INTO comment_search (rowid, body) VALUES (new.id, replace(replace(new.body, 'ё', 'е'), 'Ё', 'Е'));
END;

CREATE TRIGGER comments_search_update AFTER UPDATE OF body ON comments WHEN old.body IS NOT new.body BEGIN
	INSERT INTO comment_search (comment_search, rowid, body) VALUES ('delete', old.id, replace(replace(old.body, 'ё', 'е'), 'Ё', 'Е'));
	INSERT INTO comment_search (rowid, body) VALUES (new.id, replace(replace(new.body, 'ё', 'е'), 'Ё', 'Е'));
END;

CREATE TRIGGER comments_search_delete AFTER DELETE ON comments BEGIN
	INSERT INTO comment_search (comment_search, rowid, body) VALUES ('delete', old.id, replace(replace(old.body, 'ё', 'е'), 'Ё', 'Е'));
END;

-- Seed: the first user, `admin` with the password `admin`, to be changed after the first login. The hash is
-- argon2id of `admin`; the password is public, so a fixed salt gives nothing away.
INSERT INTO users (username, password_hash, admin, created_at) VALUES (
	'admin',
	'$argon2id$v=19$m=65536,t=2,p=1$aTeOf9i3bnAJBu9GwX00QK0m6rOOtOlfcbSohzj6hXY$jETRLxKOgjXmpuDVfEn29XEaafhfb17y/wNzr4ME1Jg',
	1,
	strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
);
INSERT INTO spaces (slug, name, owner_id, created_at)
	SELECT 'admin', 'admin', id, created_at FROM users WHERE username = 'admin';
INSERT INTO space_members (space_id, user_id, role)
	SELECT id, owner_id, 'manager' FROM spaces WHERE slug = 'admin';
-- The global labels every space starts with; an admin changes them on /admin/labels.
INSERT INTO labels (space_id, name, color, position, created_at) VALUES
	(NULL, 'urgent', '#d73a4a', 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),    -- do first
	(NULL, 'paused', '#fbca04', 2, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),    -- stopped for now, will continue
	(NULL, 'cancelled', '#6a737d', 3, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')); -- closed without doing it
