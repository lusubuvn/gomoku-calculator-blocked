# Blocked cells / Khóa ô

This version keeps the original Gomoku Calculator web app structure and adds a touch-friendly blocked-cell mode.

## Added behavior

- A lock/unlock button is added to the main game toolbar.
- In lock mode, tapping an empty intersection toggles a blocked `X` marker.
- Blocked intersections cannot receive stones.
- An eraser button clears all blocked intersections.
- Starting a new game clears blocked intersections.
- Rotate/flip/move operations transform blocked intersections together with the position.
- Before Rapfi analysis, the app sends `YXBLOCKRESET` followed by `YXBLOCK x,y DONE` for every blocked intersection.

## Engine behavior

Rapfi's existing `YXBLOCK` mechanism is used as a root-move filter. This ensures a blocked intersection is not selected as the engine's next move. It does not turn the intersection into a physical wall for every evaluation pattern inside the engine.

## Build

Use the normal Gomoku Calculator build process from the original README. The source changes are confined to the board UI, position store, AI store, and translations.
