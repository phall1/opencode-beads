import { For, Show } from "solid-js";
import type { ScrollBoxRenderable } from "@opentui/core";
import type { Context } from "@opencode/plugin/tui/context";
import type { Workbench } from "./model";
import type { Issue } from "../beads/schema";
import { displayText } from "../text";

function owner(issue: Issue) {
  if (!issue.assignee) return "Unassigned";
  if (issue.assignee.startsWith("opencode:")) return "OpenCode session";
  return issue.assignee;
}

export function IssueList(props: {
  model: Workbench;
  context: Context;
  focused: boolean;
  inspect(id?: string): Promise<void>;
}) {
  const model = props.model;
  const theme = props.context.theme;
  let scroll: ScrollBoxRenderable | undefined;

  function move(delta: number) {
    const issues = model.visible();
    const index = issues.findIndex(
      (issue) => issue.id === model.state.selectedID,
    );
    const next =
      issues[Math.max(0, Math.min(issues.length - 1, index + delta))];
    if (!next) return;
    model.select(next.id);
    scroll?.scrollChildIntoView(`bead-row-${next.id}`);
  }

  props.context.keymap.layer(() => ({
    enabled: () => props.focused,
    commands: [
      { bind: "up", run: () => move(-1) },
      { bind: "k", run: () => move(-1) },
      { bind: "down", run: () => move(1) },
      { bind: "j", run: () => move(1) },
      { bind: "return", run: () => props.inspect() },
    ],
  }));

  return (
    <box flexGrow={1} flexDirection="column" minHeight={0}>
      <Show when={model.state.phase === "loading"}>
        <text fg={theme.text.subdued}>Loading beads…</text>
      </Show>
      <Show when={model.state.error}>
        <text fg={theme.text.feedback.error.default}>{model.state.error}</text>
      </Show>
      <Show when={model.state.phase === "ready"}>
        <text fg={theme.text.subdued} flexShrink={0} marginBottom={1}>
          {model.visible().length} shown · {model.state.result?.issues.length}{" "}
          loaded
          {model.state.result?.mayHaveMore
            ? " · 100-result cap; more may exist"
            : ""}
        </text>
        <Show
          when={model.visible().length > 0}
          fallback={<text fg={theme.text.subdued}>{emptyMessage(model)}</text>}
        >
          <scrollbox
            ref={scroll}
            id="beads-list"
            flexGrow={1}
            minHeight={0}
            focused={props.focused}
            scrollX={false}
            onSizeChange={() =>
              scroll?.scrollChildIntoView(`bead-row-${model.state.selectedID}`)
            }
          >
            <For each={model.visible()}>
              {(issue) => (
                <box
                  id={`bead-row-${issue.id}`}
                  flexDirection="column"
                  flexShrink={0}
                  height={3}
                  onSizeChange={() => {
                    if (model.state.selectedID === issue.id)
                      scroll?.scrollChildIntoView(`bead-row-${issue.id}`);
                  }}
                  paddingX={1}
                  backgroundColor={
                    model.state.selectedID === issue.id
                      ? theme.background.surface.offset
                      : theme.background.default
                  }
                  onMouseDown={(event) => {
                    if (event.button !== 0) return;
                    model.select(issue.id);
                    void props.inspect(issue.id);
                  }}
                >
                  <text height={1} wrapMode="none" fg={theme.text.default}>
                    {model.state.selectedID === issue.id ? "› " : "  "}
                    <b>{displayText(issue.title)}</b>
                  </text>
                  <text height={1} wrapMode="none" fg={theme.text.subdued}>
                    {displayText(
                      `  ${issue.id} · P${issue.priority} · ${issue.status} · ${owner(issue)}`,
                    )}
                  </text>
                </box>
              )}
            </For>
          </scrollbox>
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
