import { Show, createResource, onCleanup } from "solid-js";
import type { Context } from "@opencode/plugin/tui/context";
import type { Issue } from "../beads/schema";
import type { Reader } from "./model";
import { displayText, errorMessage, readableText } from "../text";
import { Action } from "./action";

export function SelectionPreview(props: {
  context: Context;
  reader: Reader;
  issue: Issue;
  wide: boolean;
  inspect(): unknown;
}) {
  let request = new AbortController();
  onCleanup(() => request.abort());
  const [detail] = createResource(
    () => props.issue.id,
    async (id) => {
      request.abort();
      const current = new AbortController();
      request = current;
      return props.reader.show(id, current.signal);
    },
  );
  const theme = props.context.theme;
  return (
    <box
      id="beads-preview"
      flexDirection="column"
      flexShrink={0}
      width={props.wide ? "55%" : undefined}
      height={props.wide ? "100%" : 10}
      paddingLeft={1}
      paddingTop={props.wide ? 0 : 1}
      border={props.wide ? ["left"] : ["top"]}
      borderColor={theme.border.default}
    >
      <text fg={theme.text.subdued} height={1}>
        SELECTED · {displayText(props.issue.id)}
      </text>
      <text fg={theme.text.default} height={1} wrapMode="none">
        <b>{displayText(props.issue.title)}</b>
      </text>
      <Show when={!detail.loading && detail.error}>
        <text fg={theme.text.feedback.error.default} height={3}>
          {errorMessage(detail.error)}
        </text>
      </Show>
      <Show when={detail.loading || !detail.error}>
        <Show
          when={!detail.loading && detail()}
          fallback={
            <text fg={theme.text.subdued} height={3}>
              Loading preview…
            </text>
          }
        >
          {(issue) => (
            <>
              <text
                fg={theme.text.default}
                height={props.wide ? 5 : 2}
                marginTop={1}
              >
                {readableText(issue().description) ||
                  "No description. Inspect for all bead fields."}
              </text>
              <Show when={props.wide && issue().acceptance_criteria}>
                <text fg={theme.text.subdued} height={2}>
                  {readableText(issue().acceptance_criteria)}
                </text>
              </Show>
            </>
          )}
        </Show>
      </Show>
      <box flexDirection="row" marginTop={1}>
        <Action
          context={props.context}
          id="beads-preview-inspect"
          label="Enter Inspect"
          run={props.inspect}
        />
      </box>
    </box>
  );
}
