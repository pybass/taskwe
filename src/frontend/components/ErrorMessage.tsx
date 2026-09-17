import { Alert } from "@mantine/core";

/** Renders nothing without an error, so a form can place it unconditionally. */
export function ErrorMessage({ error }: { error: Error | null }) {
	return error === null ? null : <Alert color="red">{error.message}</Alert>;
}
