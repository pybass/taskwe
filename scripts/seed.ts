// Seed a development database: a fixed cast of users and spaces, then a timeline of tasks written through the
// services, so every rule holds and every event shape is real. The clock is faked: `Date` answers with the seed's
// time, which walks forward through the timeline, so the timestamps spread over the preset's range and end at the
// real now. The same seed gives the same database on every run.
// Usage: bun scripts/seed.ts [small|full] [--force]. Stop the dev server first: it keeps the old file open.
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { z } from "zod";
import type { Space, SpaceRole } from "#shared/space.ts";
import type { NewTask, Task, TaskPatch } from "#shared/task.ts";
import { Core } from "../src/backend/core/core.ts";

const PRESETS = {
	small: { tasks: 500, rangeDays: 30, skew: 1.5 },
	full: { tasks: 50_000, rangeDays: 730, skew: 2 },
};

const { positionals, values } = parseArgs({
	args: Bun.argv.slice(2),
	options: { force: { type: "boolean", default: false } },
	allowPositionals: true,
});
const preset = PRESETS[z.enum(["small", "full"]).default("small").parse(positionals[0])];
const { DATA_PATH = "data" } = Bun.env;
const dbPath = join(DATA_PATH, "taskwe.db");
if (existsSync(dbPath) && !values.force) {
	console.error(`${dbPath} exists; pass --force to replace it`);
	process.exit(1);
}
for (const suffix of ["", "-journal", "-wal", "-shm"]) rmSync(`${dbPath}${suffix}`, { force: true });

// Random: mulberry32 with a fixed seed.

