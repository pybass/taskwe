// Deploy to a Debian or Ubuntu host over SSH, fresh or already running: docs/deployment.md. Every host step is a
// no-op when already done, so the same run serves the first deploy and an update. The firewall stays with the host
// owner. The service runs as the system user `taskwe`, which owns only `data/`.
//
//   bun scripts/deploy.ts <ssh-host> [bun-target]     e.g. bun scripts/deploy.ts root@tasks.example.com bun-linux-arm64
//
// The target must match the host CPU; the default is bun-linux-x64. The script asks for the site's domain and port
// only when the host has no /apps/taskwe/Caddyfile and no unit yet; an update keeps the current ones.
//
// Caddy layout: /etc/caddy/Caddyfile holds only the global options and `import /apps/*/Caddyfile`; every app under
// /apps owns its vhost in its own directory. The global file is written only when missing or still the package
// default; a file edited by hand that lacks the import stops the deploy, so another app on the same host keeps
// working.
import { join } from "node:path";

const APP_DIR = "/apps/taskwe";
const UNIT_PATH = "/etc/systemd/system/taskwe.service";
const SERVICE_USER = "taskwe";
const IMPORT_LINE = "import /apps/*/Caddyfile";

function fail(message: string): never {
	console.error(message);
	process.exit(1);
}

function run(step: string, command: string[], stdin?: string): void {
	console.log(`==> ${step}`);
	const { exitCode } = Bun.spawnSync(command, {
		cwd: join(import.meta.dir, ".."),
		stdin: stdin === undefined ? "ignore" : Buffer.from(stdin),
		stdout: "inherit",
		stderr: "inherit",
	});
	if (exitCode !== 0) fail(`${step}: exit code ${exitCode}`);
}

/** The file's content, or an empty string when the host has no such file. */
function readHostFile(host: string, path: string): string {
	const { exitCode, stdout } = Bun.spawnSync(["ssh", host, `cat ${path} 2>/dev/null || true`], { stderr: "inherit" });
	if (exitCode !== 0) fail(`ssh ${host}: exit code ${exitCode}`);
	return stdout.toString();
}

/** The site of the vhost file this script wrote. */
function readCurrentDomain(host: string): string | undefined {
	return readHostFile(host, `${APP_DIR}/Caddyfile`).match(/^([^\s:{]\S*) \{$/m)?.[1];
}

/** The port of the unit this script wrote. */
function readCurrentPort(host: string): string | undefined {
	return readHostFile(host, UNIT_PATH).match(/^Environment=PORT=(\d+)$/m)?.[1];
}

const [host, target = "bun-linux-x64"] = Bun.argv.slice(2);
if (host === undefined || Bun.argv.length > 4) fail("Usage: bun scripts/deploy.ts <ssh-host> [bun-target]");

const domain = readCurrentDomain(host) ?? prompt("Domain of the site");
if (domain === null || domain === "") fail("A domain is required: Caddy serves the site on it");
// Another app on the host may already hold 3000.
const port = readCurrentPort(host) ?? prompt("Port the app listens on", "3000");
if (port === null || !/^\d+$/.test(port)) fail("A numeric port is required");

run(`build ${target}`, ["just", "build", target]);
// Updating Caddy is the host owner's job, like the firewall: a package repository that is down must not stop a deploy.
run(`install caddy on ${host}`, [
	"ssh",
	host,
	`(command -v caddy >/dev/null || (apt-get update -q && apt-get install -y caddy)) && mkdir -p ${APP_DIR}`,
]);
// The chown runs on every deploy: a host that ran as root before, or a file a root restore copied in, becomes
// writable by the service.
run(`create the service user on ${host}`, [
	"ssh",
	host,
	`(id -u ${SERVICE_USER} >/dev/null 2>&1 || useradd --system --user-group --no-create-home --home-dir ${APP_DIR} --shell /usr/sbin/nologin ${SERVICE_USER}) && mkdir -p ${APP_DIR}/data && chown -R ${SERVICE_USER}:${SERVICE_USER} ${APP_DIR}/data`,
]);

const globalCaddyfile = readHostFile(host, "/etc/caddy/Caddyfile");
if (!globalCaddyfile.includes(IMPORT_LINE)) {
	// `dpkg -V` names the conffile only when it differs from the package's, so an empty match means the untouched
	// default, which is safe to replace. Any other file is someone's config: never overwrite it.
	const { exitCode, stdout } = Bun.spawnSync(["ssh", host, "dpkg -V caddy 2>/dev/null | grep /etc/caddy/Caddyfile || true"], {
		stderr: "inherit",
	});
	if (exitCode !== 0) fail(`ssh ${host}: exit code ${exitCode}`);
	if (globalCaddyfile !== "" && stdout.toString() !== "") {
		fail(
			`/etc/caddy/Caddyfile on ${host} was edited by hand and lacks "${IMPORT_LINE}". Add that line to it and run the deploy again.`,
		);
	}
	// Caddy runs without an ACME account email; the CA uses it only for expiry notices.
	const email = prompt("Email for the certificate authority (empty to skip)") ?? "";
	const globalBlock = email === "" ? "" : `{\n\temail ${email}\n}\n\n`;
	run(
		"write the global Caddyfile",
		["ssh", host, "cat > /etc/caddy/Caddyfile"],
		`# Nothing site-specific lives here. Each app under /apps owns its own vhost file.\n${globalBlock}${IMPORT_LINE}\n`,
	);
}

run(
	"write the service unit",
	["ssh", host, `cat > ${UNIT_PATH}`],
	`[Unit]
Description=taskwe
After=network.target

[Service]
User=${SERVICE_USER}
WorkingDirectory=${APP_DIR}
Environment=DATA_PATH=${APP_DIR}/data
Environment=PORT=${port}
Environment=SITE_URL=https://${domain}
ExecStart=${APP_DIR}/taskwe
Restart=on-failure
NoNewPrivileges=yes
ProtectSystem=strict
ReadWritePaths=${APP_DIR}/data
ProtectHome=yes
PrivateTmp=yes

[Install]
WantedBy=multi-user.target
`,
);
run(
	"write the vhost Caddyfile",
	["ssh", host, `cat > ${APP_DIR}/Caddyfile`],
	`${domain} {\n\tencode zstd gzip\n\treverse_proxy 127.0.0.1:${port}\n}\n`,
);
run("enable the service and reload caddy", [
	"ssh",
	host,
	"systemctl daemon-reload && systemctl enable taskwe && systemctl reload caddy",
]);
run(`upload to ${host}:${APP_DIR}/taskwe.new`, ["scp", "dist/taskwe", `${host}:${APP_DIR}/taskwe.new`]);
// The rename is atomic and the running process keeps the old file open, so the upload never hits "text file busy".
// `is-active` fails when the new binary died right after the restart, which `restart` itself does not report.
run("swap and restart", [
	"ssh",
	host,
	`cd ${APP_DIR} && ([ ! -e taskwe ] || mv -f taskwe taskwe.prev) && mv taskwe.new taskwe && systemctl restart taskwe && sleep 1 && systemctl is-active taskwe`,
]);
console.log(
	`==> done: https://${domain} (rollback: ssh ${host} 'cd ${APP_DIR} && mv taskwe.prev taskwe && systemctl restart taskwe')`,
);
