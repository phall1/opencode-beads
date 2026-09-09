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

export const Beads = Rpc.define({
  id: "beads",
  methods: {
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
