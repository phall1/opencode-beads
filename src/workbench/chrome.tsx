import { Show } from "solid-js";
import type { Context } from "@opencode/plugin/tui/context";
import { displayText } from "../text";
import { Action } from "./action";

export function WorkbenchHeader(props: {
  context: Context;
  directory: string;
  focused: boolean;
  close(): void;
  fullscreen?: () => void;
}) {
  const theme = props.context.theme;
  return (
    <box flexDirection="column" flexShrink={0} marginBottom={1}>
      <box flexDirection="row" justifyContent="space-between" height={1}>
        <text id="beads-heading" fg={theme.text.status.running}>
          <b>Beads</b>
        </text>
        <box flexDirection="row" gap={1}>
          <Show when={props.fullscreen}>
            {(fullscreen) => (
              <Action
                context={props.context}
                id="beads-fullscreen"
                label="f Resize"
                run={fullscreen()}
              />
            )}
          </Show>
          <Action
            context={props.context}
            id="beads-close"
            label="× Close"
            run={props.close}
          />
        </box>
      </box>
      <text fg={theme.text.subdued} height={1} wrapMode="none">
        {displayText(shortPath(props.context.ui.format.path(props.directory)))}
      </text>
      <text fg={theme.text.subdued} height={1}>
        {focusHint(props.context, props.focused, Boolean(props.fullscreen))}
      </text>
    </box>
  );
}

function shortPath(path: string) {
  if (path.length <= 48) return path;
  return `…${path.slice(-45)}`;
}

function focusHint(context: Context, focused: boolean, split: boolean) {
  if (!focused) return "Click here to focus Beads";
  const shortcuts = context.keymap.shortcuts("pane.focus.left");
  if (split && shortcuts.length)
    return `Keyboard in Beads · ${shortcuts[0]} conversation`;
  return "Keyboard in Beads";
}

export function WorkbenchFooter(props: {
  context: Context;
  inspecting: boolean;
  searching: boolean;
  back(): void;
  refresh(): unknown;
  attach?: () => unknown;
  attaching: boolean;
}) {
  return (
    <box flexDirection="column" flexShrink={0} marginTop={1} gap={1}>
      <box flexDirection="row" gap={1}>
        <Show when={props.inspecting}>
          <Action
            context={props.context}
            id="beads-back"
            label="Esc Back"
            run={props.back}
          />
          <Show when={props.attach}>
            {(attach) => (
              <Action
                context={props.context}
                id="beads-attach"
                label={props.attaching ? "Adding…" : "a Add context"}
                disabled={props.attaching}
                run={attach()}
              />
            )}
          </Show>
        </Show>
        <Action
          context={props.context}
          id="beads-refresh"
          label="r Refresh"
          run={props.refresh}
        />
      </box>
      <text fg={props.context.theme.text.subdued}>
        {hint(props.inspecting, props.searching)}
      </text>
    </box>
  );
}

function hint(inspecting: boolean, searching: boolean) {
  if (searching) return "Enter apply · Esc leave search";
  if (inspecting) return "↑↓ scroll · Esc back";
  return "↑↓ / j k select · Enter or click inspect · Esc close";
}
