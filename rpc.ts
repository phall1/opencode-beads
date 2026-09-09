import { Rpc } from "@opencode/plugin/rpc";
import {
  Failure,
  Issue,
  ListQuery,
  ListResult,
  ShowQuery,
} from "./src/beads/schema";
import {
  SessionQuery,
  StartQuery,
  WorkLink,
  WorkResult,
} from "./src/work/schema";
import {
  BriefQuery,
  WorkBrief,
  FinishQuery,
  FinishResult,
} from "./src/work/intelligence-schema";
import {
  GraphQuery,
  Neighborhood,
  NextQuery,
  Recommendations,
} from "./src/beads/graph-schema";

export const Beads = Rpc.define({
  id: "beads",
  methods: {
    context: {
      input: BriefQuery,
      output: WorkBrief,
      errors: { unavailable: Failure },
    },
    graph: {
      input: GraphQuery,
      output: Neighborhood,
      errors: { unavailable: Failure },
    },
    next: {
      input: NextQuery,
      output: Recommendations,
      errors: { unavailable: Failure },
    },
    finish: {
      input: FinishQuery,
      output: FinishResult,
      errors: { unavailable: Failure },
    },
    links: {
      input: SessionQuery,
      output: WorkLink.array(),
      errors: { unavailable: Failure },
    },
    linked: {
      input: SessionQuery,
      output: WorkLink.nullable(),
      errors: { unavailable: Failure },
    },
    start: {
      input: StartQuery,
      output: WorkResult,
      errors: { unavailable: Failure },
    },
    list: {
      input: ListQuery,
      output: ListResult,
      errors: { unavailable: Failure },
    },
    show: { input: ShowQuery, output: Issue, errors: { unavailable: Failure } },
  },
  events: {},
});
