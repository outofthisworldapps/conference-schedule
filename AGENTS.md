# Conference Schedule — Agent Guidelines & Repository Rules

This repository (`conference-schedule`) contains the static web application for viewing, managing, and editing conference schedules (e.g. Santander 2026, Copenhagen 2026).

---

## 1. Portfolio & Development Context

* **App Directory**: `/Users/dcoe/apps/conference-schedule`
* **GitHub Repository**: [https://github.com/outofthisworldapps/conference-schedule](https://github.com/outofthisworldapps/conference-schedule)
* **Portfolio Guide Reference**: Refer to [~/apps/APPS.md](file:///Users/dcoe/apps/APPS.md) for master portfolio allocation and deployment standards.
* **Tech Stack**: Static Web Application (Vanilla HTML5, CSS3, JavaScript ES6+, JSON Datasets).

---

## 2. Commit & GitHub Deployment Protocol

Whenever completing requested features, fixes, or schedule updates, always commit and push the changes to GitHub according to the portfolio standard:

1. **Verify Code & Data**:
   - Ensure all JSON datasets (`santander2026.json`, `schedule.json`) are valid JSON using `python3 -m json.tool`.
   - Verify zero console errors or broken syntax in `app.js` and `style.css`.

2. **Git Commit & Push**:
   - Run the standard commit and push workflow:
     ```bash
     git add -A
     git commit -m "Conference Schedule v$(date '+%Y-%m-%d %H:%M') — <short description of changes>"
     git push
     ```

---

## 3. UI, Architecture & Behavioral Rules

1. **Pixel-Perfect 5-Day Multi-Column Layout**:
   - Wide viewports (`>= 900px`) render 5 day columns side-by-side (`0%` to `100%` width).
   - Sticky header date labels pin at top while timeline body scrolls.
   - Auto-scroll to earliest schedule entry on load.

2. **Parallel Sessions Support**:
   - Simultaneous overlapping events (e.g. Room A and Room B) split column widths into sub-columns and render side-by-side.

3. **In-Place Editable Cards (`contenteditable`)**:
   - Speaker names and talk titles reside in a single continuous `.event-card-text` block (`contenteditable="true"`).
   - No pop-up `prompt()` dialogs, no red dashed outline boxes, and zero overlapping element boxes.
   - Blur / Meta+Enter auto-saves changes to `scheduleData` and records history for undo/redo (`Cmd+Z` / `Cmd+Y`).

4. **Category Swatch Indicator & Popover**:
   - Small color square swatch placed at top-left before event start time (`8:45a`, `9:00a`).
   - Hovering/clicking on the square reveals the absolute popover menu (`.type-options-popover`) to switch category types.

5. **Toolbar Open Dropdown Overlay**:
   - Clicking **Open** toggles an absolute overlay popover (`.conference-menu-popover`, `z-index: 3000`).
   - Toolbar action buttons (`Undo`, `Redo`, `Now`, `Open`, `Load`, `Save`, `Zoom`) must never shift position when opening the dropdown.
