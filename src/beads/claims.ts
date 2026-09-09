import { Effect } from "effect";
import { z } from "zod";
import { IssueID } from "./schema";
import { BeadsError, runBeads, type ProcessOptions } from "./process";

const Actor = z
  .string()
  .min(1)
  .max(255)
  .regex(/^[a-zA-Z0-9:_-]+$/);

/** These operations mutate Beads. A cancelled/failed write may have committed. */
export function createClaims(options: ProcessOptions) {
  function execute(command: "update" | "heartbeat", id: string, actor: string) {
    return Effect.tryPromise({
      try: async (signal) => {
        const validID = IssueID.parse(id);
        const validActor = Actor.parse(actor);
        const args = [
          command,
          validID,
          "--actor",
          validActor,
          "--json",
          "--sandbox",
          "--no-color",
        ];
        if (command === "update") args.push("--claim");
        await runBeads(options, args, signal);
      },
      catch: (error) => {
        if (error instanceof BeadsError) return error;
        return new BeadsError(
          "invalid_input",
          "Invalid bead ID or claim actor.",
        );
      },
    });
  }
  return {
    claim: (id: string, actor: string) => execute("update", id, actor),
    heartbeat: (id: string, actor: string) => execute("heartbeat", id, actor),
  };
}
