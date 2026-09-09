import { onCleanup } from "solid-js";
import type { MouseEvent } from "@opentui/core";

// Let the host acquire pane ownership before a click unmounts its own target.
export function afterMouseDispatch(run: () => unknown) {
  let disposed = false;
  onCleanup(() => {
    disposed = true;
  });
  return (event: MouseEvent) => {
    if (event.button !== 0) return;
    queueMicrotask(() => {
      if (!disposed) void run();
    });
  };
}
