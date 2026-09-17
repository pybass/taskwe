import { ActionIcon, Box, Group, Input, Paper, SegmentedControl, Textarea, Tooltip } from "@mantine/core";
import type { GetInputPropsReturnType } from "@mantine/form";
import {
	IconBold,
	IconCode,
	IconHeading,
	IconItalic,
	IconLink,
	IconList,
	IconListCheck,
	IconListNumbers,
} from "@tabler/icons-react";
import { useId, useRef, useState } from "react";
import { Markdown } from "./Markdown.tsx";

// A toolbar button either wraps the selection in `wrap` or puts `linePrefix` at the start of every selected line.
type Action = {
	label: string;
	icon: typeof IconBold;
	wrap?: [string, string];
	linePrefix?: string;
};

const ACTIONS: Action[] = [
	{ label: "Heading", icon: IconHeading, linePrefix: "## " },
	{ label: "Bold", icon: IconBold, wrap: ["**", "**"] },
	{ label: "Italic", icon: IconItalic, wrap: ["_", "_"] },
	{ label: "Code", icon: IconCode, wrap: ["`", "`"] },
	{ label: "Link", icon: IconLink, wrap: ["[", "](url)"] },
	{ label: "Bullet list", icon: IconList, linePrefix: "- " },
	{ label: "Numbered list", icon: IconListNumbers, linePrefix: "1. " },
	{ label: "Task list", icon: IconListCheck, linePrefix: "- [ ] " },
];

/** The text after `action` on the textarea's selection, and where the selection lands so typing continues naturally. */
function applyAction(textarea: HTMLTextAreaElement, action: Action): { value: string; start: number; end: number } {
	const { value, selectionStart: start, selectionEnd: end } = textarea;
	if (action.wrap !== undefined) {
		const [open, close] = action.wrap;
		return {
			value: value.slice(0, start) + open + value.slice(start, end) + close + value.slice(end),
			start: start + open.length,
			end: end + open.length,
		};
	}
	const prefix = action.linePrefix ?? "";
	const lineStart = value.lastIndexOf("\n", start - 1) + 1;
	// A selection that ends right after a new line does not include the line below it.
	const lineEnd = end > start && value[end - 1] === "\n" ? end - 1 : end;
	const lines = value.slice(lineStart, lineEnd).split("\n");
	const prefixed = lines.map((line) => prefix + line).join("\n");
	return {
		value: value.slice(0, lineStart) + prefixed + value.slice(lineEnd),
		start: start + prefix.length,
		end: end + prefix.length * lines.length,
	};
}

type Props = {
	label?: string;
	placeholder?: string;
	minRows?: number;
	autoFocus?: boolean;
} & GetInputPropsReturnType;

/**
 * A markdown textarea with a Write/Preview switch and a toolbar that inserts markdown at the cursor. Spread
 * `form.getInputProps(field)` from an uncontrolled form on it: the textarea owns its text, and the form hears every
 * change. The textarea stays mounted behind the preview, so the cursor survives a switch. An empty, unfocused editor
 * shows only the textarea: the chrome appears when writing starts.
 */
export function MarkdownEditor({
	label,
	placeholder,
	minRows = 4,
	autoFocus,
	defaultValue,
	onChange,
	onBlur,
	onFocus,
	error,
}: Props) {
	const id = useId();
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const [mode, setMode] = useState<"write" | "preview">("write");
	const [preview, setPreview] = useState("");
	const [focused, setFocused] = useState(false);
	const [hasText, setHasText] = useState(typeof defaultValue === "string" && defaultValue !== "");
	const active = focused || hasText || mode === "preview";
	const run = (action: Action) => {
		const textarea = textareaRef.current;
		if (textarea === null) return;
		const next = applyAction(textarea, action);
		textarea.value = next.value;
		textarea.setSelectionRange(next.start, next.end);
		textarea.focus();
		setHasText(next.value !== "");
		onChange(next.value);
	};
	const switchMode = (value: string) => {
		if (value === "preview") setPreview(textareaRef.current?.value ?? "");
		setMode(value === "preview" ? "preview" : "write");
	};
	return (
		<Input.Wrapper id={id} label={label} error={error}>
			{/* The mouse-down guard keeps the focus and the selection in the textarea, so a click here does not hide the bar. */}
			{active && (
				<Group justify="space-between" mb={4} onMouseDown={(event) => event.preventDefault()}>
					<SegmentedControl
						size="xs"
						value={mode}
						onChange={switchMode}
						data={[
							{ value: "write", label: "Write" },
							{ value: "preview", label: "Preview" },
						]}
					/>
					<ActionIcon.Group>
						{ACTIONS.map((action) => (
							<Tooltip key={action.label} label={action.label} openDelay={500}>
								<ActionIcon variant="default" disabled={mode === "preview"} onClick={() => run(action)}>
									<action.icon size={16} />
								</ActionIcon>
							</Tooltip>
						))}
					</ActionIcon.Group>
				</Group>
			)}
			<Box hidden={mode === "preview"}>
				<Textarea
					id={id}
					ref={textareaRef}
					placeholder={placeholder}
					autosize
					minRows={minRows}
					autoFocus={autoFocus}
					defaultValue={defaultValue}
					onChange={(event) => {
						setHasText(event.currentTarget.value !== "");
						onChange(event);
					}}
					onBlur={(event) => {
						setFocused(false);
						onBlur?.(event);
					}}
					onFocus={(event) => {
						setFocused(true);
						onFocus?.(event);
					}}
					error={error !== undefined && error !== null && error !== false}
				/>
			</Box>
			{mode === "preview" && (
				<Paper withBorder p="sm" mih={`calc(${minRows} * var(--mantine-line-height) * 1em + 2 * var(--mantine-spacing-sm))`}>
					{preview.trim() === "" ? <Input.Placeholder>Nothing to preview</Input.Placeholder> : <Markdown>{preview}</Markdown>}
				</Paper>
			)}
		</Input.Wrapper>
	);
}
