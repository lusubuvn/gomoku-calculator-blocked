# Blocked cells patch

Added a phone-friendly blocked-cell mode to Gomoku Calculator.

### UI
- Lock/unlock button in the main toolbar.
- Tap an empty intersection while lock mode is active to toggle an X marker.
- Eraser button clears all blocked cells.

### State
- Blocked coordinates are stored with the current board.
- Stones cannot be placed on blocked cells.
- New game clears blocked cells.
- Rotate/flip/move operations transform blocked cells together with the board.

### Rapfi integration
- Before every AI search, the app sends `YXBLOCKRESET` and then one `YXBLOCK x,y DONE` command per blocked cell.
- This uses Rapfi's existing `SearchOptions::blockMoves` / `YXBLOCK` support.

### Validation
- `node --check src/store/modules/position.js` passed.
- `node --check src/store/modules/ai.js` passed.
- All locale JSON files parse successfully.

The ZIP intentionally does not include generated Rapfi WASM artifacts because the uploaded calculator source snapshot did not contain `public/build`, and this environment does not have Emscripten installed.
