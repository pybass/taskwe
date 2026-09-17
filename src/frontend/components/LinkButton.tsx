import { Button, type ButtonProps } from "@mantine/core";
import { createLink, type LinkComponent } from "@tanstack/react-router";
import type { Ref } from "react";

type MantineButtonProps = Omit<ButtonProps, "component"> & { ref?: Ref<HTMLAnchorElement> };

const MantineButton = (props: MantineButtonProps) => <Button component="a" {...props} />;

const CreatedLinkButton = createLink(MantineButton);

/** A router `Link` that looks like a Mantine `Button`; `to` and `params` are typed against the route tree. */
export const LinkButton: LinkComponent<typeof MantineButton> = (props) => <CreatedLinkButton {...props} />;
