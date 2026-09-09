import { createStore } from "solid-js/store";
import type { Issue, ListQuery, ListResult, View } from "../beads/schema";
import { errorMessage } from "../text";

export interface Reader {
  list(query: ListQuery, signal: AbortSignal): Promise<ListResult>;
  show(id: string, signal: AbortSignal): Promise<Issue>;
}

interface State {
  view: View;
  search: string;
  selectedID?: string;
  phase: "loading" | "ready" | "error";
  result?: ListResult;
  error?: string;
  inspecting: boolean;
  detail?: Issue;
  detailError?: string;
}

export function createWorkbench(reader: Reader) {
  const [state, set] = createStore<State>({
    view: "ready",
    search: "",
    phase: "loading",
    inspecting: false,
  });
  let listRequest = new AbortController();
  let detailRequest = new AbortController();

  function visible(): Issue[] {
    const terms = state.search.toLowerCase().trim().split(/\s+/);
    return (state.result?.issues ?? []).filter((issue) => {
      const haystack = [issue.id, issue.title, issue.assignee, ...issue.labels]
        .join(" ")
        .toLowerCase();
      return terms.every((term) => haystack.includes(term));
    });
  }

  function reconcileSelection() {
    const issues = visible();
    if (!issues.some((issue) => issue.id === state.selectedID))
      set("selectedID", issues[0]?.id);
  }

  function back() {
    detailRequest.abort();
    set({ inspecting: false, detail: undefined, detailError: undefined });
  }

  async function refresh(view: View = state.view) {
    listRequest.abort();
    back();
    const request = new AbortController();
    listRequest = request;
    set({ view, phase: "loading", result: undefined, error: undefined });
    try {
      const result = await reader.list({ view, limit: 100 }, request.signal);
      if (request.signal.aborted) return;
      set({ result, phase: "ready" });
      reconcileSelection();
    } catch (error) {
      if (!request.signal.aborted)
        set({ phase: "error", error: errorMessage(error) });
    }
  }

  async function inspect(id: string = state.selectedID ?? "") {
    if (!id) return;
    detailRequest.abort();
    const request = new AbortController();
    detailRequest = request;
    set({ inspecting: true, detail: undefined, detailError: undefined });
    try {
      const detail = await reader.show(id, request.signal);
      if (!request.signal.aborted) set("detail", detail);
    } catch (error) {
      if (!request.signal.aborted) set("detailError", errorMessage(error));
    }
  }

  return {
    state,
    visible,
    refresh,
    inspect,
    back,
    select(id: string) {
      set("selectedID", id);
    },
    search(value: string) {
      set("search", value);
      reconcileSelection();
    },
    dispose() {
      listRequest.abort();
      detailRequest.abort();
    },
  };
}

export type Workbench = ReturnType<typeof createWorkbench>;
