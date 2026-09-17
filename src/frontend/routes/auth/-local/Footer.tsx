import { Divider, Text } from "@mantine/core";
import pkg from "../../../../../package.json";

export function Footer() {
	// "UTC+3", "UTC-5", "UTC+5.5": tells the user which zone the dates on the page are in.
	const offsetHours = -new Date().getTimezoneOffset() / 60;
	return (
		<footer>
			<Divider my="md" />
			<Text size="sm" c="dimmed" pb="md">
				taskwe v{pkg.version} · UTC{offsetHours >= 0 ? "+" : ""}
				{offsetHours}
			</Text>
		</footer>
	);
}
