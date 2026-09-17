import { Api } from "./core/api.ts";
import { Core } from "./core/core.ts";
import { createServer } from "./web/server.ts";

// Destructured: `Bun.env` is an index signature, and both the type check and the linter reject the other spellings.
// SITE_URL falls back to Core's default when unset; unset also means a plain local server, so the cookie is not Secure.
const { DATA_PATH = "data", HOST = "127.0.0.1", SITE_URL } = Bun.env;
const server = createServer(new Api(new Core(DATA_PATH, SITE_URL)), HOST, SITE_URL?.startsWith("https:") ?? false);
console.log(`Listening on ${server.url}`);
