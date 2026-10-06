# Blocked-cell phone build changes

This fork adds a touch-friendly **Block cells** mode to Gomoku Calculator.

## What it does

- Tap the lock button to enter block mode.
- Tap an empty board intersection to mark it with an X.
- Tap a blocked intersection again to unblock it.
- The eraser button clears all blocked intersections.
- Blocked intersections cannot receive stones.
- Before each Rapfi search, the app sends the saved blocked coordinates using Rapfi's existing `YXBLOCK` protocol:
  - `YXBLOCKRESET`
  - `YXBLOCK x,y DONE`
- The supplied Rapfi source already implements `YXBLOCK` as a root-move filter, so no Rapfi C++ modification is required for this behavior.

## Important limitation

Rapfi's current `YXBLOCK` feature filters blocked cells from the **root move list**. It does not turn them into true WALL cells for evaluation. Therefore this patch guarantees that the AI will not choose a blocked cell as its move, but it does not change every pattern evaluator to treat the cell as a physical wall.

## Build

This repository snapshot does not contain the generated Rapfi WebAssembly files under `public/build`. Build/deploy the project with the normal Gomoku Calculator build process after placing the required Rapfi WASM artifacts in `public/build`.
