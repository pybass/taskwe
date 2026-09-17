// Reference file: the primitives every model is built from, and the conventions that hold for every field.

import { z } from "zod";

// - Columns are snake_case in SQLite and camelCase in the API; the schemas name the API side.
// - Format and length rules are checked by the application with these schemas, not by the database. A row read from
//   SQLite is parsed with the same schemas, so a value that leaves core has passed them.
// - A limit counts characters of the trimmed text where a field says it is trimmed.

/**
 * An id: the INTEGER PRIMARY KEY of a row, never reused after a delete. Ids are the keys in the API too. Guessable ids
 * are fine: access is decided by membership, never by secrecy.
 * The field `id` exists only on an object that is a row of its table, in full or picked: `Task`, `Space`, `User`...
 * Every other field, parameter, or variable holding an id is named after its entity: `taskId`, `spaceId`, never a
 * bare `id`. So an object that is not a row, such as a change in an event, says which table its id names.
 */
export const Id = z.int();

/** ISO 8601 in UTC, set by the server. */
export const Timestamp = z.iso.datetime();

/** A calendar day, "YYYY-MM-DD", with no time zone: the same day for every viewer. Chosen by the user, never computed by the server. */
export const Day = z.iso.date();

/**
 * One rule for a username and a space slug, since they share a namespace: every username is also the slug of its
 * user's personal space. Trimmed; 1–32 characters of lowercase letters and digits, with single hyphens between them,
 * as in `alice-smith`. A shared space's slug never changes; a username changes only when an admin renames the user,
 * and the personal space's slug follows it.
 */
export const Slug = z
	.string()
	.trim()
	.min(1)
	.max(32)
	.regex(/^[a-z0-9]+(-[a-z0-9]+)*$/);
