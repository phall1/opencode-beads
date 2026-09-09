import { Show } from "solid-js";
import type { Context } from "@opencode/plugin/tui/context";
import { displayText } from "../text";
import { Action } from "./action";

export function WorkbenchHeader(props: {
  context: Context;
  directory: string;
  focused: boolean;
  width: number;
  conversationAvailable?: boolean;
  close(): void;
  fullscreen?: () => void;
}) {
  const theme = props.context.theme;
  return (
    <box flexDirection="column" flexShrink={0} marginBottom={1}>
      <box flexDirection="row" justifyContent="space-between" flexWrap="wrap">
        <text
          id="beads-heading"
          fg={props.focused ? theme.text.status.running : theme.text.subdued}
        >
          <b>Beads</b>
        </text>
        <box flexDirection="row" gap={1}>
          <Show when={props.fullscreen}>
            {(fullscreen) => (
              <Action
                context={props.context}
                id="beads-fullscreen"
                label={props.width < 40 ? "f Size" : "f Resize"}
                run={fullscreen()}
              />
            )}
          </Show>
          <Action
            context={props.context}
            id="beads-close"
            label={props.width < 40 ? "×" : "× Close"}
            run={props.close}
          />
        </box>
      </box>
      <text fg={theme.text.subdued} height={1} wrapMode="none">
        {displayText(
          shortPath(
            props.context.ui.format.path(props.directory),
            props.width - 4,
          ),
        )}
      </text>
      <text fg={theme.text.subdued} height={1} wrapMode="none">
        {focusHint(
          props.context,
          props.focused,
          Boolean(props.conversationAvailable),
          props.width - 4,
        )}
      </text>
    </box>
  );
}

function shortPath(path: string, width: number) {
  if (path.length <= width) return path;
  return `…${path.slice(-Math.max(1, width - 1))}`;
}

function focusHint(
  context: Context,
  focused: boolean,
  split: boolean,
  width: number,
) {
  if (!focused)
    return width < 24 ? "Click to focus Beads" : "Click here to focus Beads";
  const shortcuts = context.keymap.shortcuts("pane.focus.left");
  if (split && shortcuts.length) return conversationHint(shortcuts[0]!, width);
  return "Keyboard in Beads";
}

function conversationHint(shortcut: string, width: number) {
  const full = `Keyboard in Beads · ${shortcut} conversation`;
  if (Bun.stringWidth(full) <= width) return full;
  const compact = `Beads · ${shortcut} conversation`;
  if (Bun.stringWidth(compact) <= width) return compact;
  return "Keyboard in Beads";
}

export function WorkbenchFooter(props: {
  context: Context;
  inspecting: boolean;
  searching: boolean;
  back(): void;
  refresh(): unknown;
}) {
  return (
    <box flexDirection="column" flexShrink={0} marginTop={1} gap={1}>
      <box flexDirection="row" flexWrap="wrap" columnGap={1} rowGap={0}>
        <Show when={props.inspecting}>
          <Action
            context={props.context}
            id="beads-back"
            label="Esc Back"
            run={props.back}
          />
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
