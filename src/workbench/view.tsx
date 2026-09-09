import { For, Show, createSignal, onCleanup, onMount } from "solid-js";
import type { Context } from "@opencode/plugin/tui/context";
import type { BoxRenderable } from "@opentui/core";
import { createWorkbench, type Reader, type Workbench } from "./model";
import { displayText, errorMessage, readableText } from "../text";
import type { Issue } from "../beads/schema";
import type { Relation } from "../beads/graph-schema";
import { WorkControls, type WorkActions } from "./work-actions";
import { IssueList } from "./list";
import { Action } from "./action";
import { WorkbenchHeader, WorkbenchFooter } from "./chrome";
import { restoreWidgetFocus } from "./focus";
import { afterMouseDispatch } from "./mouse";
import { SelectionPreview } from "./preview";

export interface WorkbenchProps {
  context: Context;
  reader: Reader;
  directory: string;
  focused: boolean;
  close(): void;
  fullscreen?: () => void;
  conversationAvailable?: boolean;
  attach?: (issue: Issue) => Promise<void>;
  work?: WorkActions;
}

export function WorkbenchView(props: WorkbenchProps) {
  const model = createWorkbench(props.reader);
  const [searching, setSearching] = createSignal(false);
  const [attaching, setAttaching] = createSignal(false);
  const [attachedID, setAttachedID] = createSignal<string>();
  const theme = props.context.theme;
  const [width, setWidth] = createSignal(80);
  const [height, setHeight] = createSignal(24);
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
  const clickSearch = afterMouseDispatch(search);
  const relations = () => [
    ...(model.state.neighborhood?.dependencies ?? []),
    ...(model.state.neighborhood?.dependents ?? []),
  ];
  const preview = () => {
    if (width() < 48 || height() < 28 || model.state.phase !== "ready")
      return undefined;
    if (width() < 100 && height() < 36) return undefined;
    return model.visible().find((issue) => issue.id === model.state.selectedID);
  };

  async function attach() {
    const issue = model.state.detail;
    if (!issue || !props.attach || attaching()) return;
    setAttaching(true);
    try {
      await props.attach(issue);
      setAttachedID(issue.id);
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

  async function chooseRelationship() {
    const available = relations().filter((item) => item.canInspect);
    if (!available.length) return;
    const id = await props.context.ui.dialog.select({
      title: "Inspect related bead",
      placeholder: "Choose a prerequisite or dependent",
      options: available.map((item) => ({
        title: `${item.type} · ${item.id}`,
        description: `${item.status} · ${displayText(item.title)}`,
        value: item.id,
      })),
    });
    if (id) await model.inspectRelated(id);
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
      {
        id: "beads.relationships",
        title: "Inspect a related bead",
        bind: "g",
        enabled: () => relations().some((item) => item.canInspect),
        run: chooseRelationship,
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
      onSizeChange={() => {
        setWidth(root!.width);
        setHeight(root!.height);
      }}
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
        width={width()}
        conversationAvailable={props.conversationAvailable}
      />
      <Show when={!model.state.inspecting}>
        <box
          flexDirection="row"
          flexWrap="wrap"
          columnGap={1}
          rowGap={0}
          flexShrink={0}
        >
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
                onMouseDown={clickSearch}
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
      </Show>
      <Show when={model.state.inspecting}>
        <IssueHeading model={model} context={props.context} />
      </Show>
      <Show
        when={
          model.state.inspecting &&
          relations().some((relation) => relation.canInspect)
        }
      >
        <box flexDirection="row" marginTop={1} flexShrink={0}>
          <Action
            context={props.context}
            id="beads-relationships"
            label="g Related"
            run={chooseRelationship}
          />
        </box>
      </Show>
      <Show when={props.work}>
        {(work) => (
          <WorkControls
            context={props.context}
            work={work()}
            issue={model.state.detail}
            focused={props.focused && !searching()}
            refresh={() => model.refresh()}
          >
            <Show when={props.attach}>
              <Action
                context={props.context}
                id="beads-attach"
                label={attachmentLabel(
                  attaching(),
                  attachedID() === model.state.detail?.id,
                )}
                disabled={attaching() || !model.state.detail}
                run={attach}
              />
            </Show>
          </WorkControls>
        )}
      </Show>
      <Show when={!props.work && props.attach && model.state.detail}>
        <Action
          context={props.context}
          id="beads-attach"
          label={attachmentLabel(
            attaching(),
            attachedID() === model.state.detail?.id,
          )}
          disabled={attaching()}
          run={attach}
        />
      </Show>
      <Show
        when={model.state.inspecting}
        fallback={
          <box
            flexDirection={width() >= 100 ? "row" : "column"}
            flexGrow={1}
            minHeight={0}
            gap={1}
          >
            <IssueList
              model={model}
              context={props.context}
              focused={props.focused && !searching()}
              inspect={inspect}
            />
            <Show when={preview()}>
              {(issue) => (
                <SelectionPreview
                  context={props.context}
                  reader={props.reader}
                  issue={issue()}
                  wide={width() >= 100}
                  inspect={() => inspect()}
                />
              )}
            </Show>
          </box>
        }
      >
        <IssueDetail
          model={model}
          context={props.context}
          width={width() - 4}
          focused={props.focused && !searching()}
          inspectRelated={model.inspectRelated}
        />
      </Show>
      <WorkbenchFooter
        context={props.context}
        inspecting={model.state.inspecting}
        searching={searching()}
        back={model.back}
        refresh={() => refresh()}
      />
    </box>
  );
}

function attachmentLabel(busy: boolean, attached: boolean) {
  if (busy) return "Adding…";
  if (attached) return "✓ Context added";
  return "a Add context";
}

function IssueHeading(props: { model: Workbench; context: Context }) {
  return (
    <Show when={props.model.state.detail}>
      {(issue) => (
        <box flexDirection="column" flexShrink={0} marginTop={1}>
          <text
            fg={props.context.theme.text.default}
            maxHeight={2}
            flexShrink={0}
          >
            <b>{displayText(issue().title)}</b>
          </text>
          <text
            fg={props.context.theme.text.subdued}
            height={1}
            wrapMode="none"
            truncate
            flexShrink={0}
          >
            {displayText(
              `${issue().id} · P${issue().priority} · ${issue().status}`,
            )}
          </text>
        </box>
      )}
    </Show>
  );
}

function IssueDetail(props: {
  model: Workbench;
  context: Context;
  width: number;
  focused: boolean;
  inspectRelated(id: string): Promise<void>;
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
            <For
              each={[
                ["Description", issue().description],
                ["Acceptance criteria", issue().acceptance_criteria],
                ["Design", issue().design],
                ["Notes", issue().notes],
                ["Owner", issue().assignee],
                ["Labels", issue().labels.join(" · ")],
                [
                  "Recorded dependencies",
                  issue()
                    .dependencies.map(
                      (dep) => `${dep.type} → ${dep.depends_on_id}`,
                    )
                    .join("\n"),
                ],
                ["Full title and ID", fullReference(issue(), props.width)],
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
            <RelationshipDetail
              context={props.context}
              model={props.model}
              inspect={props.inspectRelated}
            />
          </box>
        )}
      </Show>
    </scrollbox>
  );
}

function RelationshipDetail(props: {
  context: Context;
  model: Workbench;
  inspect(id: string): Promise<void>;
}) {
  const theme = props.context.theme;
  return (
    <box flexDirection="column">
      <text fg={theme.text.subdued}>Relationships</text>
      <Show when={props.model.state.graphPhase === "loading"}>
        <text fg={theme.text.subdued}>Loading immediate relationships…</text>
      </Show>
      <Show when={props.model.state.graphError}>
        <text fg={theme.text.feedback.error.default}>
          {props.model.state.graphError}
        </text>
      </Show>
      <Show when={props.model.state.neighborhood}>
        {(graph) => (
          <box flexDirection="column">
            <RelationGroup
              context={props.context}
              title="Prerequisites"
              kind="dependency"
              items={graph().dependencies}
              inspect={props.inspect}
            />
            <RelationGroup
              context={props.context}
              title="Dependents"
              kind="dependent"
              items={graph().dependents}
              inspect={props.inspect}
            />
            <Show
              when={!graph().dependencies.length && !graph().dependents.length}
            >
              <text fg={theme.text.subdued}>No immediate relationships.</text>
            </Show>
            <Show when={graph().truncated}>
              <text fg={theme.text.feedback.warning.default}>
                Relationship results are capped; inspect with beads_graph for
                the bounded response.
              </text>
            </Show>
            <text fg={theme.text.subdued}>{graph().scope}</text>
          </box>
        )}
      </Show>
    </box>
  );
}

function RelationGroup(props: {
  context: Context;
  title: string;
  kind: string;
  items: Relation[];
  inspect(id: string): Promise<void>;
}) {
  const click = (item: Relation) =>
    afterMouseDispatch(() => {
      if (item.canInspect) return props.inspect(item.id);
    });
  return (
    <Show when={props.items.length}>
      <box flexDirection="column" marginTop={1}>
        <text fg={props.context.theme.text.subdued}>{props.title}</text>
        <For each={props.items}>
          {(item, index) => (
            <text
              id={`beads-${props.kind}-${index()}`}
              fg={
                item.canInspect
                  ? props.context.theme.text.action.secondary.default
                  : props.context.theme.text.subdued
              }
              onMouseDown={click(item)}
            >
              {readableText(
                `${item.type} · ${item.status}\n${item.id} — ${item.title}`,
              )}
            </text>
          )}
        </For>
      </box>
    </Show>
  );
}

function fullReference(issue: Issue, width: number) {
  const metadata = `${issue.id} · P${issue.priority} · ${issue.status}`;
  if (
    Bun.stringWidth(displayText(issue.title)) <= width &&
    Bun.stringWidth(displayText(metadata)) <= width
  )
    return undefined;
  return `${issue.title}\n${issue.id}`;
}
