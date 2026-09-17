import { createLink, type LinkComponent } from "@tanstack/react-router";
import type { ComponentProps, ReactNode } from "react";
import "./tab-link.css";

// The router marks a link active when its search is a subset of the URL's, which the default tab's always is, stripped
// of its defaults; so the tab takes `current` from the page and drops the router's marks.
const TabAnchor = ({
	current,
	"aria-current": _ariaCurrent,
	"data-status": _dataStatus,
	...props
}: ComponentProps<"a"> & { current: boolean; "data-status"?: string }) => (
	<a {...props} className="tab" data-current={current ? "" : undefined} />
);

/** One tab of a `.tab-bar`, a link; the page says which is current. `to` and `params` are typed against the route tree. */
export const TabLink: LinkComponent<typeof TabAnchor> = createLink(TabAnchor);

/** The figure after a tab's name. */
export function TabCount({ children }: { children: ReactNode }) {
	return <span className="tab-count">{children}</span>;
}
