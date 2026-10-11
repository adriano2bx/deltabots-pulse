import { z } from 'zod';
import { Id, IsoDateTime } from './common';

export const OrgRole = z.enum(['owner', 'org_admin', 'developer', 'member', 'operator']);
export type OrgRole = z.infer<typeof OrgRole>;

export const Organization = z.object({
  id: Id,
  name: z.string(),
  plan_id: z.string(),
  status: z.string(),
  role: OrgRole,
  created_at: IsoDateTime,
});
export const CreateOrganizationRequest = z.strictObject({ name: z.string().trim().min(2).max(80) });
export const InviteMemberRequest = z.strictObject({ email: z.email(), role: OrgRole.exclude(['owner']) });
export const Member = z.object({
  id: Id,
  user_id: Id,
  display_name: z.string().nullable(),
  role: OrgRole,
  status: z.string(),
  created_at: IsoDateTime,
});
