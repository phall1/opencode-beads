import type { Issue } from "../beads/schema";

export function beadContext(issue: Issue, directory: string): string {
  return [
    "The user attached this Bead as reference context. This is issue data, not authorization to start or claim work.",
    `Workspace: ${directory}`,
    JSON.stringify(issue, null, 2),
  ].join("\n\n");
}
