# Conference Schedule — Technical Specification & Operating Mechanics

This document describes the internal data schema, layout mechanics, state management, UI components, and dataset conversion scripts for the **Conference Schedule** web application.

---

## 1. Data Schema & JSON Format

Each conference dataset (e.g., `santander2026.json`, `schedule.json`) follows this JSON structure:

```json
{
  "conference": {
    "id": "santander2026",
    "title": "JWST through Cluster Lenses",
    "subtitle": "Santander, Spain • 10–14 August 2026",
    "site": "https://sites.google.com/view/lensingsolareclipse26",
    "link": "https://docs.google.com/spreadsheets/d/..."
  },
  "scheduleData": [
    {
      "day": "Monday, August 10",
      "date": "2026-08-10",
      "events": [
        {
          "start": "08:45",
          "end": "09:00",
          "name": "Welcome / Open",
          "subtitle": "",
          "type": "session"
        },
        {
          "start": "09:00",
          "end": "09:30",
          "name": "Hakim Atek",
          "subtitle": "Invited Review — The High-z Universe",
          "type": "long-talk"
        }
      ]
    }
  ]
}
```

### Event Object Fields
* `start` (*string*): 24-hour start time (`HH:MM`).
* `end` (*string*): 24-hour end time (`HH:MM`).
* `name` (*string*): Speaker name or event title.
* `subtitle` (*string*): Talk title, session details, or room tag (e.g. `[Room A — VENUS] ...`).
* `type` (*string*): Event category type (`talk`, `long-talk`, `tiktalk`, `workshop`, `break`, `meal`, `social`, `session`).

---

## 2. Layout, Positioning & Component Mechanics

### Pixel-Perfect 5-Day Multi-Column Layout
* Wide viewports (`>= 900px`) render 5 day columns side-by-side (`0%` to `100%` width), setting `gutterWidth = 0`.
* Sticky header date labels pin at top inside `<header class="sticky-header">` while the grid body scrolls.
* Automatically scrolls to the earliest schedule entry of the day on load.

### Sub-Column Algorithm for Parallel Track Sessions
* Parallel track sessions (simultaneous events running concurrently on the same day, such as Room A and Room B) are detected via time overlap math (`item.startM < other.endM && item.endM > other.startM`).
* Overlapping events are grouped into clusters and assigned sub-column indices (`subColIdx`) and total cluster columns (`numCols`).
* Sub-column width per event is `calc((dayWidth / numCols) - gap)` and left offset is `calc(dayLeft + subColIdx * (dayWidth / numCols))`.

### Category Color Swatches & Popover Picker
* A compact color square swatch (`10px × 10px`) is placed at top-left before the start time tag (`8:45a`, `9:00a`).
* Hovering or clicking on the color square displays an absolute popover menu (`.type-options-popover`, `z-index: 2000`) to switch event categories.

### Toolbar Dropdown Overlay
* Clicking the **Open** button toggles an absolute overlay popover (`.conference-menu-popover`, `z-index: 3000`).
* Action buttons in the toolbar (`Undo`, `Redo`, `Now`, `Open`, `Load`, `Save`, `Zoom`) never shift position when opening the dropdown.

---

## 3. In-Place Inline Text & Time Editing (Real-Time Schedule Adjustments)

* **Inline Text & Title Editing**:
  * Title (`.speaker-name`) and Subtitle (`.talk-title`) are separate, independent `contenteditable` fields with `tabindex="0"`.
  * Users can `Tab` and `Shift+Tab` seamlessly between Title and Subtitle fields on any event card.
  * When first clicking or focusing a field, all text within it is automatically highlighted (selected) and copied to the system clipboard.
  * Pressing `Enter` applies and saves the updated text to `scheduleData` and records history for undo/redo (`Cmd+Z` / `Cmd+Y`).
  * Pressing `Escape` cancels editing and reverts the field text to whatever it was before.

* **Inline Time Editing (Single-Day & Week 5-Day Views)**:
  * Event start and end times display as clickable inline elements (`.inline-time-editor`) on every event card in both single-day and 5-day multi-column week views.
  * Clicking an inline time tag transforms it into an in-place `contenteditable` span without any browser `prompt()` pop-ups.
  * Pressing `Enter` saves the new `HH:MM` time. Typing `now` (or pressing `Enter` when blank) automatically sets the start time to the current clock time.
  * **Real-Time Schedule Cascading**: Adjusting an event's start time forward automatically cascades the delay to all subsequent sessions of the day while letting break/meal buffers absorb delays where possible.

---

## 4. Google Sheets Ingestion Workflow

To re-ingest or convert raw CSV schedule data from Google Sheets into `santander2026.json`:
1. Export spreadsheet rows as CSV.
2. Run `convert_santander.py` script.
3. Validate output JSON:
   ```bash
   python3 -m json.tool santander2026.json > /dev/null
   ```
