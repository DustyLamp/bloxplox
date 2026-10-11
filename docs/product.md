# Product and interaction decisions

## Layout and visual language

- Blocks is the schedule. Tracker is the habit view. Both are directly accessible from the main screen.
- One global Grid/List setting controls both views and remains selected when switching tabs. Persistence across app restarts belongs to the production implementation.
- Chronological blocks occupy space proportional to their duration. Keep the screen filled with colour, small seams, and rounded outside corners.
- Poppins, bold weights, ordinary sentence casing. No slogans, motivational copy, or explanatory filler.
- Categories are separately managed, trackable entities. A block can contain several activities and categories; categories determine its colours.
- Available space is neutral grey, in a different shade from completed blocks.
- The date selector supports a calendar, previous day, and next day. A block's title is its name; its date belongs in settings.

## Blocks

- Add a name, start time, duration, and categories. Add a category from a block or the category catalog.
- Resize using the seam; following blocks move where necessary.
- Press and hold for approximately 350 ms to lift a block, then drag. Show a floating preview and an insertion cue.
- Desktop hover/focus reveals a discreet grip for immediate dragging. Arrow keys work on the grip; clicking it opens a position picker.
- Block settings provide “Move within day” for precise placement, “Move to tomorrow,” and “Add to backlog.”
- Dropping into Available snaps to a 15-minute slot. Reordering preserves unrelated gaps and pushes following blocks when needed.
- An overlap offers push following blocks, find another time, edit the new block, merge activities, or backlog placement as applicable.
- Completed blocks have a grey surface, green inset text, and a large green, slightly sunken check. Explicitly not done has the equivalent red text and cross. These embossed styles apply only to Blocks.

## Swipe semantics from RealTracker

| Current state | Swipe right | Swipe left |
| --- | --- | --- |
| Unrecorded | Done | Not done |
| Done | Clear | Not done |
| Not done | Done | Clear |

The card follows the finger and exposes the action underneath. Completion reveals green with a white check; not done reveals red with a white cross; clearing reveals grey with a broom. Use icons, not labels. The inner moving edge is square; the outside corners remain rounded. The white check/cross also has the sunken treatment. Further dragging reveals more of the action.

## Tracker

Preserve RealTracker's habit management structure: binary and numeric habits, a target and unit, active state, weekdays, reminder settings, direct numeric entry, result actions, skip/unskip, and statistics screens. Tracker cards retain the original mint/pink/blue-grey status colours. The latest requested typography is Poppins in normal case rather than RealTracker's uppercase Raleway.

## Shared history

- Horizontally scroll in both directions, with more days appearing at either end.
- Show aggregate completion for blocks and habits. A linked habit/block pair counts once.
- Individual green fills have rounded top corners, square bottoms, and a small gap between fills.
- The surrounding strip is continuous and flat. Date labels sit directly on its background, without grey badges.
- The selected day has a complete white outline, rounded at the top and square at the bottom.
- Completing, marking not done, and clearing update that day's green fill in both tabs.

## Habit scheduling

- Link a habit to an existing block or schedule it as a new block.
- Support once, daily, selected weekdays/X times per week, every N days, and monthly by day of month. Allow an end date.
- Specify start time, duration, category, and conflict handling (push following or next available).
- A monthly date beyond the end of a month clamps to that month's last day.
- Linked completion changes appear in both views. Moving an occurrence changes that occurrence; editing the recurrence is a separate action.
- Tracker shows the scheduled time and recurrence indicator.

## Backlog and reporting

The intended backlog is ordered. Items can be assigned dates, added to today, or allowed to roll forward automatically. Production reporting should compute time spent per category over a selected period, including activities such as German over three months. The prototype includes these screens; see the handoff for which behaviours remain illustrative.