let state = 2026;
function random(): number {
	state = (state + 0x6d2b79f5) | 0;
	let t = Math.imul(state ^ (state >>> 15), 1 | state);
	t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
	return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const chance = (probability: number): boolean => random() < probability;
const exponential = (mean: number): number => -Math.log(1 - random()) * mean;
function pick<T>(items: readonly T[]): T {
	const item = items[Math.floor(random() * items.length)];
	if (item === undefined) throw new Error("Nothing to pick from");
	return item;
}
function weighted<T>(entries: readonly (readonly [T, number])[]): T {
	let rest = random() * entries.reduce((sum, [, weight]) => sum + weight, 0);
	for (const [item, weight] of entries) {
		if (rest < weight) return item;
		rest -= weight;
	}
	return pick(entries)[0];
}
function sample<T>(items: readonly T[], count: number): T[] {
	const rest = [...items];
	const taken: T[] = [];
	while (taken.length < count && rest.length > 0) taken.push(...rest.splice(Math.floor(random() * rest.length), 1));
	return taken;
}

// Clock: the services stamp every write with `new Date()`, so the global class answers with the seed's time.

const RealDate = Date;
let clock = 0;
class SeededDate extends RealDate {
	constructor(value?: number | string | Date) {
		super(value ?? clock);
	}
	static override now(): number {
		return clock;
	}
}
// Not a plain assignment: the class has no `Date()` call form, which nothing here uses.
Object.defineProperty(globalThis, "Date", { value: SeededDate });

const DAY = 86_400_000;
const now = RealDate.now();
const start = now - preset.rangeDays * DAY;
const day = (ms: number): string => new RealDate(ms).toISOString().slice(0, 10);

// Cast: users, spaces, labels. Every password is the username; admin stays admin/admin.

const USERS = ["anna", "mark", "emma", "leo", "rose", "tom", "sam", "julia", "nick", "guest"] as const;
type Username = (typeof USERS)[number] | "admin";

const PALETTE = [
	"#d73a4a",
	"#0075ca",
	"#cfd3d7",
	"#a2eeef",
	"#7057ff",
	"#008672",
	"#e4e669",
	"#d876e3",
	"#0e8a16",
	"#b60205",
	"#5319e7",
	"#1d76db",
	"#c2e0c6",
	"#f9d0c4",
	"#bfd4f2",
	"#fbca04",
];

type Theme = "family" | "house" | "kids" | "trip" | "work" | "ops" | "personal";

// The first member is the creator, so a manager. `weight` is the share of the generated tasks.
const SHARED_SPACES: {
	slug: string;
	name: string;
	theme: Theme;
	weight: number;
	members: [Username, SpaceRole][];
	labels: string[];
}[] = [
	{
		slug: "family",
		name: "Family",
		theme: "family",
		weight: 30,
		members: [
			["anna", "manager"],
			["mark", "manager"],
			["emma", "editor"],
			["leo", "editor"],
			["rose", "viewer"],
			["admin", "editor"],
		],
		labels: ["shopping", "health", "school", "birthday", "car", "pets"],
	},
	{
		slug: "house",
		name: "House & Garden",
		theme: "house",
		weight: 20,
		members: [
			["mark", "manager"],
			["anna", "editor"],
			["tom", "editor"],
			["admin", "viewer"],
		],
		labels: ["repair", "garden", "cleaning", "buy", "electric", "plumbing"],
	},
	{
		slug: "kids",
		name: "Kids",
		theme: "kids",
		weight: 5,
		members: [
			["anna", "manager"],
			["mark", "editor"],
			["emma", "viewer"],
			["leo", "viewer"],
		],
		labels: ["homework", "sport", "music"],
	},
	{
		slug: "trip-2027",
		name: "Trip 2027",
		theme: "trip",
		weight: 7,
		members: [
			["anna", "manager"],
			["mark", "editor"],
			["emma", "editor"],
			["rose", "viewer"],
			["guest", "viewer"],
		],
		labels: ["booking", "packing", "documents", "ideas"],
	},
	{
		slug: "crm",
		name: "CRM project",
		theme: "work",
		weight: 20,
		members: [
			["tom", "manager"],
			["sam", "editor"],
			["julia", "editor"],
			["nick", "viewer"],
			["mark", "editor"],
		],
		labels: ["bug", "feature", "backend", "frontend", "design", "review", "blocked", "release"],
	},
	{
		slug: "ops",
		name: "Ops",
		theme: "ops",
		weight: 8,
		members: [
			["tom", "manager"],
			["nick", "manager"],
			["sam", "editor"],
		],
		labels: ["incident", "monitoring", "backup", "deploy", "security"],
	},
	{
		slug: "book-club",
		name: "Book club",
		theme: "personal",
		weight: 0,
		members: [
			["julia", "manager"],
			["anna", "editor"],
			["rose", "editor"],
		],
		labels: [],
	},
];

// The share of the generated tasks per personal space; guest never has any.
const PERSONAL_WEIGHTS: [Username, number][] = [
	["anna", 4],
	["mark", 3],
	["tom", 3],
	["emma", 1],
	["leo", 1],
	["rose", 1],
	["sam", 1],
	["julia", 1],
	["nick", 1],
	["admin", 1],
];

// Content pools.

const TITLES: Record<Theme, string[]> = {
	family: [
		"Buy milk and bread",
		"Book the dentist for Leo",
		"Pay the electricity bill",
		"Call grandma",
		"Renew car insurance",
		"Plan Emma's birthday party",
		"Order a new backpack for school",
		"Sign the school trip form",
		"Pick up the dry cleaning",
		"Buy a gift for Rose's birthday",
		"Schedule the car service",
		"Return the library books",
		"Fix Leo's bike",
		"Vet appointment for Biscuit",
		"Buy milk",
		"Call grandma about Sunday",
		"Book the doctor for Leo",
		"Pay the internet bill",
		"🎂 Cake for Sunday",
		"Pharmacy: vitamins and plasters",
		"Book a table for Friday",
		"Change the winter tires",
		"Update the family calendar",
		"Buy a birthday card",
		"Pay the kindergarten fee",
		"Sort the photos from summer",
		"Find a babysitter for Saturday",
		"Buy a new kettle",
		"Wash the car",
		"Order the school photos",
	],
	house: [
		"Fix the leaking tap in the kitchen",
		"Mow the lawn",
		"Clean the gutters",
		"Replace the hallway bulb",
		"Call the plumber about the boiler",
		"Paint the fence",
		"Plant tomatoes",
		"Order firewood",
		"Descale the coffee machine",
		"Defrost the freezer",
		"Trim the hedge",
		"Fix the garage door",
		"Buy a new hose",
		"Move the ficus to a bigger pot",
		"Water the garden",
		"Check the smoke detectors",
		"Clean the windows",
		"Oil the door hinges",
		"Buy compost",
		"Replace the shower head",
		"Wash the curtains",
		"Fix the wobbly chair",
		"Clear the basement",
		"Sharpen the lawnmower blade",
		"Winterize the outdoor tap",
	],
	kids: [
		"Math homework, chapter 5",
		"Piano practice",
		"Read 20 pages",
		"Football training on Tuesday",
		"Prepare the science project",
		"Pack the swimming bag",
		"Learn the poem",
		"Tidy the room",
		"Feed the hamster",
		"Dentist check-up",
		"Buy new sneakers",
		"Return the school laptop",
		"Sign up for the chess club",
		"English test on Friday",
		"Drawing class supplies",
	],
	trip: [
		"Book the flights",
		"Reserve the hotel in Lisbon",
		"Check passport expiry dates",
		"Buy travel insurance",
		"Rent a car for 5 days",
		"Make a packing list",
		"Book the aquarium tickets",
		"Find a dog sitter",
		"Exchange some cash",
		"Download offline maps",
		"Plan the day trip to Sintra",
		"Pack the chargers and adapters",
		"Print the boarding passes",
		"Book the airport parking",
		"Look up the tram schedule",
	],
	work: [
		"Fix the login redirect loop",
		"Add CSV export to the contacts page",
		"Upgrade Postgres to 17",
		"Write the release notes for 2.4",
		"Review the pricing page design",
		"Flaky test in the billing suite",
		"Add an index on deals.owner_id",
		"Migrate the mailer to the new API",
		"Investigate the slow dashboard query",
		"Rate limit the public API",
		"Onboarding checklist for new customers",
		"Refactor the permission checks",
		"Dark mode for the settings page",
		"Set up the staging environment",
		"Webhook retries with backoff",
		"Deduplicate contacts on import",
		"Customer asked for SSO",
		"Update the dependencies",
		"Empty state for the deals board",
		"Timezone bug in the calendar view",
		"Add a search box to the contact list",
		"Document the REST API",
		"Move secrets to the vault",
		"Pagination breaks on the last page",
		"Bulk delete for contacts",
	],
	ops: [
		"Rotate the TLS certificates",
		"Disk usage alert on db-2",
		"Set up backups for the new cluster",
		"Upgrade the Grafana host",
		"Review the on-call schedule",
		"Patch the kernel on the web nodes",
		"Clean up old Docker images",
		"Add a health check to the mailer",
		"Incident: API down for 12 minutes",
		"Reduce log retention to 30 days",
		"Move DNS to the new provider",
		"Test the restore procedure",
		"Replace the failed disk in nas-1",
		"Alert on 5xx rate",
		"Document the deploy steps",
	],
	personal: [
		"Read the Bun docs",
		"Renew the gym membership",
		"Call the bank",
		"Buy running shoes",
		"Finish the tax return",
		"Book a haircut",
		"Write the blog post",
		"Back up the laptop",
		"Try the new ramen place",
		"Learn 10 Portuguese words",
		"Sort the inbox",
		"Fix the bike light",
		"Order contact lenses",
		"Update the CV",
		"Plan the weekend hike",
		"Cancel the unused subscription",
		"Meditate 10 minutes",
		"Dentist",
		"Water the plants",
		"Return the parcel",
	],
};

// Long titles: a full sentence with the who, the when, and the catch, near the 200 character limit.
const LONG_TITLES: Record<Theme, string[]> = {
	family: [
		"Ask the school whether Leo can skip the trip on the 24th, the dentist is the same morning and moving it costs a fee",
		"Find out why the electricity bill doubled in August, compare with last year and call the provider if the meter reading looks wrong",
		"Buy the birthday present for grandma: she mentioned the blue cardigan from the shop next to the pharmacy, size M",
		"Return the broken stroller to the shop, the receipt is in the kitchen drawer, and ask for a refund rather than a voucher",
		"Sign up Emma for the summer camp before the early-bird price ends on Friday",
		"Book the family photo session for October, ideally a Saturday morning, and ask if Biscuit can be in the picture",
		"Sort out the paperwork for the new kindergarten: the vaccination record, the two photos, and the signed contract",
	],
	house: [
		"Call three plumbers for a quote on the boiler, the current one wants 900€ just to come and look at it",
		"Replace the rotten boards on the back deck before winter, the ones near the steps give way when you step on them",
		"Find out why the basement smells damp after the rain and check whether the drain under the stairs is blocked",
		"Order new blinds for the bedroom, 120 by 180 cm, same grey as the living room, and ask about the delivery time",
		"Clean the gutters on the north side and check the downpipe behind the shed, it overflowed during the last storm",
		"Get someone to look at the crack above the garage door, it grew about a centimeter since the spring",
	],
	kids: [
		"Help Emma with the history presentation about the Romans, it is due on Thursday and she has only the title so far",
		"Buy the football boots for Leo, size 36, the coach said studs not blades for the artificial pitch",
		"Ask the piano teacher whether the lesson can move to Wednesday for the rest of the term",
		"Find a maths tutor for the exam in June, two hours a week, ideally someone who can come to the house",
	],
	trip: [
		"Compare the flights to Lisbon on the 12th and the 13th, the later one is cheaper but lands at midnight",
		"Ask the hotel whether they have a room with a connecting door, or two rooms on the same floor, for the four of us plus Rose",
		"Check what the travel insurance covers for the rental car, the excess on the last trip was 1500€ and we had no idea",
		"Make a list of things to do on rainy days: museums, the aquarium, the covered market, and something for the kids",
	],
	work: [
		"Login redirects in a loop when the session cookie is set on the apex domain but the request comes from the www subdomain",
		"Contacts imported from the old CRM lose their phone numbers when the country code is written with spaces instead of a plus",
		"The dashboard query times out for accounts with more than 50k deals, add a materialized view or cache the counts per day",
		"Customer reports that the CSV export returns an empty file when a filter on the owner is active and the page is sorted by date",
		"Write the migration guide for the v2 webhooks: what changes in the payload, how to verify the signature, and the sunset date",
		"Investigate why the billing job ran twice on the 1st and issued duplicate invoices for three accounts",
		"Decide whether we keep the legacy search endpoint for one more release or remove it now that the new one covers every filter",
	],
	ops: [
		"db-2 hits 90% disk every night at 03:00 during the backup and drops back: find what fills it and move the temp files",
		"Rotate every TLS certificate before the CA change on the 30th, the wildcard one on the load balancer first",
		"Write the postmortem for the 12-minute API outage: timeline, root cause, what we change, and who owns each action",
		"Set up alerting for the mailer queue: page when more than 500 messages wait for over 10 minutes",
		"Check whether the nightly restore test still runs on the new cluster, the last report in the channel is from August",
	],
	personal: [
		"Read the chapter on tail calls in the Bun docs and write down whether it matters for the recursive parser",
		"Find a dentist that takes new patients near the office, the current one is 40 minutes away and always late",
		"Write the blog post about the move to SQLite: why, what broke, what it cost, and the numbers from the benchmark",
		"Sort out the paperwork for the tax return: the receipts from the home office, the insurance letter, and the donation statement",
		"Look into the cheaper phone plan, the current one charges for roaming and I use maybe two gigabytes a month",
	],
};

const NOTES = [
	"Before Friday.",
	"Ask Mark first.",
	"See the photo in the chat.",
	"Same as last year.",
	"The cheapest option is fine.",
	"Do not forget!",
	"Needs two people.",
	"Only if the weather is good.",
	"Receipt goes to the folder.",
	"Check the warranty first.",
];
const CHECK_ITEMS = [
	"milk",
	"bread",
	"eggs",
	"batteries",
	"call first",
	"measure twice",
	"ask for a receipt",
	"take photos",
	"check the warranty",
	"bring the keys",
	"compare prices",
	"confirm the date",
];
const STEPS = ["call them", "get a quote", "order", "wait for delivery", "install", "test", "pay", "write it down"];

const COMMENTS = [
	"Done.",
	"On it.",
	"Can this wait until next week?",
	"Bought it, the receipt is on the fridge.",
	"Moved to Thursday, the shop is closed on Wednesday.",
	"I called them, they will call back tomorrow.",
	"Not needed anymore.",
	"All set.",
	"Will do tomorrow.",
	"👍",
	"Any update?",
	"Half done, the rest tomorrow.",
	"The part arrived, will fix it on Saturday.",
	"Please double-check the date.",
	"Fixed in `main`, deploying tonight.",
	"Reproduced on staging, looking into it.",
	"Blocked by #12",
	"LGTM",
	"Let's split this into two tasks.",
	"Costs about 40€, ok?",
	"Ok",
	"Ping me when done",
	"> quoted from the email\n\nThey confirmed the booking.",
	"Notes:\n- called twice\n- no answer\n- try again Monday",
];
const MEDIUM_COMMENTS = [
	"I called them this morning. They can come on Thursday between 9 and 12, but only if someone is home. Mark, can you take the morning?",
	"Bought two instead of one, they were on offer. The second one is in the garage, on the top shelf next to the paint.",
	"Not sure this is still needed. The last time we talked about it was in June and nothing happened since. Closing on Friday if nobody objects.",
	"Tried it on staging and it works, but the page takes about 4 seconds on the first load. Not a blocker, but worth a follow-up task.",
	"The shop was closed, the sign says they reopen on Monday. I will go again then, unless someone passes by earlier.",
	"Quick update: the quote came in at 640€ including delivery. That is 200 less than the first one, and they can do it next week.",
	"I looked at this for an hour and could not reproduce it. Can you send the exact steps, and which browser? A screenshot would help too.",
	"Moved it to next month. The parts are on backorder and nobody could tell me when they arrive, so there is no point keeping it for this week.",
];
const LONG_COMMENTS = [
	[
		"Talked to the supplier today, here is the summary.",
		"",
		"They can deliver on the 20th, but only the panels; the handles come from another warehouse and take another week. " +
			"Payment is 30% upfront and the rest on delivery. They want the exact measurements again because the last order was wrong by 2 cm.",
		"",
		"- [x] measurements sent",
		"- [ ] deposit paid",
		"- [ ] delivery date confirmed",
		"",
		"If the handles are late we could install without them and add them later, the installer said it is fine.",
	].join("\n"),
	[
		"Found it. The redirect comes from the auth middleware, not the router.",
		"",
		"When the cookie is missing, the middleware sends the user to `/login?next=...`, and the login page redirects back to `next` " +
			"after the cookie is set. But on `www` the cookie is set for the apex domain, so the next request has no cookie again.",
		"",
		"```ts",
		'res.cookie("session", token, { domain: ".example.com" });',
		"```",
		"",
		"Setting the domain explicitly fixes it locally. Needs a test before we deploy, the last time we touched this we logged everyone out.",
	].join("\n"),
	[
		"> Can we do this next week instead?",
		"",
		"Yes, but then the discount is gone: the offer ends on Sunday. I would rather order now and cancel if we change our mind, " +
			"they refund within 14 days.",
		"",
		"Also, the delivery is free above 100€, so it might make sense to add the kettle from #7 to the same order.",
	].join("\n"),
	"I went through the whole list again and I think we are overcomplicating this. Most of the items are things we do every year " +
		"anyway, and the only new part is the booking, which takes ten minutes online. Let's keep this task for the booking only and " +
		"drop the rest, or move the rest to a separate task so this one can be closed. Anna, you had the login for the site, can you " +
		"do the booking tonight? If not I will do it tomorrow morning before work.",
	[
		"Prices I got today:",
		"",
		"| Shop | Price | Delivery |",
		"| --- | --- | --- |",
		"| Local | 89€ | pick up |",
		"| Online A | 74€ | 3 days |",
		"| Online B | 71€ | 8 days |",
		"",
		"The local one has it in stock and we need it this week, so I would just pay the extra 15€.",
	].join("\n"),
	[
		"Steps for whoever picks this up:",
		"",
		"1. Call the office and ask for the case number.",
		"2. Send the photos from the shared folder, the ones from the 3rd, not the later ones.",
		"3. Ask whether the plumber's invoice can still be added.",
		"4. Write the answer here.",
		"",
		"The office is open until 16:00 and they do not answer on Mondays.",
	].join("\n"),
	[
		"Two things came up while doing this.",
		"",
		"**First**, the old one is not broken, the fuse was. So we now have a spare, which is fine, but somebody should tell the shop " +
			"before the return window closes.",
		"",
		"**Second**, the cable behind the cabinet is too short for the new position. I taped it for now. It works, but it is not " +
			"pretty and I would not leave it like that for long.",
	].join("\n"),
];
function pickComment(): string {
	return pick(
		weighted([
			[COMMENTS, 60],
			[MEDIUM_COMMENTS, 25],
			[LONG_COMMENTS, 15],
		]),
	);
}
const CLOSING_COMMENTS = ["Done.", "Done, took 20 minutes.", "All set.", "Closing, not needed anymore.", "Fixed.", "✅"];
const DONE_COMMENTS = ["Done for today.", "Done, all fine.", "Done, it needs a new filter soon.", "All set."];
const EDIT_NOTES = ["typo", "added the price", "wrong day, fixed", "clarified"];

const LONG_BODY = [
	"# Kitchen renovation",
	"",
	"The full plan, week by week. Every step needs a photo before and after, and every invoice goes to the shared folder.",
	...Array.from({ length: 12 }, (_, week) =>
		[
			"",
			`## Week ${week + 1}`,
			"",
			"Remove the old cabinets and take the measurements again. Order the panels from the same supplier as the bathroom, " +
				"the color code is on the sample in the drawer. The electrician comes on Tuesday, the plumber on Thursday, and " +
				"nobody touches the wall behind the fridge until the inspection is signed. Keep the receipts.",
			"",
			"- [x] measure",
			"- [ ] order",
			"- [ ] deliver",
			"",
			"| Item | Price |",
			"| --- | --- |",
			"| Panels | 420€ |",
			"| Handles | 38€ |",
		].join("\n"),
	),
].join("\n");

function pickTitle(theme: Theme): string {
	if (chance(0.2)) return pick(LONG_TITLES[theme]);
	const title = pick(TITLES[theme]);
	return chance(0.15) ? `${title} (${pick(["before Friday", "this week", "asap", "when possible", "again"])})` : title;
}

function pickBody(theme: Theme, taskCount: number): string {
	switch (
		weighted([
			["empty", 45],
			["note", 25],
			["checklist", 12],
			["steps", 10],
			["mention", 8],
		] as const)
	) {
		case "empty":
			return "";
		case "note":
			return pick(NOTES);
		case "checklist":
			return sample(CHECK_ITEMS, 3 + Math.floor(random() * 3))
				.map((item, index) => `- [${index === 0 ? "x" : " "}] ${item}`)
				.join("\n");
		case "steps": {
			const steps = sample(STEPS, 3).map((step, index) => `${index + 1}. ${step}`);
			const tail =
				theme === "work" || theme === "ops"
					? "See https://example.com/docs and run `just deploy`.\n\n```sh\nssh nas-1\ndf -h\n```"
					: "See https://example.com/notes for the details.";
			return `Steps:\n\n${steps.join("\n")}\n\n${tail}`;
		}
		case "mention":
			return `Related to #${1 + Math.floor(random() * Math.max(1, taskCount))}. ${pick(NOTES)}`;
	}
}

// Database: the cast is written first, so the timeline finds every user, space, and label in place.

clock = start;
const core = new Core(DATA_PATH);

const userIds = new Map<Username, number>();
function userId(username: Username): number {
	const id = userIds.get(username);
	if (id === undefined) throw new Error(`No user ${username}`);
	return id;
}
const admin = core.services.user.findUserByUsername("admin");
if (admin === null) throw new Error("No admin");
userIds.set("admin", admin.id);
for (const username of USERS) {
	userIds.set(username, core.services.user.createUser({ username, password: username, admin: false }).id);
}

core.services.label.createLabel(null, { name: "waiting", color: "#bfd4f2" });
const spaceWeights: [{ space: Space; theme: Theme }, number][] = [];
for (const spec of SHARED_SPACES) {
	const [creator, ...members] = spec.members;
	if (creator === undefined) throw new Error(`No members in ${spec.slug}`);
	const space = core.services.space.createSpace(userId(creator[0]), {
		name: spec.name,
		slug: spec.slug,
		members: members.map(([username, role]) => ({ userId: userId(username), role })),
	});
	for (const name of spec.labels) core.services.label.createLabel(space.id, { name, color: pick(PALETTE) });
	spaceWeights.push([{ space, theme: spec.theme }, spec.weight]);
}
function personalSpace(username: Username): Space {
	const space = core.services.space.findSpaceBySlug(username);
	if (space === null) throw new Error(`No space ${username}`);
	return space;
}
for (const [username, weight] of PERSONAL_WEIGHTS)
	spaceWeights.push([{ space: personalSpace(username), theme: "personal" }, weight]);
for (const name of ["idea", "read"]) core.services.label.createLabel(personalSpace("anna").id, { name, color: pick(PALETTE) });
core.services.label.createLabel(personalSpace("tom").id, { name: "learn", color: pick(PALETTE) });

// Timeline: every write is planned with its time, then the plan runs in time order with the clock set to each.

type Write = { at: number; run: () => void };
type Ref = { taskId: number };
type Planned = { actorId: number; patch: TaskPatch } | null;
const plan: Write[] = [];
const DUE_OFFSETS = [0, 0, 1, 1, 2, 3, 3, 5, 7, 7, 10, 14, 14, 21, 30, 45, 60, 90, 180, 365];

const writersOf = (space: Space): number[] =>
	space.members.filter((member) => member.role !== "viewer").map((member) => member.userId);
const knownLabels = (space: Space): string[] => core.services.label.listSpaceLabels(space.id).map((label) => label.name);

/** Who to tell: only in the last three days, so the unread lists are full but not endless. */
function recipients(space: Space, actorId: number, preferredId: number | null): number[] {
	if (clock < now - 3 * DAY) return [];
	const others = space.members.map((member) => member.userId).filter((id) => id !== actorId);
	const ids = new Set<number>();
	if (preferredId !== null && preferredId !== actorId) ids.add(preferredId);
	if (others.length > 0 && chance(0.3)) ids.add(pick(others));
	return [...ids];
}

function planCreate(space: Space, at: number, build: () => [number, NewTask]): Ref {
	const ref: Ref = { taskId: 0 };
	plan.push({
		at,
		run: () => {
			const [authorId, input] = build();
			ref.taskId = core.services.task.createTask(authorId, space.id, input).id;
		},
	});
	return ref;
}

/** A patch built against the task as it is at that time; null skips, so a write never changes nothing. */
function planUpdate(ref: Ref, at: number, build: (task: Task, space: Space) => Planned): void {
	if (at >= now) return;
	plan.push({
		at,
		run: () => {
			const task = core.services.task.getTask(ref.taskId);
			const planned = build(task, core.services.space.getSpace(task.spaceId));
			if (planned !== null) core.services.task.updateTask(planned.actorId, ref.taskId, planned.patch);
		},
	});
}

function planComment(ref: Ref, at: number, body?: string): void {
	planUpdate(ref, at, (task, space) => {
		const actorId = pick(writersOf(space));
		return {
			actorId,
			patch: { comment: body ?? pickComment(), notifyUserIds: recipients(space, actorId, chance(0.5) ? task.assigneeId : null) },
		};
	});
	if (chance(0.05)) planCommentEdit(ref, at + exponential(DAY));
}

function planCommentEdit(ref: Ref, at: number): void {
	if (at >= now) return;
	plan.push({
		at,
		run: () => {
			const added = core.services.event
				.listTaskEvents(ref.taskId)
				.flatMap((event) =>
					event.changes.action === "updated" && event.changes.commentAdded !== undefined
						? [{ actorId: event.actorId, commentId: event.changes.commentAdded.commentId }]
						: [],
				);
			if (added.length === 0) return;
			const { actorId, commentId } = pick(added);
			const comment = core.services.comment.getComment(commentId);
			core.services.comment.updateComment(actorId, commentId, { body: `${comment.body}\n\nEdit: ${pick(EDIT_NOTES)}` });
		},
	});
}

function planClose(ref: Ref, at: number): void {
	planUpdate(ref, at, (task, space) => {
		if (task.closedAt !== null) return null;
		const actorId = pick(writersOf(space));
		const patch: TaskPatch = { closed: true, notifyUserIds: recipients(space, actorId, task.assigneeId) };
		if (chance(0.1) && !task.labels.includes("cancelled")) patch.labels = { added: ["cancelled"], removed: [] };
		if (chance(0.25)) patch.comment = pick(CLOSING_COMMENTS);
		return { actorId, patch };
	});
}

function planMove(ref: Ref, at: number): void {
	if (at >= now) return;
	plan.push({
		at,
		run: () => {
			const task = core.services.task.getTask(ref.taskId);
			const source = core.services.space.getSpace(task.spaceId);
			const moverId =
				source.ownerId ?? pick(source.members.filter((member) => member.role === "manager").map((member) => member.userId));
			// The rule of Api.moveTask: a manager of the source moves into a space where they edit, their own included.
			const targets = core.services.space
				.listSpaces()
				.filter(
					(space) =>
						space.id !== source.id &&
						(space.ownerId === moverId || space.members.some((member) => member.userId === moverId && member.role !== "viewer")),
				);
			if (targets.length === 0) return;
			const target = pick(targets);
			const assigneeId =
				target.ownerId ?? (target.members.some((member) => member.userId === task.assigneeId) ? task.assigneeId : null);
			core.services.task.moveTask(moverId, ref.taskId, target.id, recipients(target, moverId, assigneeId));
		},
	});
}

function planRepeatDones(ref: Ref, from: number, repeatDays: number, limit: number): void {
	let at = from;
	for (let i = 0; i < limit; i++) {
		at += repeatDays * DAY * (0.7 + random() * 0.6);
		if (at >= now) return;
		planUpdate(ref, at, (task, space) => {
			if (task.closedAt !== null || task.repeatDays === null) return null;
			const patch: TaskPatch = { recordRepeatDone: true, dueDate: day(clock + task.repeatDays * DAY), notifyUserIds: [] };
			if (chance(0.2)) patch.comment = pick(DONE_COMMENTS);
			return { actorId: pick(writersOf(space)), patch };
		});
		if (chance(0.03)) planRemoveDone(ref, at + exponential(DAY));
	}
}

function planRemoveDone(ref: Ref, at: number): void {
	if (at >= now) return;
	plan.push({
		at,
		run: () => {
			const task = core.services.task.getTask(ref.taskId);
			const done = task.repeatDones[0];
			if (task.closedAt !== null || done === undefined) return;
			core.services.task.removeRepeatDone(done.actorId, ref.taskId, done.eventId);
		},
	});
}

function planTask(space: Space, theme: Theme, createdAt: number, taskCount: number): void {
	const known = knownLabels(space);
	const repeatDays = chance(0.06) ? pick([1, 2, 3, 7, 14, 30, 60, 90, 180, 365]) : null;
	const ref = planCreate(space, createdAt, () => {
		const authorId = pick(writersOf(space));
		const assigneeId = space.ownerId ?? (chance(0.7) ? pick(space.members).userId : null);
		const dueDate =
			repeatDays !== null ? day(createdAt + repeatDays * DAY) : chance(0.45) ? day(createdAt + pick(DUE_OFFSETS) * DAY) : null;
		const labels = chance(0.5) ? [] : chance(0.02) ? known : sample(known, 1 + Math.floor(random() * 3));
		return [
			authorId,
			{
				title: pickTitle(theme),
				body: pickBody(theme, taskCount),
				dueDate,
				assigneeId,
				labels,
				repeatDays,
				notifyUserIds: recipients(space, authorId, assigneeId),
			},
		];
	});
	const commentCount = weighted([
		[0, 50],
		[1, 25],
		[2, 12],
		[3, 6],
		[5, 4],
		[8, 2],
		[15, 1],
	]);
	for (let i = 0; i < commentCount; i++) planComment(ref, createdAt + exponential(3 * DAY));
	const editCount = weighted([
		[0, 55],
		[1, 30],
		[2, 15],
	]);
	for (let i = 0; i < editCount; i++) {
		const kind = pick(["title", "body", "due", "assignee", "labels"] as const);
		planUpdate(ref, createdAt + exponential(2 * DAY), (task, current) => {
			const actorId = pick(writersOf(current));
			const notifyUserIds = recipients(current, actorId, task.assigneeId);
			switch (kind) {
				case "title": {
					const title = pickTitle(theme);
					return title === task.title ? null : { actorId, patch: { title, notifyUserIds } };
				}
				case "body": {
					const body = pickBody(theme, taskCount);
					return body === task.body ? null : { actorId, patch: { body, notifyUserIds } };
				}
				case "due": {
					const dueDate = chance(0.2) ? null : day(clock + pick(DUE_OFFSETS) * DAY);
					return dueDate === task.dueDate ? null : { actorId, patch: { dueDate, notifyUserIds } };
				}
				case "assignee": {
					if (current.ownerId !== null) return null;
					const candidates = current.members.map((member) => member.userId).filter((id) => id !== task.assigneeId);
					const assigneeId = chance(0.15) || candidates.length === 0 ? null : pick(candidates);
					if (assigneeId === task.assigneeId) return null;
					return { actorId, patch: { assigneeId, notifyUserIds: recipients(current, actorId, assigneeId) } };
				}
				case "labels": {
					if (task.labels.length > 0 && chance(0.3)) {
						return { actorId, patch: { labels: { added: [], removed: [pick(task.labels)] }, notifyUserIds } };
					}
					const free = knownLabels(current).filter((name) => !task.labels.includes(name));
					return free.length === 0 ? null : { actorId, patch: { labels: { added: [pick(free)], removed: [] }, notifyUserIds } };
				}
			}
		});
	}
	if (repeatDays !== null) planRepeatDones(ref, createdAt, repeatDays, 60);
	// A routine ends rarely; a plain task closes in about ten days, and the old ones are nearly all closed.
	const closeAt = createdAt + exponential(repeatDays === null ? 10 * DAY : 120 * DAY);
	planClose(ref, closeAt);
	if (chance(0.06)) {
		const reopenAt = closeAt + exponential(3 * DAY);
		planUpdate(ref, reopenAt, (task, current) =>
			task.closedAt === null
				? null
				: { actorId: pick(writersOf(current)), patch: { closed: false, comment: "Reopened: not done yet.", notifyUserIds: [] } },
		);
		if (chance(0.6)) planClose(ref, reopenAt + exponential(5 * DAY));
	}
	if (chance(0.03)) planMove(ref, createdAt + exponential(3 * DAY));
}

for (let i = 0; i < preset.tasks; i++) {
	const { space, theme } = weighted(spaceWeights);
	planTask(space, theme, now - preset.rangeDays * DAY * random() ** preset.skew, i);
}

// Showcase: the edge cases a page must survive, all in Family, all recent.

const familySpace = core.services.space.findSpaceBySlug("family");
if (familySpace === null) throw new Error("No family space");
const anna = userId("anna");
const mark = userId("mark");
const familyTask = (at: number, input: Partial<NewTask> & { title: string }): Ref =>
	planCreate(familySpace, at, () => [
		anna,
		{ body: "", dueDate: null, assigneeId: null, labels: [], repeatDays: null, notifyUserIds: [], ...input },
	]);

familyTask(now - 1.5 * DAY, {
	title:
		"Call the insurance company about the claim for the water damage in the bathroom, ask for the case number and the name of the assessor, and whether the invoice from the plumber can still be added to the claim".slice(
			0,
			200,
		),
	assigneeId: mark,
	notifyUserIds: [mark],
});
familyTask(now - 1.2 * DAY, {
	title: "Every label at once",
	labels: knownLabels(familySpace),
	assigneeId: mark,
	dueDate: day(now),
});
familyTask(now - 1.1 * DAY, { title: "Kitchen renovation", body: LONG_BODY, assigneeId: anna, labels: ["urgent"] });
familyTask(now - DAY, {
	title: "🏡 Get the cabin ready for winter ❄️",
	body: "Drain the pipes, close the shutters, bring the tools home.\n\n- [ ] pipes\n- [ ] shutters\n- [ ] tools\n\n**Note:** the keys are at grandma's.",
	assigneeId: mark,
	dueDate: day(now + 5 * DAY),
	notifyUserIds: [mark],
});
familyTask(now - 0.9 * DAY, { title: "Renew passports", dueDate: "2024-03-01", labels: ["urgent"], assigneeId: anna });
familyTask(now - 0.8 * DAY, { title: "Leo's graduation gift", dueDate: "2031-06-15", assigneeId: anna });
familyTask(now - 0.7 * DAY, { title: "Untitled chores" });
familyTask(now - 0.5 * DAY, {
	title: "Change the admin password",
	assigneeId: userId("admin"),
	notifyUserIds: [userId("admin")],
	dueDate: day(now),
});
const busy = familyTask(now - 2 * DAY, {
	title: "Where do we go this summer?",
	body: "Ideas below, one per comment.",
	assigneeId: anna,
});
for (let i = 1; i <= 100; i++) planComment(busy, now - 2 * DAY + (i * 2 * DAY) / 101, `Idea ${i}: ${pick(TITLES.trip)}`);
const routineStart = Math.max(start, now - 60 * DAY);
const routine = familyTask(routineStart, {
	title: "Feed the cat",
	repeatDays: 1,
	dueDate: day(routineStart + DAY),
	assigneeId: userId("leo"),
});
planRepeatDones(routine, routineStart, 1, 60);

// Run.

plan.sort((a, b) => a.at - b.at);
console.log(`Planned ${plan.length} writes over ${preset.rangeDays} days`);
const started = performance.now();
const BATCH = 2000;
for (let i = 0; i < plan.length; i += BATCH) {
	core.db.transaction(() => {
		for (const write of plan.slice(i, i + BATCH)) {
			clock = write.at;
			write.run();
		}
	})();
	if ((i / BATCH) % 10 === 9) console.log(`${Math.min(i + BATCH, plan.length)} / ${plan.length}`);
}
clock = now;

const counts = z.object({ tasks: z.int(), open: z.int(), events: z.int(), comments: z.int(), notifications: z.int() }).parse(
	core.db
		.query(
			`SELECT (SELECT count(*) FROM tasks) AS tasks, (SELECT count(*) FROM tasks WHERE closed_at IS NULL) AS open,
				(SELECT count(*) FROM task_events) AS events, (SELECT count(*) FROM comments) AS comments,
				(SELECT count(*) FROM notifications) AS notifications`,
		)
		.get(),
);
core.close();
console.log(`${dbPath}: ${JSON.stringify(counts)} in ${Math.round((performance.now() - started) / 1000)}s`);
console.log("Users: admin/admin, and every other user's password is their username: anna, mark, tom, ...");
