// Restart the server when anything under src changes. `bun --hot` cannot do it: the frontend is bundled once at
// start, and a frontend file is not in the server's module graph. The browser reloads by hand.
import { watch } from "node:fs";

const start = () => {
	// The route tree is generated before every start, so the bundle never carries a stale one. Under Node the CLI
	// prints a warning about the import cycle in @tanstack/router-core; under Bun it does not.
	Bun.spawnSync(["bunx", "--bun", "tsr", "generate"], { stdout: "inherit", stderr: "inherit" });
	return Bun.spawn(["bun", "src/backend/main.ts"], { stdout: "inherit", stderr: "inherit" });
};
let server = start();
let timer: ReturnType<typeof setTimeout> | undefined;
watch("src", { recursive: true }, (_, filename) => {
	// The generator's own write would start a second restart.
	if (filename?.endsWith("routeTree.gen.ts")) return;
	clearTimeout(timer);
	// One restart per burst of saves, and only after the old process freed the port.
	timer = setTimeout(async () => {
		server.kill();
		await server.exited;
		server = start();
	}, 100);
});
