import { z } from "zod";
import { Issue, IssueID } from "./schema";

export const GraphQuery = z.object({
  id: IssueID,
  limit: z.number().int().min(1).max(100).default(30),
});
export type GraphQuery = z.infer<typeof GraphQuery>;
export const Relation = z.object({
  id: z.string(),
  title: z.string(),
  status: z.string(),
  type: z.string(),
  metadata: z.string().optional(),
  available: z.boolean(),
  canInspect: z.boolean(),
});
export type Relation = z.infer<typeof Relation>;
export const Neighborhood = z.object({
  id: IssueID,
  directory: z.string(),
  fetchedAt: z.string(),
  dependencies: Relation.array(),
  dependents: Relation.array(),
  truncated: z.boolean(),
  scope: z.string(),
});
export type Neighborhood = z.infer<typeof Neighborhood>;
export const NextQuery = z.object({
  limit: z.number().int().min(1).max(5).default(3),
});
export type NextQuery = z.infer<typeof NextQuery>;
export const Recommendations = z.object({
  directory: z.string(),
  fetchedAt: z.string(),
  readyCount: z.number().int(),
  considered: z.number().int(),
  items: z.array(z.object({ issue: Issue, reasons: z.string().array() })),
  warnings: z.string().array(),
});
export type Recommendations = z.infer<typeof Recommendations>;
