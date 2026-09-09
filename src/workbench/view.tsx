import { For, Show, createSignal, onCleanup, onMount } from "solid-js";
import type { Context } from "@opencode/plugin/tui/context";
import type { BoxRenderable } from "@opentui/core";
import { createWorkbench, type Reader, type Workbench } from "./model";
import { displayText, errorMessage, readableText } from "../text";
import type { Issue } from "../beads/schema";
import { WorkControls, type WorkActions } from "./work-actions";
import { IssueList } from "./list";
import { Action } from "./action";
import { WorkbenchHeader, WorkbenchFooter } from "./chrome";
import { restoreWidgetFocus } from "./focus";

export interface WorkbenchProps {
  context: Context;
  reader: Reader;
  directory: string;
  focused: boolean;
  close(): void;
  fullscreen?: () => void;
  attach?: (issue: Issue) => Promise<void>;
  work?: WorkActions;
}

export function WorkbenchView(props: WorkbenchProps) {
  const model = createWorkbench(props.reader);
  const [searching, setSearching] = createSignal(false);
  const [attaching, setAttaching] = createSignal(false);
  const theme = props.context.theme;
  let root: BoxRenderable | undefined;
  const widgetID = () => {
    if (searching()) return "beads-search-input";
    if (model.state.inspecting) return "beads-detail";
    return "beads-list";
  };
  restoreWidgetFocus(
    () => root,
    widgetID,
    () => props.focused,
  );
  onMount(() => void model.refresh());
  onCleanup(model.dispose);

  function search() {
    model.back();
    setSearching(true);
  }

  function refresh(view = model.state.view) {
    setSearching(false);
    return model.refresh(view);
  }

  function inspect(id?: string) {
    setSearching(false);
    return model.inspect(id);
  }

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
      { id: "beads.ready", bind: "1", run: () => refresh("ready") },
      {
        id: "beads.progress",
        bind: "2",
        run: () => refresh("in_progress"),
      },
      { id: "beads.open", bind: "3", run: () => refresh("open") },
      { id: "beads.refresh", bind: "r", run: () => refresh() },
      {
        id: "beads.search",
        bind: "/",
        run: search,
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
      id="beads-workbench"
      ref={root}
      flexDirection="column"
      flexGrow={1}
      minHeight={0}
      paddingX={1}
      border
      borderColor={theme.border.default}
      backgroundColor={theme.background.default}
    >
      <WorkbenchHeader
        context={props.context}
        directory={props.directory}
        focused={props.focused}
        close={props.close}
        fullscreen={props.fullscreen}
      />
      <box flexDirection="row" gap={1} flexShrink={0} height={1}>
        <For
          each={[
            { key: "1", view: "ready" as const, title: "Ready" },
            { key: "2", view: "in_progress" as const, title: "In progress" },
            { key: "3", view: "open" as const, title: "Open" },
          ]}
        >
          {(tab) => (
            <Action
              context={props.context}
              id={`beads-tab-${tab.view}`}
              label={`${tab.key} ${tab.title}`}
              primary={model.state.view === tab.view}
              run={() => refresh(tab.view)}
            />
          )}
        </For>
      </box>
      <box flexDirection="row" height={1} flexShrink={0}>
        <Show
          when={searching()}
          fallback={
            <text
              fg={theme.text.subdued}
              height={1}
              flexGrow={1}
              wrapMode="none"
              onMouseDown={search}
              id="beads-search"
            >
              {model.state.search
                ? `Filter: ${displayText(model.state.search)}`
                : "/ Search loaded results"}
            </text>
          }
        >
          <input
            placeholder="Search ID, title, owner, label…"
            id="beads-search-input"
            value={model.state.search}
            focused={props.focused}
            flexGrow={1}
            onInput={model.search}
            onSubmit={() => setSearching(false)}
            textColor={theme.text.default}
            backgroundColor={theme.background.surface.offset}
          />
        </Show>
        <Show when={model.state.search}>
          <Action
            context={props.context}
            id="beads-clear-search"
            label="× Clear"
            run={() => model.search("")}
          />
        </Show>
      </box>
      <Show
        when={model.state.inspecting}
        fallback={
          <IssueList
            model={model}
            context={props.context}
            focused={props.focused && !searching()}
            inspect={inspect}
          />
        }
      >
        <IssueDetail
          model={model}
          context={props.context}
          focused={props.focused && !searching()}
        />
      </Show>
      <Show when={props.work}>
        {(work) => (
          <WorkControls
            context={props.context}
            work={work()}
            issue={model.state.detail}
            focused={props.focused && !searching()}
            refresh={() => model.refresh()}
          />
        )}
      </Show>
      <WorkbenchFooter
        context={props.context}
        inspecting={model.state.inspecting}
        searching={searching()}
        back={model.back}
        refresh={() => refresh()}
        attach={props.attach ? attach : undefined}
        attaching={attaching()}
      />
    </box>
  );
}

function IssueDetail(props: {
  model: Workbench;
  context: Context;
  focused: boolean;
}) {
  const theme = props.context.theme;
  return (
    <scrollbox
      id="beads-detail"
      flexGrow={1}
      minHeight={0}
      focused={props.focused}
      scrollX={false}
    >
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
