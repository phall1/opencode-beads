import type { Context } from "@opencode/plugin/tui/context";
import { createSignal } from "solid-js";
import { afterMouseDispatch } from "./mouse";

export function Action(props: {
  context: Context;
  id: string;
  label: string;
  run(): unknown;
  disabled?: boolean;
  primary?: boolean;
}) {
  const [hovered, setHovered] = createSignal(false);
  const click = afterMouseDispatch(() => {
    if (!props.disabled) return props.run();
  });
  const variant = () => (props.primary ? "primary" : "secondary");
  const state = () => (props.disabled ? "disabled" : "base");
  return (
    <text
      id={props.id}
      height={1}
      flexShrink={0}
      fg={props.context.theme.text.action[variant()][state()]}
      bg={
        hovered()
          ? props.context.theme.background.raised.high
          : props.context.theme.background.raised.base
      }
      onMouseOver={() => setHovered(true)}
      onMouseOut={() => setHovered(false)}
      onMouseDown={click}
    >
      {` ${props.label} `}
    </text>
  );
}
