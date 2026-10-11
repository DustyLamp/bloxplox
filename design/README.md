# Design artifacts

The runnable approved design lives in `../apps/prototype/`.

- `archive/bloxplox-v1.fragment.html` is the initial concept, retained for provenance. Its copy and styling are superseded.
- `archive/bloxplox-v2.fragment.html` is the exact final Codex fragment before standalone packaging. It includes its original embedded font data.
- `screenshots/standalone-desktop.png` and `screenshots/standalone-mobile.png` show the packaged prototype verified for this handoff.
- The remaining screenshots preserve useful interaction states from the original design reviews: swipe underlays, embossed results, available space, habit settings, scheduling and rearrangement.
- `tracker-list-earlier.png` and `habit-schedule-*.png` predate the last visual refinements. Current screen captures can be regenerated with `yarn test screens` and are saved under `test-results/`.

The original full preview wrappers depended on the Codex renderer; the standalone page replaces those wrappers. No new logo has been created yet.
