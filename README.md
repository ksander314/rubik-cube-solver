# Rubik's Cube Solver — step by step

An interactive, browser-based Rubik's cube solver. You paint your real cube's
colors onto a flat net, press **Solve**, and get a beginner-friendly,
move-by-move walkthrough. The on-screen cube updates as you step through, so you
can mirror each move on your physical cube.

## Run it

No build, no server. Just open the file in a browser:

```sh
open index.html        # macOS
```

## How to use

1. **Set your cube.** Pick a color, click stickers to paint each face.
   - The net is the standard unfold: **U** (up) on top, then **L F R B** in the
     middle row, **D** (down) at the bottom. The back face **B** is drawn as if
     you turned the cube to the right to look behind it.
   - Centers never move, so each center color is that face's true color. Keep the
     default centers unless your color scheme is different.
   - `Scramble` fills a random solvable cube; `Reset to solved` / `Clear` help too.
2. **Press Solve.** Invalid cubes are rejected with a clear reason (wrong sticker
   counts, an impossible single twist/flip, etc.).
3. **Follow along.** Hold the cube the way the banner says (same orientation the
   whole time). Use **Next / Prev**, **Auto-play**, or the arrow keys / space.

## Method

Classic beginner **layer-by-layer**: bottom cross → bottom corners → middle
layer → top cross → orient top corners → position top corners → position top
edges. Typical solution ~110 moves (longer than optimal, but every stage is
understandable and repeatable). Phases with no work for your particular cube are
skipped automatically.

## Code layout

```
cube.js     Cube model (cubie state), move engine, facelet <-> state I/O, validation.
solver.js   Layer-by-layer solver. Uses verified search over moves (cross) and over
            whole algorithms / "triggers" (everything else); every step is checked
            against the real engine, so it only ever emits correct sequences.
ui.js       Net editor, color input, validation messages, step-by-step playback.
index.html  Page structure.   style.css  Styling.
```

## Tests

Both engines self-test from the command line:

```sh
node cube.js     # 34 checks: move tables, facelet round-trip, solvability rules
node solver.js   # solves 2000 random scrambles, asserts each ends solved
```
