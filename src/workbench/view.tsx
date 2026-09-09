import {
  For,
  Show,
  createMemo,
  createSignal,
  onCleanup,
  onMount,
} from "solid-js";
import type { Context } from "@opencode/plugin/tui/context";
import { createWorkbench, type Reader, type Workbench } from "./model";
import { displayText, errorMessage, readableText } from "../text";
import type { Issue } from "../beads/schema";

export interface WorkbenchProps {
  context: Context;
  reader: Reader;
  directory: string;
  focused: boolean;
  close(): void;
  fullscreen?: () => void;
  attach?: (issue: Issue) => Promise<void>;
}

export function WorkbenchView(props: WorkbenchProps) {
  const model = createWorkbench(props.reader);
  const [searching, setSearching] = createSignal(false);
  const [attaching, setAttaching] = createSignal(false);
  const theme = props.context.theme;
  onMount(() => void model.refresh());
  onCleanup(model.dispose);

  async function attach() {
    const issue = model.state.detail;
    if (!issue || !props.attach || attaching()) return;
    setAttaching(true);
    try {
      await props.attach(issue);
      props.context.ui.toast.show({
        title: "Beads",
        message: `${issue.id} added to conversation context`,
        variant: "success",
      });
    } catch (error) {
      props.context.ui.toast.show({
        title: "Beads",
        message: errorMessage(error),
        variant: "error",
      });
    } finally {
      setAttaching(false);
    }
  }

  props.context.keymap.layer(() => ({
    enabled: () => props.focused && !searching(),
    commands: [
      { id: "beads.ready", bind: "1", run: () => model.refresh("ready") },
      {
        id: "beads.progress",
        bind: "2",
        run: () => model.refresh("in_progress"),
      },
      { id: "beads.open", bind: "3", run: () => model.refresh("open") },
      { id: "beads.refresh", bind: "r", run: () => model.refresh() },
      {
        id: "beads.search",
        bind: "/",
        run: () => {
          model.back();
          setSearching(true);
        },
      },
      {
        id: "beads.back",
        bind: "escape",
        run: () => {
          if (model.state.inspecting) model.back();
          else props.close();
        },
      },
      {
        id: "beads.fullscreen",
        bind: "f",
        enabled: Boolean(props.fullscreen),
        run: () => props.fullscreen?.(),
      },
      {
        id: "beads.attach",
        bind: "a",
        enabled: () =>
          Boolean(model.state.detail && props.attach) && !attaching(),
        run: attach,
      },
    ],
  }));
  props.context.keymap.layer(() => ({
    enabled: () => props.focused && searching(),
    commands: [{ bind: "escape", run: () => setSearching(false) }],
  }));

  return (
    <box
      flexDirection="column"
      flexGrow={1}
      minHeight={0}
      paddingX={1}
      backgroundColor={theme.background.default}
    >
      <text fg={theme.text.default} height={1} flexShrink={0}>
        <b>BEADS</b> Your next useful move
      </text>
      <text fg={theme.text.subdued} wrapMode="none" height={1} flexShrink={0}>
        {displayText(props.context.ui.format.path(props.directory))}
      </text>
      <box flexDirection="row" gap={2} marginTop={1} flexShrink={0} height={1}>
        <For
          each={[
            { key: "1", view: "ready" as const, title: "Ready" },
            { key: "2", view: "in_progress" as const, title: "In progress" },
            { key: "3", view: "open" as const, title: "Open" },
          ]}
        >
          {(tab) => (
            <text
              fg={
                model.state.view === tab.view
                  ? theme.text.default
                  : theme.text.subdued
              }
              onMouseDown={() => void model.refresh(tab.view)}
            >
              {model.state.view === tab.view ? "▸ " : ""}
              {tab.key} {tab.title}
            </text>
          )}
        </For>
      </box>
      <Show
        when={searching()}
        fallback={
          <text
            fg={theme.text.subdued}
            height={1}
            flexShrink={0}
            wrapMode="none"
          >
            {model.state.search
              ? `Filter: ${displayText(model.state.search)}`
              : "/ Search loaded results"}
          </text>
        }
      >
        <input
          placeholder="Search ID, title, owner, label…"
          value={model.state.search}
          focused={props.focused}
          flexShrink={0}
          onInput={model.search}
          onSubmit={() => setSearching(false)}
          textColor={theme.text.default}
          backgroundColor={theme.background.surface.offset}
        />
      </Show>
      <Show
        when={model.state.inspecting}
        fallback={
          <IssueList
            model={model}
            context={props.context}
            focused={props.focused && !searching()}
          />
        }
      >
        <IssueDetail
          model={model}
          context={props.context}
          focused={props.focused && !searching()}
        />
      </Show>
      <text fg={theme.text.subdued} marginTop={1} flexShrink={0}>
        {model.state.inspecting
          ? `Esc back · r refresh${props.attach ? " · a add context" : ""}${attaching() ? " (adding…)" : ""}`
          : "↑↓ / j k move · Enter inspect · r refresh"}
      </text>
      <text fg={theme.text.subdued} flexShrink={0}>
        {props.fullscreen ? "f fullscreen · " : ""}Esc close · / search · 1/2/3
        views
      </text>
    </box>
  );
}

