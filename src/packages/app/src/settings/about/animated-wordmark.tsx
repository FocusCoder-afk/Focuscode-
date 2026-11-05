import { createEffect, For, on, onCleanup } from "solid-js"
import { createStore } from "solid-js/store"
import { prefersReducedMotion } from "@opencode/ui/motion"
import { WORDMARK_GLYPHS, WORDMARK_HEIGHT, WORDMARK_PITCH, WORDMARK_TEXT, WORDMARK_WIDTH } from "@opencode/ui/wordmark/glyphs"

const target = [...WORDMARK_TEXT]

const choices = [...new Set(target)]

type Letter = keyof typeof WORDMARK_GLYPHS

export function AnimatedWordmark(props: { active: boolean }) {
  const [state, setState] = createStore({ letters: [...target] })
  const timers = new Set<ReturnType<typeof setTimeout>>()

  createEffect(
    on(
      () => props.active,
      (active) => {
        timers.forEach(clearTimeout)
        timers.clear()

        if (!active || prefersReducedMotion()) {
          setState("letters", [...target])

          return
        }

        const starts = target.map(() => choices[Math.floor(Math.random() * choices.length)])
        const settles = target.map(() => 6 + Math.floor(Math.random() * 8))
        const last = Math.max(...settles)
        setState("letters", starts)

        Array.from({ length: last }, (_, index) => index + 1).forEach((tick) => {
          const timer = setTimeout(() => {
            setState(
              "letters",
              target.map((letter, index) =>
                tick >= settles[index] ? letter : choices[Math.floor(Math.random() * choices.length)],
              ),
            )
            timers.delete(timer)
          }, tick * 75)

          timers.add(timer)
        })
      },
    ),
  )

  onCleanup(() => timers.forEach(clearTimeout))

  // SAFETY: state.letters is only ever filled from choices, which is built from this alphabet.
  const glyph = (letter: string) => WORDMARK_GLYPHS[letter as Letter]

  return (
    <svg
      class="settings-about-wordmark"
      viewBox={`0 0 ${WORDMARK_WIDTH} ${WORDMARK_HEIGHT}`}
      aria-hidden="true"
      fill="currentColor"
    >
      <For each={state.letters}>
        {(letter, index) => (
          <g transform={`translate(${index() * WORDMARK_PITCH} 0)`}>
            <path class="settings-about-letter-shadow" d={glyph(letter).weak} />
            <path d={glyph(letter).body} />
          </g>
        )}
      </For>
    </svg>
  )
}
