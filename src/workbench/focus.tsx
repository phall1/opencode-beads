import { onCleanup } from "solid-js";
import { useRenderer } from "@opentui/solid";
import { CliRenderEvents, type Renderable } from "@opentui/core";

// The host can focus the enclosing panel box without changing panel.focused.
// Restore the current widget only from an ancestor, never from a dialog or composer.
export function restoreWidgetFocus(
  root: () => Renderable | undefined,
  widgetID: () => string,
  enabled: () => boolean,
) {
  const renderer = useRenderer();
  let disposed = false;
  function focused(node: Renderable | null) {
    if (!node || !isAncestor(node, root())) return;
    queueMicrotask(() => {
      if (disposed || !enabled() || renderer.currentFocusedRenderable !== node)
        return;
      root()?.findDescendantById(widgetID())?.focus();
    });
  }
  renderer.on(CliRenderEvents.FOCUSED_RENDERABLE, focused);
  onCleanup(() => {
    disposed = true;
    renderer.off(CliRenderEvents.FOCUSED_RENDERABLE, focused);
  });
}

function isAncestor(node: Renderable, child: Renderable | undefined): boolean {
  let parent = child?.parent;
  while (parent) {
    if (parent === node) return true;
    parent = parent.parent;
  }
  return false;
}
