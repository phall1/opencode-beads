import { Effect } from "effect";
import type { Plugin } from "@opencode/plugin/effect";
import { FinishReceipt } from "./intelligence-schema";
import { BeadsError } from "../beads/process";
import { storageCall } from "./storage";

export function finishStore(
  storage: Plugin.Context["storage"],
  location: { directory: string; workspaceID?: string },
) {
  const identity = encodeURIComponent(
    JSON.stringify([location.directory, location.workspaceID ?? null]),
  );
  const key = (sessionID: string, id: string) =>
    `finish/v1/${sessionID}/${identity}/${id}`;
  return {
    loadReceipt: Effect.fn("FinishStore.load")(function* (
      sessionID: string,
      id: string,
    ) {
      const value = yield* storageCall(
        "read finish receipt",
        storage.get(key(sessionID, id)),
      );
      if (value === undefined) return null;
      const decoded = FinishReceipt.safeParse(value);
      if (!decoded.success)
        return yield* Effect.fail(
          new BeadsError(
            "handoff_failed",
            "Saved completion could not be decoded. It was preserved.",
          ),
        );
      const receipt = decoded.data;
      if (
        receipt.sessionID !== sessionID ||
        receipt.id !== id ||
        receipt.directory !== location.directory ||
        receipt.workspaceID !== (location.workspaceID ?? null)
      )
        return yield* Effect.fail(
          new BeadsError(
            "handoff_failed",
            "Saved completion identity does not match this session and location.",
          ),
        );
      return receipt;
    }),
    saveReceipt: (receipt: FinishReceipt) =>
      storageCall(
        "save finish receipt",
        storage.set(key(receipt.sessionID, receipt.id), receipt),
      ),
  };
}
