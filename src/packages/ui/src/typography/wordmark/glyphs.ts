// The wordmark's block alphabet: 24×42 units per letter on a 30-unit pitch, drawn on a 6-unit grid.
// Every surface that spells the product name (logo, splash wordmark, about page, new-session pin board)
// reads from this file, so renaming the product is a change here and nowhere else.

type Rect = readonly [x: number, y: number, width: number, height: number]

export type WordmarkGlyph = { body: string; weak: string }

const path = (rects: readonly Rect[]) =>
  rects.map(([x, y, width, height]) => `M${x} ${y}H${x + width}V${y + height}H${x}V${y}Z`).join("")

export const WORDMARK_TEXT = "focuscode"

export const WORDMARK_PITCH = 30

export const WORDMARK_LETTER_WIDTH = 24

export const WORDMARK_HEIGHT = 42

export const WORDMARK_WIDTH = (WORDMARK_TEXT.length - 1) * WORDMARK_PITCH + WORDMARK_LETTER_WIDTH

// `weak` is the counter face drawn behind the body, so it reads through the hole as a shadow.
export const WORDMARK_GLYPHS = {
  c: {
    body: path([
      [0, 6, 24, 6],
      [0, 6, 6, 30],
      [0, 30, 24, 6],
    ]),
    weak: path([[6, 18, 12, 12]]),
  },
  d: {
    body: path([
      [0, 6, 18, 6],
      [0, 6, 6, 30],
      [0, 30, 18, 6],
      [18, 0, 6, 36],
    ]),
    weak: path([[6, 18, 12, 12]]),
  },
  e: {
    body: path([
      [0, 6, 24, 6],
      [0, 6, 6, 30],
      [0, 18, 24, 6],
      [0, 30, 24, 6],
    ]),
    weak: path([[6, 24, 12, 6]]),
  },
  f: {
    body: path([
      [12, 0, 6, 36],
      [12, 0, 12, 6],
      [0, 12, 24, 6],
    ]),
    weak: path([[0, 18, 12, 12]]),
  },
  o: {
    body: path([
      [0, 6, 24, 6],
      [0, 6, 6, 30],
      [18, 6, 6, 30],
      [0, 30, 24, 6],
    ]),
    weak: path([[6, 18, 12, 12]]),
  },
  s: {
    body: path([
      [0, 6, 24, 6],
      [0, 12, 6, 6],
      [0, 18, 24, 6],
      [18, 24, 6, 6],
      [0, 30, 24, 6],
    ]),
    weak: path([
      [6, 12, 12, 6],
      [0, 24, 18, 6],
    ]),
  },
  u: {
    body: path([
      [0, 6, 6, 24],
      [0, 30, 24, 6],
      [18, 6, 6, 30],
    ]),
    weak: path([[6, 18, 12, 12]]),
  },
} satisfies Record<string, WordmarkGlyph>

export type WordmarkLetter = WordmarkGlyph & { cx: number; x: number }

// SAFETY: WORDMARK_TEXT is spelled from the alphabet this file defines, so every character is a glyph key.
export const WORDMARK_LETTERS: readonly WordmarkLetter[] = [...WORDMARK_TEXT].map((letter, index) => ({
  ...WORDMARK_GLYPHS[letter as keyof typeof WORDMARK_GLYPHS],
  cx: index * WORDMARK_PITCH + WORDMARK_LETTER_WIDTH / 2,
  x: index * WORDMARK_PITCH,
}))
