import { z } from "zod";

export const View = z.enum(["ready", "in_progress", "open"]);
export type View = z.infer<typeof View>;

export const ListQuery = z.object({
  view: View.default("ready"),
  limit: z.number().int().min(1).max(200).default(100),
});
export type ListQuery = z.infer<typeof ListQuery>;

export const IssueID = z
  .string()
  .min(1)
  .max(256)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/);
export const ShowQuery = z.object({ id: IssueID });

export const Issue = z.object({
  id: IssueID,
  title: z.string(),
  priority: z.number().int().min(0).max(4),
  status: z.string().default("unknown"),
  issue_type: z.string().default("issue"),
  assignee: z.string().default(""),
  labels: z
    .array(z.string())
    .nullish()
    .transform((value) => value ?? []),
  description: z.string().default(""),
  design: z.string().default(""),
  acceptance_criteria: z.string().default(""),
  notes: z.string().default(""),
  dependencies: z
    .array(
      z.object({
        depends_on_id: z.string(),
        type: z.string(),
      }),
    )
    .nullish()
    .transform((value) => value ?? []),
});
export type Issue = z.infer<typeof Issue>;

export const ListResult = z.object({
  issues: z.array(Issue),
  view: View,
  limit: z.number().int(),
  mayHaveMore: z.boolean(),
  directory: z.string(),
});
export type ListResult = z.infer<typeof ListResult>;

export const Failure = z.object({ code: z.string() });
