import { Show, createSignal, onCleanup, onMount } from "solid-js";
import type { Context } from "@opencode/plugin/tui/context";
import type { Issue } from "../beads/schema";
import type { WorkLink, WorkResult } from "../work/schema";
import { displayText, errorMessage } from "../text";

export interface WorkActions {
  linked(signal: AbortSignal): Promise<WorkLink | null>;
  start(id: string, signal: AbortSignal): Promise<WorkResult>;
}

export function WorkControls(props: {
  context: Context;
  work: WorkActions;
  issue?: Issue;
  focused: boolean;
  refresh(): Promise<void>;
}) {
  const lifetime = new AbortController();
  const [link, setLink] = createSignal<WorkLink | null>(null);
  const [busy, setBusy] = createSignal(false);
  const [failure, setFailure] = createSignal<string>();
  let generation = 0;
  onCleanup(() => lifetime.abort());

  async function sync() {
    const requested = ++generation;
    try {
      const value = await props.work.linked(lifetime.signal);
      if (!lifetime.signal.aborted && requested === generation) setLink(value);
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
      setLink(result.link);
      props.context.ui.toast.show({
        title: "Beads",
        message: `${issue.id} claimed; work prompt submitted`,
        variant: "success",
      });
      await props.refresh();
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
        enabled: () => Boolean(props.issue) && !busy(),
        run: start,
      },
    ],
  }));

  return (
    <box flexDirection="column" flexShrink={0}>
      <Show when={link()}>
        {(current) => (
          <text fg={props.context.theme.text.subdued}>
            Linked: {displayText(current().id)} · {current().phase}
          </text>
        )}
      </Show>
      <Show when={props.issue}>
        <text fg={props.context.theme.text.default}>
          {busy()
            ? "Claiming and starting…"
            : "s Claim & start here (changes ownership)"}
        </text>
      </Show>
      <Show when={failure()}>
        <text fg={props.context.theme.text.feedback.error.default}>
          {failure()}
        </text>
      </Show>
    </box>
  );
}
