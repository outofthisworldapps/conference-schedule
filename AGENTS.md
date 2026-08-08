# Conference Schedule — Agent Guidelines & Repository Rules

This repository (`conference-schedule`) contains the static web application for viewing, managing, and editing conference schedules (e.g. Santander 2026, Copenhagen 2026).

---

## 1. Portfolio & Development Context

* **App Directory**: `/Users/dcoe/apps/conference-schedule`
* **GitHub Repository**: [https://github.com/outofthisworldapps/conference-schedule](https://github.com/outofthisworldapps/conference-schedule)
* **Portfolio Reference**: Refer to [APPS.md](file:///Users/dcoe/apps/APPS.md) for master portfolio allocation and deployment standards.
* **App Specifications & Mechanics**: Refer to [CONFERENCE-SCHEDULE.md](CONFERENCE-SCHEDULE.md) for complete technical architecture, layout algorithms, data schemas, and UI behavioral rules.
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
