import { createUniqueId, For, type ComponentProps } from "solid-js"
import { WORDMARK_HEIGHT, WORDMARK_LETTERS, WORDMARK_WIDTH } from "./glyphs"

// The splash wordmark keeps the historical 720-unit width, so a taller or longer name still fills the same box.
const SCALE = 720 / 234

export function Wordmark(
  props: Pick<ComponentProps<"svg">, "class"> & { fade?: boolean; muted?: boolean; outline?: boolean },
) {
  const mask = createUniqueId()
  const maskGradient = createUniqueId()
  const width = WORDMARK_WIDTH * SCALE
  const height = WORDMARK_HEIGHT * SCALE

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${width} ${height}`}
      fill="none"
      classList={{
        [props.class ?? ""]: !!props.class,
        "overflow-visible [&_path]:[vector-effect:non-scaling-stroke]": props.outline,
      }}
    >
      <g opacity={props.muted === false ? 1 : 0.6} class="[[data-color-scheme=dark]_&]:opacity-100">
        <g mask={props.fade === false ? undefined : `url(#${mask})`}>
          <g
            opacity={props.muted === false ? 1 : 0.16 * 0.7}
            fill={props.outline ? "none" : "currentColor"}
            stroke={props.outline ? "currentColor" : undefined}
            stroke-width={props.outline ? 1 : undefined}
          >
            <g transform={`scale(${SCALE})`}>
              <For each={WORDMARK_LETTERS}>
                {(letter) => (
                  <path pathLength={props.outline ? 1 : undefined} d={letter.body} transform={`translate(${letter.x} 0)`} />
                )}
              </For>
            </g>
          </g>
        </g>
      </g>
      <defs>
        <mask id={mask} style="mask-type:alpha" maskUnits="userSpaceOnUse" x="0" y="0" width={width} height={height}>
          <rect width={width} height={height} fill={`url(#${maskGradient})`} />
        </mask>
        <linearGradient
          id={maskGradient}
          x1={width / 2}
          y1={height * (68 / 129)}
          x2={width / 2}
          y2={height}
          gradientUnits="userSpaceOnUse"
        >
          <stop stop-color="white" stop-opacity="0.7" />
          <stop offset="1" stop-color="white" stop-opacity="0" />
        </linearGradient>
      </defs>
    </svg>
  )
}
