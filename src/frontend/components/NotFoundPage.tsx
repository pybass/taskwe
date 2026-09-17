import { Center, Stack, Text, Title } from "@mantine/core";
import { LinkButton } from "./LinkButton.tsx";

export function NotFoundPage() {
	return (
		<Center h="100vh">
			<Stack align="center">
				<Title order={2}>Page not found</Title>
				<Text c="dimmed">There is nothing at this address.</Text>
				<LinkButton to="/" variant="light">
					Go to the home page
				</LinkButton>
			</Stack>
		</Center>
	);
}
