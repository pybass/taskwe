import { ActionIcon, type ActionIconProps } from "@mantine/core";
import { createLink, type LinkComponent } from "@tanstack/react-router";
import type { Ref } from "react";

type MantineActionIconProps = Omit<ActionIconProps, "component"> & { ref?: Ref<HTMLAnchorElement> };

const MantineActionIcon = (props: MantineActionIconProps) => <ActionIcon component="a" {...props} />;

const CreatedLinkActionIcon = createLink(MantineActionIcon);

/** A router `Link` that looks like a Mantine `ActionIcon`, made like `LinkButton`. */
export const LinkActionIcon: LinkComponent<typeof MantineActionIcon> = (props) => <CreatedLinkActionIcon {...props} />;
