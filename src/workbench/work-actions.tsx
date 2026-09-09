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
import type {
  Evidence,
  FinishResult,
  WorkBrief,
} from "../work/intelligence-schema";
import { displayText, errorMessage } from "../text";
import { Action } from "./action";

export interface WorkActions {
  links(signal: AbortSignal): Promise<WorkLink[]>;
  start(id: string, signal: AbortSignal): Promise<WorkResult>;
  brief?(signal: AbortSignal): Promise<WorkBrief>;
  finish?(
    id: string,
    evidence: Evidence,
    signal: AbortSignal,
  ): Promise<FinishResult>;
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
  const evidence = new Map<string, Evidence>();
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

  async function showBrief() {
    if (!props.work.brief || busy()) return;
    setBusy(true);
    setFailure(undefined);
    try {
      const brief = await props.work.brief(lifetime.signal);
      if (lifetime.signal.aborted) return;
      await props.context.ui.dialog.alert({
        title: "Beads work brief",
        message: brief.text || "No linked work is active in this session.",
      });
    } catch (error) {
      if (!lifetime.signal.aborted) setFailure(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function finish() {
    const target = finishTarget(props.issue, link(), props.work.finish);
    if (!target || busy()) return;
    const { issue, execute } = target;
    setBusy(true);
    setFailure(undefined);
    try {
      const proof = await askEvidence(
        props.context,
        issue,
        evidence.get(issue.id),
      );
      if (!proof || lifetime.signal.aborted) return;
      evidence.set(issue.id, proof);
      const result = await execute(issue.id, proof, lifetime.signal);
      if (lifetime.signal.aborted) return;
      setLinks((links) => links.filter((item) => item.id !== issue.id));
      evidence.delete(issue.id);
      props.context.ui.toast.show({
        title: "Beads",
        message: finishMessage(result),
        variant: "success",
      });
      await props.refresh();
      await sync();
      if (result.warnings.length)
        await props.context.ui.dialog.alert({
          title: `${issue.id} closed with a warning`,
          message: result.warnings.join("\n"),
        });
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
      {
        id: "beads.finish",
        title: "Finish bead with evidence",
        bind: "x",
        enabled: () =>
          Boolean(props.issue && link() && props.work.finish) && !busy(),
        run: finish,
      },
      {
        id: "beads.brief",
        title: "Inspect current work brief",
        bind: "b",
        enabled: () => Boolean(props.work.brief) && !busy(),
        run: showBrief,
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
      <Show when={props.work.brief}>
        <box flexDirection="row" marginBottom={1}>
          <Action
            context={props.context}
            id="beads-work-brief"
            label="b Work brief"
            disabled={busy()}
            run={showBrief}
          />
        </box>
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
          <Show when={link() && props.work.finish}>
            <Action
              context={props.context}
              id="beads-finish"
              label={busy() ? "Working…" : "x Finish"}
              disabled={busy()}
              run={finish}
            />
          </Show>
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

function finishTarget(
  issue: Issue | undefined,
  link: WorkLink | undefined,
  execute: WorkActions["finish"],
) {
  if (!issue || !link || !execute) return;
  return { issue, execute };
}

async function askEvidence(
  context: Context,
  issue: Issue,
  previous?: Evidence,
): Promise<Evidence | undefined> {
  const summary = await context.ui.dialog.prompt({
    title: `Finish ${issue.id}`,
    description: "What was completed? This will be retained in Beads.",
    placeholder: "Implemented the accepted behavior",
    value: previous?.summary,
  });
  if (summary === undefined) return;
  const validation = await context.ui.dialog.prompt({
    title: `Validate ${issue.id}`,
    description: "What evidence proves the acceptance criteria?",
    placeholder: "Tests, checks, or manual verification",
    value: previous?.validation,
  });
  if (validation === undefined) return;
  const artifacts = await context.ui.dialog.prompt({
    title: `Artifacts for ${issue.id}`,
    description: "Optional commit, screenshot, log, or artifact references.",
    placeholder: "Optional",
    value: previous?.artifacts,
  });
  if (artifacts === undefined) return;
  if (!summary.trim() || !validation.trim())
    throw new Error("Summary and validation evidence are required to finish.");
  return {
    summary: summary.trim(),
    validation: validation.trim(),
    artifacts: artifacts.trim(),
  };
}

function finishMessage(result: FinishResult) {
  const count = result.newlyReady.length;
  return `${result.issue.id} closed with evidence · ${count} newly Ready observed`;
}

function startLabel(busy: boolean, phase?: WorkLink["phase"]) {
  if (busy) return "Working…";
  if (phase === "started") return "✓ Started";
  if (phase) return "s Resume start";
  return "s Claim & start";
}
