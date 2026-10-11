import { z } from 'zod';
import { Id, IsoDateTime } from './common';

export const ChatRequest = z.strictObject({
  message: z.string().trim().min(1).max(2000),
  conversation_id: Id.optional(),
});
export const ToolProposal = z.object({
  tool: z.string(),
  arguments: z.record(z.string(), z.unknown()),
  requires_confirmation: z.boolean(),
  policy_decision: z.enum(['allowed', 'needs_confirmation', 'denied']),
  reason: z.string(),
});
export const ChatResponse = z.object({
  conversation_id: Id,
  reply: z.string(),
  sources: z.array(z.string()),
  tool_proposals: z.array(ToolProposal),
  model_version: z.string(),
  degraded: z.boolean(),
});

export const Insight = z.object({
  id: Id,
  kind: z.string(),
  model_version: z.string(),
  input_window: z.object({ from: IsoDateTime, to: IsoDateTime, kinds: z.array(z.string()) }),
  confidence: z.number().min(0).max(1),
  quality: z.string(),
  quality_flags: z.array(z.string()),
  explanation: z.string(),
  sources: z.array(z.string()),
  generated_at: IsoDateTime,
});
export type Insight = z.infer<typeof Insight>;

export const InsightFeedbackRequest = z.strictObject({
  insight_id: Id,
  feedback: z.enum(['useful', 'not_useful', 'incorrect']),
  comment: z.string().max(500).optional(),
});
