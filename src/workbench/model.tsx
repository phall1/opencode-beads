import { createStore } from "solid-js/store";
// Keep this reactive module in the host's TSX transform pipeline so its store
// shares the Solid runtime used by the rendered workbench.
import type { Issue, ListQuery, ListResult, View } from "../beads/schema";
import type { Neighborhood } from "../beads/graph-schema";
import { errorMessage } from "../text";

export interface Reader {
  list(query: ListQuery, signal: AbortSignal): Promise<ListResult>;
  show(id: string, signal: AbortSignal): Promise<Issue>;
  graph?(id: string, signal: AbortSignal): Promise<Neighborhood>;
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
  neighborhood?: Neighborhood;
  graphPhase: "idle" | "loading" | "ready" | "error";
  graphError?: string;
}

export function createWorkbench(reader: Reader) {
  const [state, set] = createStore<State>({
    view: "ready",
    search: "",
    phase: "loading",
    inspecting: false,
    graphPhase: "idle",
  });
  let listRequest = new AbortController();
  let detailRequest = new AbortController();
  const detailHistory: string[] = [];

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

  function leaveDetail() {
    detailRequest.abort();
    detailHistory.length = 0;
    set({
      inspecting: false,
      detail: undefined,
      detailError: undefined,
      neighborhood: undefined,
      graphPhase: "idle",
      graphError: undefined,
    });
  }

  function back() {
    const previous = detailHistory.pop();
    if (previous) {
      void loadDetail(previous);
      return;
    }
    leaveDetail();
  }

  async function refresh(view: View = state.view) {
    listRequest.abort();
    leaveDetail();
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

  async function loadDetail(id: string) {
    if (!id) return;
    detailRequest.abort();
    const request = new AbortController();
    detailRequest = request;
    set({
      inspecting: true,
      detail: undefined,
      detailError: undefined,
      neighborhood: undefined,
      graphPhase: reader.graph ? "loading" : "idle",
      graphError: undefined,
    });
    await Promise.all([
      loadIssue(reader, id, request.signal, set),
      loadGraph(reader, id, request.signal, set),
    ]);
  }

  function inspect(id: string = state.selectedID ?? "") {
    return loadDetail(id);
  }

  function inspectRelated(id: string) {
    if (state.detail?.id && state.detail.id !== id)
      detailHistory.push(state.detail.id);
    return loadDetail(id);
  }

  return {
    state,
    visible,
    refresh,
    inspect,
    inspectRelated,
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

type Setter = ReturnType<typeof createStore<State>>[1];

async function loadIssue(
  reader: Reader,
  id: string,
  signal: AbortSignal,
  set: Setter,
) {
  try {
    const detail = await reader.show(id, signal);
    if (!signal.aborted) set("detail", detail);
  } catch (error) {
    if (!signal.aborted) set("detailError", errorMessage(error));
  }
}

async function loadGraph(
  reader: Reader,
  id: string,
  signal: AbortSignal,
  set: Setter,
) {
  if (!reader.graph) return;
  try {
    const neighborhood = await reader.graph(id, signal);
    if (!signal.aborted) set({ neighborhood, graphPhase: "ready" });
  } catch (error) {
    if (!signal.aborted)
      set({ graphPhase: "error", graphError: errorMessage(error) });
  }
}

export type Workbench = ReturnType<typeof createWorkbench>;
