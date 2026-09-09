import { Plugin } from "@opencode/plugin/tui";
import type { Context, PanelInput } from "@opencode/plugin/tui/context";
import { Show, createMemo, createResource } from "solid-js";
import { Beads } from "./rpc";
import { WorkbenchView } from "./src/workbench/view";
import { beadEntry } from "./src/workbench/context";
import { errorMessage } from "./src/text";
import { toggleWorkbench } from "./src/workbench/navigation";

function connection(
  context: Context,
  location = context.location ?? context.data.location.default(),
) {
  const rpc = context.client.rpc(Beads);
  return {
    location,
    directory: location.directory,
    reader: {
      list: (query: Parameters<typeof rpc.list>[0], signal: AbortSignal) =>
        rpc.list(query, { location, signal }),
      show: (id: string, signal: AbortSignal) =>
        rpc.show({ id }, { location, signal }),
      graph: (id: string, signal: AbortSignal) =>
        rpc.graph({ id, limit: 30 }, { location, signal }),
    },
  };
}

function SessionWorkbench(props: { context: Context; panel: PanelInput }) {
  const context = props.context;
  const [synced, { refetch }] = createResource(
    () => props.panel.sessionID,
    (sessionID) => context.data.session.sync(sessionID),
  );
  const location = createMemo(
    () => context.data.session.get(props.panel.sessionID)?.location,
  );
  const key = () => {
    const value = location();
    return value
      ? JSON.stringify([
          props.panel.sessionID,
          value.directory,
          value.workspaceID,
        ])
      : undefined;
  };
  context.keymap.layer(() => ({
    enabled: () => props.panel.focused && !location(),
    commands: [
      {
        bind: "r",
        run: () => {
          void refetch();
        },
      },
      { bind: "escape", run: props.panel.close },
    ],
  }));
  return (
    <Show
      when={key()}
      keyed
      fallback={
        <text fg={context.theme.text.subdued}>
          {synced.error
            ? `${errorMessage(synced.error)} Press r to retry.`
            : "Loading session workspace…"}
        </text>
      }
    >
      {(_key) => {
        const connected = connection(context, location()!);
        const sessionID = props.panel.sessionID;
        const rpc = context.client.rpc(Beads);
        return (
          <WorkbenchView
            context={context}
            {...connected}
            focused={props.panel.focused}
            conversationAvailable={props.panel.presentation === "panel"}
            close={props.panel.close}
            fullscreen={
              props.panel.presentation === "fullscreen" &&
              props.panel.width <= 80
                ? undefined
                : props.panel.toggleFullscreen
            }
            work={{
              links: (signal) =>
                rpc.links(
                  { sessionID },
                  { location: connected.location, signal },
                ),
              start: (id, signal) =>
                rpc.start(
                  { id, sessionID },
                  { location: connected.location, signal },
                ),
              brief: (signal) =>
                rpc.context(
                  { sessionID },
                  { location: connected.location, signal },
                ),
              finish: (id, evidence, signal) =>
                rpc.finish(
                  { id, sessionID, evidence },
                  { location: connected.location, signal },
                ),
            }}
            attach={async (issue) => {
              const entry = await beadEntry(issue, connected.location);
              const current = await context.client.session.get({ sessionID });
              if (
                current.location.directory !== connected.directory ||
                current.location.workspaceID !== connected.location.workspaceID
              )
                throw new Error(
                  "Session workspace changed. Reopen Beads before adding context.",
                );
              await context.client.session.instructions.entry.put({
                sessionID,
                ...entry,
              });
            }}
          />
        );
      }}
    </Show>
  );
}

export default Plugin.define({
  id: "beads.tui",
  setup(context) {
    const page = context.ui.router.register({
      name: "beads.workbench",
      render: () => (
        <WorkbenchView
          context={context}
          {...connection(context)}
          focused={true}
          close={() => context.ui.router.navigate({ type: "home" })}
        />
      ),
    });
    const panel = context.ui.slot({
      append: "session.panel",
      render: (panel) => (
        <Show when={panel.name === "beads.workbench"}>
          <SessionWorkbench context={context} panel={panel} />
        </Show>
      ),
    });
    const commands = context.ui.slot({
      append: "app",
      render: () => {
        context.keymap.layer(() => ({
          mode: "global",
          commands: [
            {
              id: "beads.workbench",
              title: "Toggle Beads workbench",
              group: "Beads",
              palette: true,
              slash: { name: "beads" },
              suggested: true,
              run: () => toggleWorkbench(context),
            },
          ],
        }));
        return null;
      },
    });
    return () => {
      commands();
      panel();
      page();
    };
  },
});
