import { z } from "zod";
import { Issue, IssueID } from "../beads/schema";

export const SessionID = z.string().startsWith("ses").min(4).max(128);
export const SessionQuery = z.object({ sessionID: SessionID });
export const StartQuery = SessionQuery.extend({ id: IssueID });
export type StartQuery = z.infer<typeof StartQuery>;

export const StoredWorkLink = z.object({
  id: IssueID,
  sessionID: SessionID,
  directory: z.string(),
  workspaceID: z.string().nullable().default(null),
  actor: z.string(),
  promptID: z.string(),
  prompt: z.string(),
  phase: z.enum(["claim_pending", "claimed", "started"]),
});
export type StoredWorkLink = z.infer<typeof StoredWorkLink>;
export const WorkLink = StoredWorkLink.omit({ promptID: true, prompt: true });
export type WorkLink = z.infer<typeof WorkLink>;
export const WorkResult = z.object({ issue: Issue, link: WorkLink });
export type WorkResult = z.infer<typeof WorkResult>;
