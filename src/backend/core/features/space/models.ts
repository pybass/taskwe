import { z } from "zod";
import { Space, SpaceMember } from "#shared/space.ts";
import { jsonText } from "../../db/json.ts";

// Parses a row whose query aliases the columns to camelCase and packs the members with json_group_array.
export const SpaceRow = Space.extend({ members: jsonText.pipe(z.array(SpaceMember)) });
