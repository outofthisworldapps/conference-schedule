# 📅 Conference Schedule

An interactive, responsive static web application for viewing, managing, and editing multi-day conference schedules. Built for astronomical and scientific conferences (e.g., **Gravitational Lensing in Galaxy Clusters — Santander 2026** and **Charting Cosmic Dawn — Copenhagen 2026**).

---

## ✨ Features

* 🗓️ **All Week 5-Day View**: Displays 5 days side-by-side on wide screens with pixel-perfect alignment.
* 🔀 **Parallel Track Sessions**: Simultaneous overlapping sessions (e.g., Room A vs. Room B) automatically render side-by-side in sub-columns.
* ⏱️ **Inline Schedule & Time Editing**: Edit start times, end times, speaker names, and talk titles inline in place across both single-day and 5-day week views (supports typing `now` or pressing Enter for live time updates).
* 🏷️ **Category Color Swatches**: Color-coded category square swatches (Talks, Workshops, Breaks, Meals, TikTalks) with popover category pickers.
* 📂 **Multi-Conference Selector**: Toggle between different loaded conference datasets via the absolute **Open** dropdown.
* ⏱️ **Auto-Scroll to Earliest Event**: Automatically scrolls to the first event of the day upon loading.
* 🔄 **Full Undo / Redo & File I/O**: Supports `Cmd+Z` / `Cmd+Y` history tracking and instant JSON file loading/saving.

---

## 🚀 Quickstart

1. **Open directly in your browser**:
   ```bash
   open index.html
   ```

2. **Or serve via local HTTP server**:
   ```bash
   python3 -m http.server 8080
   ```
   Then navigate to `http://localhost:8080` in your web browser.

---

## 📁 Repository Documentation

* [CONFERENCE-SCHEDULE.md](CONFERENCE-SCHEDULE.md) — Detailed technical documentation, layout engine, data schemas, and operating mechanics
* [AGENTS.md](AGENTS.md) — System rules and guidelines for AI coding assistants

