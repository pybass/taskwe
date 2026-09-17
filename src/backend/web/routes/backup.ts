import { BackupName, BackupRename } from "#shared/backup.ts";
import type { Api } from "../../core/api.ts";
import { HttpError, readJson, routes, withToken } from "../http.ts";

export function createBackupRoutes(api: Api) {
	return routes({
		"/api/admin/backups": {
			GET: withToken((token) => Response.json(api.listBackups(token))),
			POST: withToken((token) => Response.json(api.createBackup(token), { status: 201 })),
		},
		"/api/admin/schema": {
			GET: withToken((token) => Response.json(api.checkSchema(token))),
		},
		"/api/admin/backups/upload": {
			// A multipart body with the file in the field `file` and its `BackupName` in the field `name`.
			POST: withToken(async (token, req) => {
				const form = await req.formData().catch((e: unknown) => {
					throw new HttpError(400, "Expected a multipart form body.", { cause: e });
				});
				const file = form.get("file");
				if (!(file instanceof Blob)) throw new HttpError(400, "Expected a file in the field `file`.");
				const name = BackupName.safeParse(form.get("name"));
				if (!name.success) throw new HttpError(400, "Expected a backup name in the field `name`.");
				const backup = api.uploadBackup(token, name.data, new Uint8Array(await file.arrayBuffer()));
				return Response.json(backup, { status: 201 });
			}),
		},
		"/api/admin/backups/:name/restore": {
			POST: withToken((token, req) => Response.json(api.restoreBackup(token, req.params.name))),
		},
		"/api/admin/backups/:name": {
			// The file as a download under its own name, so the browser saves it as the list shows it.
			GET: withToken((token, req) => {
				const path = api.getBackupPath(token, req.params.name);
				return new Response(Bun.file(path), {
					headers: { "content-disposition": `attachment; filename="${req.params.name}"` },
				});
			}),
			PATCH: withToken(async (token, req) =>
				Response.json(api.renameBackup(token, req.params.name, (await readJson(req, BackupRename)).name)),
			),
			DELETE: withToken((token, req) => {
				api.deleteBackup(token, req.params.name);
				return new Response(null, { status: 204 });
			}),
		},
	});
}