function IssueList(props: {
  model: Workbench;
  context: Context;
  focused: boolean;
}) {
  const model = props.model;
  const theme = props.context.theme;
  const options = createMemo(() =>
    model.visible().map((issue) => ({
      name: displayText(`P${issue.priority}  ${issue.id}  ${issue.title}`),
      description: displayText(
        `${issue.status} · ${issue.issue_type} · ${issue.assignee || "unassigned"} ${issue.labels.join(" · ")}`,
      ),
      value: issue.id,
    })),
  );
  const index = () =>
    Math.max(
      0,
      model.visible().findIndex((issue) => issue.id === model.state.selectedID),
    );
  return (
    <box flexGrow={1} flexDirection="column" minHeight={0}>
      <Show when={model.state.phase === "loading"}>
        <text fg={theme.text.subdued}>Loading beads…</text>
      </Show>
      <Show when={model.state.error}>
        <text fg={theme.text.feedback.error.default}>{model.state.error}</text>
      </Show>
      <Show when={model.state.phase === "ready"}>
        <text fg={theme.text.subdued} flexShrink={0}>
          {model.visible().length} shown · {model.state.result?.issues.length}{" "}
          loaded
          {model.state.result?.mayHaveMore
            ? " · cap reached (100); more may exist"
            : ""}
        </text>
        <Show
          when={options().length > 0}
          fallback={
            <text fg={theme.text.subdued} marginTop={1}>
              {emptyMessage(model)}
            </text>
          }
        >
          <select
            options={options()}
            selectedIndex={index()}
            flexGrow={1}
            minHeight={0}
            focused={props.focused}
            wrapSelection={false}
            showScrollIndicator
            textColor={theme.text.default}
            descriptionColor={theme.text.subdued}
            backgroundColor={theme.background.default}
            focusedBackgroundColor={theme.background.default}
            selectedBackgroundColor={theme.background.surface.offset}
            selectedTextColor={theme.text.default}
            selectedDescriptionColor={theme.text.subdued}
            keyBindings={[
              { name: "j", action: "move-down" },
              { name: "k", action: "move-up" },
            ]}
            onChange={(_index, option) => {
              if (option) model.select(String(option.value));
            }}
            onSelect={() => void model.inspect()}
          />
        </Show>
      </Show>
    </box>
  );
}

function emptyMessage(model: Workbench): string {
  if (model.state.search)
    return "No matches in loaded results. Press / to change or clear the filter.";
  if (model.state.view === "ready")
    return "Nothing ready right now. Try 2 for work in progress or 3 for open work.";
  return "No beads in this view. Switch views with 1/2/3 or refresh with r.";
}

function IssueDetail(props: {
  model: Workbench;
  context: Context;
  focused: boolean;
}) {
  const theme = props.context.theme;
  return (
    <scrollbox flexGrow={1} minHeight={0} focused={props.focused}>
      <Show when={props.model.state.detailError}>
        <text fg={theme.text.feedback.error.default}>
          {props.model.state.detailError}
        </text>
      </Show>
      <Show
        when={props.model.state.detail}
        fallback={
          <Show when={!props.model.state.detailError}>
            <text fg={theme.text.subdued}>Loading full bead…</text>
          </Show>
        }
      >
        {(issue) => (
          <box flexDirection="column" gap={1}>
            <text fg={theme.text.default}>
              <b>{displayText(issue().title)}</b>
            </text>
            <text fg={theme.text.subdued}>
              {displayText(
                `${issue().id} · P${issue().priority} · ${issue().status} · ${issue().assignee || "unassigned"}`,
              )}
            </text>
            <For
              each={[
                ["Description", issue().description],
                ["Acceptance criteria", issue().acceptance_criteria],
                ["Design", issue().design],
                ["Notes", issue().notes],
                [
                  "Dependencies",
                  issue()
                    .dependencies.map(
                      (dep) => `${dep.type} → ${dep.depends_on_id}`,
                    )
                    .join("\n"),
                ],
              ]}
            >
              {([title, body]) => (
                <Show when={body}>
                  <box flexDirection="column">
                    <text fg={theme.text.subdued}>{title}</text>
                    <text fg={theme.text.default}>
                      {readableText(body ?? "")}
                    </text>
                  </box>
                </Show>
              )}
            </For>
          </box>
        )}
      </Show>
    </scrollbox>
  );
}
