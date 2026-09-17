import { type ComboboxItem, MultiSelect, type MultiSelectProps, Pill, Select, type SelectProps } from "@mantine/core";
import type { User } from "#shared/user.ts";
import { Username } from "@/components/Username.tsx";

type Props<P> = Omit<P, "data" | "renderOption"> & {
	/** The users to offer, in the order shown; a value is the user's id as a string. */
	users: User[];
	/** Entries before the users, such as "Me" or "Unassigned", shown as plain text; their values must not repeat a user's id. */
	before?: ComboboxItem[];
};

function toData(users: User[], before: ComboboxItem[]): ComboboxItem[] {
	return [...before, ...users.map((user) => ({ value: String(user.id), label: user.username }))];
}

/** A user picker: each option is the `Username` mark. The closed field shows the bare name, as Mantine's Select does. */
export function UserSelect({ users, before = [], ...props }: Props<SelectProps>) {
	return (
		<Select
			data={toData(users, before)}
			searchable
			renderOption={({ option }) => <UserOption users={users} value={option.value} label={option.label} />}
			{...props}
		/>
	);
}

/** A picker of several users: each option and each chosen pill is the `Username` mark. */
export function UserMultiSelect({ users, ...props }: Omit<Props<MultiSelectProps>, "renderPill" | "before">) {
	return (
		<MultiSelect
			data={toData(users, [])}
			searchable
			renderOption={({ option }) => <UserOption users={users} value={option.value} label={option.label} />}
			renderPill={({ option, onRemove, disabled }) => (
				<Pill withRemoveButton={!props.readOnly} onRemove={onRemove} disabled={disabled}>
					<UserOption users={users} value={String(option.value)} label={option.label} />
				</Pill>
			)}
			{...props}
		/>
	);
}

function UserOption({ users, value, label }: { users: User[]; value: string; label: string }) {
	const user = users.find((user) => String(user.id) === value);
	return user === undefined ? <span>{label}</span> : <Username userId={user.id} />;
}
