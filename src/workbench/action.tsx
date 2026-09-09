import type { Context } from "@opencode/plugin/tui/context";

export function Action(props: {
  context: Context;
  id: string;
  label: string;
  run(): unknown;
  disabled?: boolean;
  primary?: boolean;
}) {
  const variant = () => (props.primary ? "primary" : "secondary");
  const state = () => (props.disabled ? "disabled" : "default");
  return (
    <text
      id={props.id}
      height={1}
      flexShrink={0}
      fg={props.context.theme.text.action[variant()][state()]}
      bg={props.context.theme.background.surface.offset}
      onMouseDown={(event) => {
        if (event.button === 0 && !props.disabled) void props.run();
      }}
    >
      {` ${props.label} `}
    </text>
  );
}
