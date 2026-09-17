// A `with { type: "text" }` import gives the file's content: read from disk in dev, embedded after `bun build --compile`.
declare module "*.sql" {
	const text: string;
	export default text;
}
