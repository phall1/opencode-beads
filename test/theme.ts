import {
  HueStep,
  MarkdownToken,
  SyntaxToken,
  resolveTheme,
} from "@opencode/theme/tui";

const action = { base: "#78a9ff" };
const feedback = { base: "#ff8080" };
const actions = { primary: action, secondary: action, destructive: action };
const kinds = {
  error: feedback,
  warning: feedback,
  success: feedback,
  info: feedback,
};

function colors<Key extends string | number>(keys: readonly Key[]) {
  return Object.fromEntries(keys.map((key) => [key, "#ffffff"])) as Record<
    Key,
    string
  >;
}

export const theme = resolveTheme({
  hue: {
    accent: "$hue.blue",
    interactive: "$hue.blue",
    neutral: "$hue.gray",
    blue: colors(HueStep.literals),
    gray: colors(HueStep.literals),
  },
  categorical: ["blue"],
  text: {
    base: "#ffffff",
    muted: "#aaaaaa",
    action: actions,
    formfield: action,
    feedback: kinds,
  },
  background: {
    base: "#101010",
    raised: { base: "#202020", high: "#303030", max: "#404040" },
    action: actions,
    formfield: action,
    feedback: kinds,
  },
  border: { base: "#808080" },
  scrollbar: { base: "#808080" },
  diff: {
    text: {
      added: "#ffffff",
      removed: "#ffffff",
      context: "#ffffff",
      hunkHeader: "#ffffff",
    },
    background: { added: "#101010", removed: "#101010", context: "#101010" },
    highlight: { added: "#202020", removed: "#202020" },
    lineNumber: {
      text: "#808080",
      background: { added: "#101010", removed: "#101010" },
    },
  },
  syntax: colors(SyntaxToken.literals),
  markdown: colors(MarkdownToken.literals),
});
