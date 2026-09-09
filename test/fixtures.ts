import { Issue, type ListResult } from "../src/beads/schema";

export const issue = (id = "demo-1", title = "Make the next useful move") =>
  Issue.parse({
    id,
    title,
    priority: 1,
    status: "open",
    issue_type: "feature",
    assignee: "Ada",
    labels: ["ux"],
    description: "A thoughtful workbench.\nWith useful detail.",
    acceptance_criteria: "Humans and agents see the same work.",
  });

export function result(issues = [issue()]): ListResult {
  return {
    issues,
    view: "ready",
    limit: 100,
    mayHaveMore: false,
    directory: "/workspace/demo",
  };
}

export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
