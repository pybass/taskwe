import { z } from "zod";

/** A JSON column as text, to pipe into the schema of its content: `jsonText.pipe(z.array(Thing))`. */
export const jsonText = z.string().transform((json): unknown => JSON.parse(json));
