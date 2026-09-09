import { Rpc } from "@opencode/plugin/rpc";
import {
  Failure,
  Issue,
  ListQuery,
  ListResult,
  ShowQuery,
} from "./src/beads/schema";

export const Beads = Rpc.define({
  id: "beads",
  methods: {
    list: {
      input: ListQuery,
      output: ListResult,
      errors: { unavailable: Failure },
    },
    show: { input: ShowQuery, output: Issue, errors: { unavailable: Failure } },
  },
  events: {},
});
