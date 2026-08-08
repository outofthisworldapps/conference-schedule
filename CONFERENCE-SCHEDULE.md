# Conference Schedule — Technical Specification & Operating Mechanics

This document describes the internal data schema, layout mechanics, state management, and dataset conversion scripts for the **Conference Schedule** web application.

---

## 1. Data Schema & JSON Format

Each conference dataset (e.g., `santander2026.json`, `schedule.json`) follows this JSON structure:

```json
{
  "conference": {
    "id": "santander2026",
    "title": "Gravitational Lensing in Galaxy Clusters",
    "subtitle": "Santander, Spain • 10–14 August 2026",
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

## 2. Layout & Positioning Mechanics

### 5-Day Multi-Column View
* On viewports `>= 900px`, `selectedDay === 'all'` sets `gutterWidth = 0`.
* Each of the 5 days occupies an equal `20%` width column (`0%`, `20%`, `40%`, `60%`, `80%`).
* Timeline headers pin to the top of `<header class="sticky-header">` while the grid timeline scrolls vertically.

### Sub-Column Algorithm for Parallel Track Sessions
* Parallel track sessions (events running concurrently on the same day, such as Room A and Room B) are detected via time overlap math (`item.startM < other.endM && item.endM > other.startM`).
* Overlapping events are grouped into clusters and assigned sub-column indices (`subColIdx`) and total cluster columns (`numCols`).
* Sub-column width per event is `calc((dayWidth / numCols) - gap)` and left offset is `calc(dayLeft + subColIdx * (dayWidth / numCols))`.

---

## 3. In-Place Inline Text Editing & Undo State

* Speaker names and talk descriptions are rendered in a single unified container (`.event-card-text`) with `contenteditable="true"`.
* On focus, `handleInlineFocus` snapshots the current event state.
* On blur or `Cmd+Enter`, `handleInlineBlur` parses the updated `.speaker-name` and `.talk-title` child elements, updates `scheduleData`, and pushes an entry to `history.push()`.
* Supports `Cmd+Z` (Undo) and `Cmd+Y` / `Cmd+Shift+Z` (Redo).

---

## 4. Google Sheets Ingestion Workflow

To re-ingest or convert raw CSV schedule data from Google Sheets into `santander2026.json`:
1. Export spreadsheet rows as CSV.
2. Run `convert_santander.py` script.
3. Validate output JSON:
   ```bash
   python3 -m json.tool santander2026.json > /dev/null
   ```
