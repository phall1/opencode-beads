import { z } from "zod";
import { Issue, IssueID } from "../beads/schema";
import { SessionQuery } from "./schema";

export const BriefQuery = SessionQuery;
export const WorkBrief = z.object({
  directory: z.string(),
  fetchedAt: z.string(),
  text: z.string(),
  bytes: z.number().int(),
  activeIDs: IssueID.array(),
  omitted: z.number().int(),
  warnings: z.string().array(),
});
export type WorkBrief = z.infer<typeof WorkBrief>;

export const Evidence = z.object({
  summary: z.string().trim().min(1).max(2000),
  validation: z.string().trim().min(1).max(4000),
  artifacts: z.string().trim().max(2000).default(""),
});
export type Evidence = z.infer<typeof Evidence>;
export const FinishQuery = SessionQuery.extend({
  id: IssueID,
  evidence: Evidence,
});
export type FinishQuery = z.infer<typeof FinishQuery>;
export const FinishResult = z.object({
  issue: Issue,
  evidence: Evidence,
  newlyReady: Issue.array(),
  warnings: z.string().array(),
});
export type FinishResult = z.infer<typeof FinishResult>;
export const FinishReceipt = z.object({
  id: IssueID,
  sessionID: z.string(),
  directory: z.string(),
  workspaceID: z.string().nullable(),
  actor: z.string(),
  promptID: z.string(),
  evidence: Evidence,
  reason: z.string(),
  readyBefore: IssueID.array(),
  phase: z.enum(["prepared", "closed"]),
});
export type FinishReceipt = z.infer<typeof FinishReceipt>;
