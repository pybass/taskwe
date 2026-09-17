import { z } from "zod";
import { User } from "#shared/user.ts";

// Parses a row whose query aliases the columns to camelCase; SQLite stores the admin flag as 0 or 1.
export const UserRow = User.extend({ admin: z.literal([0, 1]).transform((flag) => flag === 1) });
