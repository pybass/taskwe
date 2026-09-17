import type { Database } from "bun:sqlite";
import { copyFileSync, renameSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { migrate, openDatabase, readSchemaVersion } from "./db/db.ts";
import { MIGRATIONS } from "./db/migrations.ts";
import { InvalidOperationError } from "./errors.ts";
import { BackupService } from "./features/backup/service.ts";
import { CommentService } from "./features/comment/service.ts";
import { EventService } from "./features/event/service.ts";
import { LabelService } from "./features/label/service.ts";
import { NotificationService } from "./features/notification/service.ts";
import { PushService } from "./features/push/service.ts";
import { SearchService } from "./features/search/service.ts";
import { SessionService } from "./features/session/service.ts";
import { SpaceService } from "./features/space/service.ts";
import { TaskService } from "./features/task/service.ts";
import { UserService } from "./features/user/service.ts";

/** Every feature service in one namespace, listed by hand: a service is added here and nowhere else. */
type Services = {
	readonly user: UserService;
	readonly session: SessionService;
	readonly space: SpaceService;
	readonly label: LabelService;
	readonly task: TaskService;
	readonly comment: CommentService;
	readonly event: EventService;
	readonly search: SearchService;
	readonly notification: NotificationService;
	readonly push: PushService;
	readonly backup: BackupService;
};

/** A container, not a layer: it owns the storage and the feature services over it. Clients call `core.services.<feature>`. */
export class Core {
	/** Read at call time, never kept: `replaceDatabase` swaps it. */
	db: Database;
	readonly services: Services;
	/** The folder of `taskwe.db` and `backups/`; null for `:memory:`, which has no files. */
	readonly dataPath: string | null;
	/** Where the app is served, `https://tasks.example.com`: the contact a push service gets with every push. */
	readonly siteUrl: string;

	/** `dataPath` is a folder, created when missing, or `:memory:` for a database that lives only in the process. */
	constructor(dataPath: string, siteUrl = "https://localhost") {
		this.dataPath = dataPath === ":memory:" ? null : dataPath;
		this.siteUrl = siteUrl;
		this.db = openDatabase(this.dataPath === null ? ":memory:" : join(this.dataPath, "taskwe.db"));
		// Services store core and use it lazily; none may touch the database or core.services in its constructor.
		this.services = {
			user: new UserService(this),
			session: new SessionService(this),
			space: new SpaceService(this),
			label: new LabelService(this),
			task: new TaskService(this),
			comment: new CommentService(this),
			event: new EventService(this),
			search: new SearchService(this),
			notification: new NotificationService(this),
			push: new PushService(this),
			backup: new BackupService(this),
		};
		this.migrateDatabase();
		this.updateCaches();
	}

	/** Apply the pending migrations, after a backup of the file when it has a schema; a new or in-memory database gets none. */
	private migrateDatabase(): void {
		const version = readSchemaVersion(this.db);
		if (this.dataPath !== null && version > 0 && version < MIGRATIONS.length) {
			this.services.backup.createBackup(`before-v${version + 1}`);
		}
		migrate(this.db);
	}

	/** The user, space, and label services answer reads from a copy of their tables; fill them once every service exists. */
	private updateCaches(): void {
		this.services.user.updateUsersCache();
		this.services.space.updateSpacesCache();
		this.services.label.updateLabelsCache();
	}

	/**
	 * Replace `taskwe.db` with a copy of the file at `source` and reopen it: the copy is made first, so a failed copy
	 * leaves the connection and the file as they were; then the connection is closed, the copy is renamed over the live
	 * file in one step, and the migrations and the caches run as at start. The id counters end at the higher of the
	 * two databases': an older backup would otherwise give new rows the ids of rows written since, and a task id lives
	 * on in links and mentions. The caller checks the file first, see `BackupService.restoreBackup`.
	 * InvalidOperationError for `:memory:`.
	 */
	replaceDatabase(source: string): void {
		if (this.dataPath === null) throw new InvalidOperationError("An in-memory database cannot be replaced");
		const dbPath = join(this.dataPath, "taskwe.db");
		copyFileSync(source, `${dbPath}.new`);
		const counters = z
			.array(z.object({ name: z.string(), seq: z.int() }))
			.parse(this.db.query("SELECT name, seq FROM sqlite_sequence").all());
		this.db.close();
		renameSync(`${dbPath}.new`, dbPath);
		this.db = openDatabase(dbPath);
		this.migrateDatabase();
		// sqlite_sequence has no key: a table without rows has no row, and a lower one is replaced.
		this.db.transaction(() => {
			for (const { name, seq } of counters) {
				this.db.query("DELETE FROM sqlite_sequence WHERE name = $name AND seq < $seq").run({ name, seq });
				this.db
					.query(
						"INSERT INTO sqlite_sequence (name, seq) SELECT $name, $seq WHERE NOT EXISTS (SELECT 1 FROM sqlite_sequence WHERE name = $name)",
					)
					.run({ name, seq });
			}
		})();
		this.updateCaches();
	}

	close(): void {
		this.db.close();
	}
}
