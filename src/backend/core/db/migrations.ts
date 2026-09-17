// The migrations that bring an older database to the latest schema. Append-only: a released migration never changes,
// since a database on the server has run it, and a mistake is fixed by a new one. A migration that changes the schema
// comes with the same change to schema.sql, which a new database is made from; the test in tests/core.test.ts checks
// that both give the same structure. A migration is a function, not SQL text: a step may need code, such as a value
// read from the old rows. It inserts with its own SQL and never calls a service, whose rules may change after it ran.

import type { Database } from "bun:sqlite";

type Migration = (db: Database) => void;

// Schema v1: the starting schema, which every later migration changes. Never run by the app: no database is older
// than v1, and a new one is made from schema.sql, where the tables and columns are explained. The test runs it.
const v1: Migration = (db) => {
	db.run(`
		CREATE TABLE users (
			id            INTEGER PRIMARY KEY AUTOINCREMENT,
			username      TEXT    NOT NULL UNIQUE,
			password_hash TEXT    NOT NULL,
			admin         INTEGER NOT NULL DEFAULT 0 CHECK (admin IN (0, 1)),
			created_at    TEXT    NOT NULL
		) STRICT;

		CREATE TABLE sessions (
			token_hash    TEXT    PRIMARY KEY,
			user_id       INTEGER NOT NULL REFERENCES users (id),
			expires_at    TEXT    NOT NULL,
			push_endpoint TEXT,
			push_p256dh   TEXT,
			push_auth     TEXT,
			CHECK ((push_endpoint IS NULL) = (push_p256dh IS NULL) AND (push_endpoint IS NULL) = (push_auth IS NULL))
		) STRICT, WITHOUT ROWID;

		CREATE INDEX sessions_user ON sessions (user_id);
		CREATE UNIQUE INDEX sessions_push_endpoint ON sessions (push_endpoint) WHERE push_endpoint IS NOT NULL;

		CREATE TABLE spaces (
			id         INTEGER PRIMARY KEY AUTOINCREMENT,
			slug       TEXT    NOT NULL UNIQUE,
			name       TEXT    NOT NULL UNIQUE,
			owner_id   INTEGER UNIQUE REFERENCES users (id),
			created_at TEXT    NOT NULL
		) STRICT;

		CREATE TABLE space_members (
			space_id INTEGER NOT NULL REFERENCES spaces (id) ON DELETE CASCADE,
			user_id  INTEGER NOT NULL REFERENCES users (id),
			role     TEXT    NOT NULL CHECK (role IN ('manager', 'editor', 'viewer')),
			PRIMARY KEY (space_id, user_id)
		) STRICT, WITHOUT ROWID;

		CREATE INDEX space_members_user ON space_members (user_id);

		CREATE TABLE tasks (
			id          INTEGER PRIMARY KEY AUTOINCREMENT,
			space_id    INTEGER NOT NULL REFERENCES spaces (id) ON DELETE CASCADE,
			title       TEXT    NOT NULL,
			body        TEXT    NOT NULL,
			closed_at   TEXT,
			due_date    TEXT,
			assignee_id INTEGER REFERENCES users (id),
			repeat_days INTEGER CHECK (repeat_days IS NULL OR repeat_days >= 1),
			author_id   INTEGER NOT NULL REFERENCES users (id),
			created_at  TEXT    NOT NULL,
			updated_at  TEXT    NOT NULL
		) STRICT;

		CREATE INDEX tasks_space_updated ON tasks (space_id, updated_at DESC);
		CREATE INDEX tasks_assignee_open ON tasks (assignee_id) WHERE closed_at IS NULL;

		CREATE TABLE task_labels (
			task_id INTEGER NOT NULL REFERENCES tasks (id) ON DELETE CASCADE,
			name    TEXT    NOT NULL,
			PRIMARY KEY (task_id, name)
		) STRICT, WITHOUT ROWID;

		CREATE INDEX task_labels_name ON task_labels (name, task_id);

		CREATE TABLE comments (
			id         INTEGER PRIMARY KEY AUTOINCREMENT,
			task_id    INTEGER NOT NULL REFERENCES tasks (id) ON DELETE CASCADE,
			author_id  INTEGER NOT NULL REFERENCES users (id),
			body       TEXT    NOT NULL,
			created_at TEXT    NOT NULL
		) STRICT;

		CREATE INDEX comments_task ON comments (task_id);

		CREATE TABLE labels (
			id         INTEGER PRIMARY KEY AUTOINCREMENT,
			space_id   INTEGER REFERENCES spaces (id) ON DELETE CASCADE,
			name       TEXT    NOT NULL,
			color      TEXT    NOT NULL,
			position   INTEGER NOT NULL,
			created_at TEXT    NOT NULL,
			UNIQUE (space_id, name)
		) STRICT;

		CREATE INDEX labels_space_position ON labels (space_id, position);
		CREATE UNIQUE INDEX labels_global_name ON labels (name) WHERE space_id IS NULL;

		CREATE TABLE task_events (
			id         INTEGER PRIMARY KEY AUTOINCREMENT,
			task_id    INTEGER NOT NULL REFERENCES tasks (id) ON DELETE CASCADE,
			actor_id   INTEGER NOT NULL REFERENCES users (id),
			changes    TEXT    NOT NULL CHECK (json_valid(changes) AND json_type(changes) = 'object'),
			created_at TEXT    NOT NULL
		) STRICT;

		CREATE INDEX task_events_task ON task_events (task_id, id);
		CREATE INDEX task_events_time ON task_events (created_at, id);

		CREATE TABLE repeat_dones (
			event_id INTEGER PRIMARY KEY REFERENCES task_events (id),
			task_id  INTEGER NOT NULL REFERENCES tasks (id) ON DELETE CASCADE,
			done_at  TEXT    NOT NULL,
			actor_id INTEGER NOT NULL REFERENCES users (id)
		) STRICT;

		CREATE INDEX repeat_dones_task ON repeat_dones (task_id, event_id DESC);

		CREATE TABLE notifications (
			user_id  INTEGER NOT NULL REFERENCES users (id),
			event_id INTEGER NOT NULL REFERENCES task_events (id) ON DELETE CASCADE,
			PRIMARY KEY (user_id, event_id)
		) STRICT, WITHOUT ROWID;

		CREATE INDEX notifications_event ON notifications (event_id);

		CREATE TABLE settings (
			key   TEXT NOT NULL PRIMARY KEY,
			value TEXT NOT NULL
		) STRICT, WITHOUT ROWID;

		CREATE VIRTUAL TABLE task_search USING fts5(
			title, body, content = 'tasks', content_rowid = 'id', tokenize = 'unicode61 remove_diacritics 2'
		);

		CREATE TRIGGER tasks_search_insert AFTER INSERT ON tasks BEGIN
			INSERT INTO task_search (rowid, title, body) VALUES (new.id, replace(replace(new.title, 'ё', 'е'), 'Ё', 'Е'), replace(replace(new.body, 'ё', 'е'), 'Ё', 'Е'));
		END;

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
		INSERT INTO labels (space_id, name, color, position, created_at) VALUES
			(NULL, 'urgent', '#d73a4a', 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
			(NULL, 'paused', '#fbca04', 2, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
			(NULL, 'cancelled', '#6a737d', 3, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
	`);
};

/**
 * Applied in order by db.ts to a database behind the latest version; `PRAGMA user_version` is the count applied, and
 * each one commits together with its version bump. A new database runs schema.sql instead and starts at the count of
 * this list. A schema change is a new migration appended here and the same change in schema.sql.
 */
export const MIGRATIONS: readonly Migration[] = [v1];
