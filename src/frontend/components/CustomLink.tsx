import { Anchor, type AnchorProps } from "@mantine/core";
import { createLink, type LinkComponent } from "@tanstack/react-router";
import type { Ref } from "react";

type MantineAnchorProps = Omit<AnchorProps, "href"> & { ref?: Ref<HTMLAnchorElement> };

const MantineAnchor = (props: MantineAnchorProps) => <Anchor {...props} />;

const CreatedLink = createLink(MantineAnchor);

/** A router `Link` with Mantine `Anchor` props; `to` and `params` are typed against the route tree. */
export const CustomLink: LinkComponent<typeof MantineAnchor> = (props) => (
	<CreatedLink underline="never" c="inherit" {...props} />
);
