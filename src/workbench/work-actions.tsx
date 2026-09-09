import {
  Show,
  createMemo,
  createSignal,
  onCleanup,
  onMount,
  type JSX,
} from "solid-js";
import type { Context } from "@opencode/plugin/tui/context";
import type { Issue } from "../beads/schema";
import type { WorkLink, WorkResult } from "../work/schema";
import { displayText, errorMessage } from "../text";
import { Action } from "./action";

export interface WorkActions {
  links(signal: AbortSignal): Promise<WorkLink[]>;
  start(id: string, signal: AbortSignal): Promise<WorkResult>;
}

export function WorkControls(props: {
  context: Context;
  work: WorkActions;
  issue?: Issue;
  focused: boolean;
  refresh(): Promise<void>;
  children?: JSX.Element;
}) {
  const lifetime = new AbortController();
  const [links, setLinks] = createSignal<WorkLink[]>([]);
  const link = createMemo(() =>
    props.issue
      ? links().find((link) => link.id === props.issue!.id)
      : links().at(-1),
  );
  const [busy, setBusy] = createSignal(false);
  const [failure, setFailure] = createSignal<string>();
  let generation = 0;
  onCleanup(() => lifetime.abort());

  async function sync() {
    const requested = ++generation;
    try {
      const value = await props.work.links(lifetime.signal);
      if (!lifetime.signal.aborted && requested === generation) setLinks(value);
    } catch (error) {
      if (!lifetime.signal.aborted && requested === generation)
        setFailure(errorMessage(error));
    }
  }
  onMount(() => void sync());

  async function start() {
    const issue = props.issue;
    if (!issue || busy()) return;
    generation++;
    setBusy(true);
    setFailure(undefined);
    try {
      const result = await props.work.start(issue.id, lifetime.signal);
      if (lifetime.signal.aborted) return;
      setLinks((links) => [
        ...links.filter((link) => link.id !== result.link.id),
        result.link,
      ]);
      props.context.ui.toast.show({
        title: "Beads",
        message: `${issue.id} claimed; work prompt submitted`,
        variant: "success",
      });
      await props.refresh();
      await sync();
    } catch (error) {
      if (lifetime.signal.aborted) return;
      setFailure(errorMessage(error));
      await sync();
    } finally {
      setBusy(false);
    }
  }

  props.context.keymap.layer(() => ({
    enabled: () => props.focused,
    commands: [
      {
        id: "beads.start",
        title: "Claim bead and start here",
        bind: "s",
        enabled: () =>
          Boolean(props.issue) && !busy() && link()?.phase !== "started",
        run: start,
      },
    ],
  }));

  return (
    <box flexDirection="column" flexShrink={0} marginTop={1}>
      <Show when={links().length > 1}>
        <text fg={props.context.theme.text.subdued}>
          {links().length} linked beads in this workspace
        </text>
      </Show>
      <Show when={link()}>
        {(current) => (
          <text fg={props.context.theme.text.subdued}>
            Linked: {displayText(current().id)} · {current().phase}
          </text>
        )}
      </Show>
      <Show when={props.issue}>
        <box
          flexDirection="row"
          flexWrap="wrap"
          columnGap={1}
          rowGap={0}
          marginBottom={1}
        >
          <Action
            context={props.context}
            id="beads-start"
            primary
            label={startLabel(busy(), link()?.phase)}
            disabled={busy() || link()?.phase === "started"}
            run={start}
          />
          {props.children}
        </box>
      </Show>
      <Show when={failure()}>
        <text fg={props.context.theme.text.feedback.error.default}>
          {failure()}
        </text>
      </Show>
    </box>
  );
}

function startLabel(busy: boolean, phase?: WorkLink["phase"]) {
  if (busy) return "Starting…";
  if (phase === "started") return "✓ Started";
  if (phase) return "s Resume start";
  return "s Claim & start";
}
