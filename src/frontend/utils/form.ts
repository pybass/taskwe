import type { z } from "zod";

/** A `validate` for `useForm`: the zod issues keyed by field path, or an empty object when the values pass. */
export function zodResolver(schema: z.ZodType) {
	return (values: unknown): Record<string, string> => {
		const result = schema.safeParse(values);
		if (result.success) return {};
		return Object.fromEntries(result.error.issues.map((issue) => [issue.path.join("."), issue.message]));
	};
}
