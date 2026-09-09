import type { Context } from "@opencode/plugin/tui/context";

export const workbenchName = "beads.workbench";

export function toggleWorkbench(context: Context) {
  const route = context.ui.router.current();
  if (route.type === "plugin" && route.name === workbenchName) {
    context.ui.router.navigate({ type: "home" });
    return;
  }
  const panel = context.ui.panel.current();
  if (
    route.type === "session" &&
    panel?.name === workbenchName &&
    panel.sessionID === route.sessionID
  ) {
    context.ui.panel.close();
    return;
  }
  if (context.ui.panel.open(workbenchName)) return;
  context.ui.router.navigate({ type: "plugin", name: workbenchName });
}
