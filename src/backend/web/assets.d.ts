// A `with { type: "file" }` import gives the file's path: on disk in dev, inside the binary after `bun build --compile`.
declare module "*.png" {
	const path: string;
	export default path;
}
declare module "*/sw.js" {
	const path: string;
	export default path;
}
