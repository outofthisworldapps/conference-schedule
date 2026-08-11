let currentView = 'calendar';
let selectedDay = '2026-04-14';
let scheduleData = [];
let currentHourHeight = 500;
let showSingleDaySessions = true;
let weekViewMode = 'talks'; // 'talks' or 'sessions'


const EVENT_TYPES = {
    'session': { label: 'Talk', color: '#54a0ff' },
    'tiktalk': { label: 'TikTalks', color: '#6c5ce7' },
    'long-talk': { label: 'Long Talk', color: '#00b894' },
    'break': { label: 'Break', color: '#8b4513' },
    'meal': { label: 'Meal', color: '#feca57' },
    'social': { label: 'Social', color: '#ff9f43' },
    'workshop': { label: 'Workshop', color: '#48dbfb' }
};

const history = {
    undoStack: [],
    redoStack: [],
    push() {
        this.undoStack.push(JSON.stringify(scheduleData));
        this.redoStack = [];
        this.updateButtons();
    },
    undo() {
        if (this.undoStack.length > 0) {
            this.redoStack.push(JSON.stringify(scheduleData));
            scheduleData = JSON.parse(this.undoStack.pop());
            renderSchedule();
            updateNowLine();
            this.updateButtons();
        }
    },
    redo() {
        if (this.redoStack.length > 0) {
            this.undoStack.push(JSON.stringify(scheduleData));
            scheduleData = JSON.parse(this.redoStack.pop());
            renderSchedule();
            updateNowLine();
            this.updateButtons();
        }
    },
    updateButtons() {
        document.getElementById('undo-btn').disabled = this.undoStack.length === 0;
        document.getElementById('redo-btn').disabled = this.redoStack.length === 0;
    }
};

async function init() {
    try {
        setupEventListeners();

        const urlParams = new URLSearchParams(window.location.search);
        const confParam = urlParams.get('conf');
        let initialFile = 'santander2026.json';
        if (confParam && (confParam.includes('copenhagen') || confParam.includes('schedule'))) {
            initialFile = 'schedule.json';
        }

        const select = document.getElementById('conference-select');
        if (select) {
            select.value = initialFile;
        }

        await loadConference(initialFile);
        
        setInterval(updateNowLine, 60000);
    } catch (error) {
        console.error('Error loading schedule:', error);
        document.body.innerHTML += '<div style="padding: 2rem; color: #ff6b6b;">Failed to load schedule data.</div>';
    }
}


async function loadAppVersion() {
    try {
        const response = await fetch(`version.json?t=${Date.now()}`);
        if (response.ok) {
            const data = await response.json();
            if (data && data.version) {
                const badgeEl = document.getElementById('app-version-badge');
                if (badgeEl) {
                    badgeEl.textContent = `v ${data.version}`;
                }
            }
        }
    } catch (err) {
        console.warn('Could not load version.json:', err);
    }
}

// Normalize events: compute `end` from `start + duration` (minutes) when `end` is absent.
function normalizeEvents(data) {
    (data || []).forEach(day => {
        (day.events || []).forEach(ev => {
            if (!ev.end && (ev.duration !== undefined || ev.durationMinutes !== undefined)) {
                const mins = parseInt(ev.duration ?? ev.durationMinutes, 10) || 0;
                ev.end = addMinutes(ev.start, mins);
            }
        });
    });
    return data;
}

async function loadConference(fileName, forceRefresh = false) {
    try {
        currentLoadedFile = fileName;
        await loadAppVersion();
        
        const savedZoom = localStorage.getItem('cs_zoom_level');
        if (savedZoom) {
            const parsedZoom = parseInt(savedZoom, 10);
            if (!isNaN(parsedZoom) && parsedZoom >= 80 && parsedZoom <= 1500) {
                currentHourHeight = parsedZoom;
            }
        }

        const savedSingleSessions = localStorage.getItem('cs_show_single_sessions');
        if (savedSingleSessions !== null) {
            showSingleDaySessions = savedSingleSessions === 'true';
        }
        const savedWeekMode = localStorage.getItem('cs_week_view_mode');
        if (savedWeekMode === 'talks' || savedWeekMode === 'sessions') {
            weekViewMode = savedWeekMode;
        }

        const localSavedData = forceRefresh ? null : loadScheduleFromLocalStorage(fileName);
        if (localSavedData) {
            scheduleData = ensureOrigTimes(localSavedData);
            // Always ensure conferenceConfig is populated
            if (!conferenceConfig) {
                conferenceConfig = {
                    id: fileName.replace('.json', ''),
                    link: 'https://docs.google.com/spreadsheets/d/1p3W5hhR0__uw-OXQKKvQCH5iqJExd2gtVdr9JRnWopk'
                };
            }
        } else {
            const response = await fetch(`${fileName}?t=${Date.now()}`);
            const data = await response.json();
            // Stash the conference metadata for use by the CSV refresh function.
            if (data.conference) conferenceConfig = data.conference;
            scheduleData = ensureOrigTimes(normalizeEvents(data.scheduleData || []));
            if (data.zoom && !savedZoom) {
                const jsonZoom = parseInt(data.zoom, 10);
                if (!isNaN(jsonZoom) && jsonZoom >= 80 && jsonZoom <= 1500) {
                    currentHourHeight = jsonZoom;
                }
            }
        }

        const savedDay = localStorage.getItem('cs_selected_day');
        if (savedDay && (savedDay === 'all' || scheduleData.some(d => d.date === savedDay))) {
            selectedDay = savedDay;
        } else {
            const isWideWindow = window.innerWidth >= 900;
            if (isWideWindow) {
                selectedDay = 'all';
            } else {
                const todayStr = new Date().toISOString().split('T')[0];
                const hasToday = scheduleData.some(d => d.date === todayStr);
                if (hasToday) {
                    selectedDay = todayStr;
                } else if (scheduleData.length > 0) {
                    selectedDay = scheduleData[0].date;
                }
            }
        }

        history.undoStack = [];
        history.redoStack = [];
        history.updateButtons();
        renderSchedule();

        const scrolledToNow = checkAndScrollToNowIfInProgram();
        if (!scrolledToNow) {
            setTimeout(scrollToEarliestEvent, 100);
        }
    } catch (err) {
        console.error('Failed to load conference JSON:', err);
    }
}

// ---------------------------------------------------------------------------
// Google Sheets live-sync
// ---------------------------------------------------------------------------

// Parse a raw CSV line, respecting double-quoted fields (may contain commas/newlines).
function parseCSVLine(line) {
    const fields = [];
    let cur = '', inQuote = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (inQuote) {
            if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
            else if (ch === '"') { inQuote = false; }
            else { cur += ch; }
        } else {
            if (ch === '"') { inQuote = true; }
            else if (ch === ',') { fields.push(cur.trim()); cur = ''; }
            else { cur += ch; }
        }
    }
    fields.push(cur.trim());
    return fields;
}

// Day-header patterns like "MONDAY · 10 August" or "THURSDAY · 13 August — Room A..."
const DAY_HEADER_RE = /^(MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY|SATURDAY|SUNDAY)/i;
const MONTH_NAMES = ['January','February','March','April','May','June',
                     'July','August','September','October','November','December'];

function parseDayHeader(text) {
    // Extract day-of-week and "10 August" → date string
    const m = text.match(/(\d{1,2})\s+(\w+)/);
    if (!m) return null;
    const dayNum = parseInt(m[1], 10);
    const monthIdx = MONTH_NAMES.findIndex(mn => m[2].toLowerCase().startsWith(mn.toLowerCase()));
    if (monthIdx === -1) return null;
    // Infer year from conference config (fall back to current year)
    const year = conferenceConfig ? new Date(conferenceConfig.date || Date.now()).getFullYear() : new Date().getFullYear();
    const date = new Date(year, monthIdx, dayNum);
    const yyyy = date.getFullYear();
    const mm   = String(date.getMonth() + 1).padStart(2, '0');
    const dd   = String(date.getDate()).padStart(2, '0');
    // Human-readable day string
    const dayNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    return {
        day:  `${dayNames[date.getDay()]}, ${MONTH_NAMES[monthIdx]} ${dayNum}`,
        date: `${yyyy}-${mm}-${dd}`
    };
}

// Map spreadsheet Type column → our internal event type.
function sheetTypeToEventType(typeVal, speakerVal) {
    const t = (typeVal || '').toLowerCase();
    const s = (speakerVal || '').toLowerCase();
    if (t === 'invited') return 'long-talk';
    if (t === 'talk')    return 'session';
    if (t === 'flash')   return 'tiktalk';
    if (t === 'discussion' || t === 'overview' || t === 'status') return 'workshop';
    if (t === 'session') return 'session';   // session-header row
    if (s.includes('coffee') || s.includes('lunch') || s.includes('dinner') || s.includes('buffet') || s.includes('break')) return 'break';
    if (s.includes('reception') || s.includes('excursion') || s.includes('eclipse') || s.includes('dinner')) return 'social';
    if (typeVal === '—' || typeVal === '-') {
        if (s.includes('coffee') || s.includes('lunch') || s.includes('dinner') || s.includes('buffet') || s.includes('open')) return 'break';
        if (s.includes('reception') || s.includes('excursion') || s.includes('eclipse')) return 'social';
    }
    return 'session';
}

// Normalise a time string like "9:00" → "09:00"
function normTime(t) {
    if (!t) return null;
    const parts = t.trim().split(':');
    if (parts.length !== 2) return null;
    return `${String(parseInt(parts[0], 10)).padStart(2, '0')}:${parts[1].padStart(2, '0')}`;
}

const ROOM_HEADER_RE = /^Room\s+[A-Z]:/i;

// Main CSV → scheduleData parser.
function parseGoogleSheetCSV(csvText) {
    // Split into lines while keeping quoted newlines intact.
    const lines = [];
    let cur = '', inQ = false;
    for (let i = 0; i < csvText.length; i++) {
        const ch = csvText[i];
        if (inQ) {
            if (ch === '"' && csvText[i+1] === '"') { cur += '"'; i++; }
            else if (ch === '"') { inQ = false; cur += ch; }
            else { cur += ch; }
        } else {
            if (ch === '"') { inQ = true; cur += ch; }
            else if (ch === '\n') { lines.push(cur); cur = ''; }
            else { cur += ch; }
        }
    }
    if (cur) lines.push(cur);

    // Pre-pass: collect non-empty data rows and resolve missing durations for parallel tracks.
    const rawRows = [];
    for (const rawLine of lines) {
        const line = rawLine.replace(/\r$/, '');
        if (!line.trim()) continue;

        const [timeRaw, durRaw, room, typeCol, speakerCol, titleCol] = parseCSVLine(line);

        // Skip fixed table header rows
        if (!timeRaw || timeRaw.toLowerCase() === 'time') continue;
        if (typeCol === 'Type' || speakerCol === 'Speaker') continue;

        rawRows.push({ timeRaw, durRaw, room, typeCol, speakerCol, titleCol });
    }

    const isSessionHeaderRow = r => (r.typeCol === 'Session') && r.speakerCol && !r.durRaw;

    // Resolve durations for parallel rows or missing duration entries
    for (let i = 0; i < rawRows.length; i++) {
        const r = rawRows[i];
        if (DAY_HEADER_RE.test(r.timeRaw) || ROOM_HEADER_RE.test(r.timeRaw)) continue;
        const startTime = normTime(r.timeRaw);
        if (!startTime) continue;

        if (isSessionHeaderRow(r)) {
            r.computedDur = 0;
            continue;
        }

        let dur = parseInt(r.durRaw, 10) || 0;
        if (dur === 0) {
            // Check if another row at the exact same startTime has an explicit duration
            const sameTimeNeighbor = rawRows.find((other, idx) => idx !== i && normTime(other.timeRaw) === startTime && parseInt(other.durRaw, 10) > 0);
            if (sameTimeNeighbor) {
                dur = parseInt(sameTimeNeighbor.durRaw, 10);
            } else {
                // Calculate duration to the next distinct start time on the same day
                let nextTime = null;
                for (let j = i + 1; j < rawRows.length; j++) {
                    const nextR = rawRows[j];
                    if (DAY_HEADER_RE.test(nextR.timeRaw) || ROOM_HEADER_RE.test(nextR.timeRaw)) break;
                    if (isSessionHeaderRow(nextR)) continue;
                    const nt = normTime(nextR.timeRaw);
                    if (nt && nt !== startTime) {
                        nextTime = nt;
                        break;
                    }
                }
                if (nextTime) {
                    dur = getMinutesDiff(nextTime, startTime);
                }
            }
        }
        r.computedDur = dur;
    }

    const daysMap = {};
    let currentDayDate = null;
    let currentDayObj = null;

    for (const r of rawRows) {
        // Day separator row e.g. "MONDAY · 10 August" or "THURSDAY · 13 August — Room A..."
        if (DAY_HEADER_RE.test(r.timeRaw)) {
            const parsed = parseDayHeader(r.timeRaw);
            if (parsed) {
                currentDayDate = parsed.date;
                if (!daysMap[currentDayDate]) {
                    daysMap[currentDayDate] = { day: parsed.day, date: parsed.date, events: [] };
                }
                currentDayObj = daysMap[currentDayDate];
            }
            continue;
        }

        // Room block header row (e.g. "Room B: SLICE team meeting") on the same day
        if (ROOM_HEADER_RE.test(r.timeRaw)) {
            continue;
        }

        if (!currentDayObj) continue;

        const startTime = normTime(r.timeRaw);
        if (!startTime) continue;

        const isSessionHeader = isSessionHeaderRow(r);
        const durMins = isSessionHeader ? 0 : (r.computedDur || 0);
        const endTime = durMins > 0 ? addMinutes(startTime, durMins) : startTime;

        const rawType = r.typeCol || '—';
        const evType = isSessionHeader ? 'session' : sheetTypeToEventType(rawType, r.speakerCol);

        let name, subtitle;
        if (evType === 'break' || evType === 'social' || evType === 'meal') {
            name     = r.speakerCol || rawType;
            subtitle = r.titleCol || '';
        } else {
            name     = r.speakerCol || '';
            // Prefix room tag for parallel sessions
            const roomTag = (r.room && r.room !== 'Plenary' && r.room !== '') ? `[${r.room}] ` : '';
            subtitle = roomTag + (r.titleCol || '');
        }

        const trimmedName = name.trim();
        const trimmedSub  = subtitle.trim();

        // Avoid duplicate coffee / lunch breaks when room blocks repeat shared breaks
        if (evType === 'break' || evType === 'meal') {
            const exists = currentDayObj.events.some(e => e.start === startTime && e.name === trimmedName && e.subtitle === trimmedSub);
            if (exists) continue;
        }

        currentDayObj.events.push({
            start:     startTime,
            end:       endTime,
            origStart: startTime,
            origEnd:   endTime,
            name:      trimmedName,
            subtitle:  trimmedSub,
            type:      evType
        });
    }

    const days = Object.values(daysMap);
    days.forEach(d => {
        d.events.sort((a, b) => getMinutesDiff(a.origStart || a.start, b.origStart || b.start));
    });

    return days;
}

// Pull conferenceConfig from the loaded JSON so the CSV parser can infer the year.
let conferenceConfig = null;

function ensureOrigTimes(data) {
    (data || []).forEach(day => {
        (day.events || []).forEach(ev => {
            if (!ev.origStart) ev.origStart = ev.start;
            if (!ev.origEnd) ev.origEnd = ev.end || ev.start;
        });
    });
    return data;
}

// Carry over delay values from the existing scheduleData into freshly-parsed days.
// Matches events by (date, originalStart) so any manual time-delays the user
// added are preserved across a live Google Sheets refresh.
function mergeDelaysFromExisting(parsedDays, existingData) {
    const delayMap = {};
    (existingData || []).forEach(day => {
        (day.events || []).forEach(ev => {
            const key = `${day.date}|${ev.origStart || ev.start}`;
            if (ev.delay) {
                delayMap[key] = ev.delay;
            }
        });
    });
    (parsedDays || []).forEach(day => {
        (day.events || []).forEach(ev => {
            const key = `${day.date}|${ev.origStart || ev.start}`;
            const saved = delayMap[key];
            if (saved) ev.delay = saved;
        });
    });
    return parsedDays;
}

function showToastNotification(message, durationMs = 3500) {
    let container = document.querySelector('.toast-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'toast-container';
        document.body.appendChild(container);
    }
    
    const toast = document.createElement('div');
    toast.className = 'toast-dialog';
    toast.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
        <span>${message}</span>
    `;
    container.appendChild(toast);
    
    // Trigger animation
    requestAnimationFrame(() => {
        toast.classList.add('show');
    });
    
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 400);
    }, durationMs);
}

async function refreshSpreadsheetData() {
    const btn = document.getElementById('refresh-sheet-btn');
    if (btn) {
        btn.classList.remove('success-green');
        btn.classList.add('spinning');
    }

    try {
        // Read the spreadsheet link from the already-loaded conference config.
        let sheetUrl = conferenceConfig && conferenceConfig.link;
        if (!sheetUrl) {
            sheetUrl = 'https://docs.google.com/spreadsheets/d/1p3W5hhR0__uw-OXQKKvQCH5iqJExd2gtVdr9JRnWopk';
        }
        const cleanSheetUrl = sheetUrl.replace(/\/edit.*$/, '').replace(/\/*$/, '');
        const csvUrl = cleanSheetUrl + '/export?format=csv&t=' + Date.now();

        const resp = await fetch(csvUrl);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const csvText = await resp.text();

        const parsed = parseGoogleSheetCSV(csvText);
        if (!parsed || parsed.length === 0) throw new Error('No schedule data parsed from sheet');

        // Preserve any delays the user added before overwriting scheduleData.
        mergeDelaysFromExisting(parsed, scheduleData);
        scheduleData = parsed;

        // Clear localStorage so the parsed-from-sheet data becomes the working copy.
        const cacheKey = `cs_schedule_data_${currentLoadedFile}`;
        localStorage.removeItem(cacheKey);

        history.undoStack = [];
        history.redoStack = [];
        history.updateButtons();
        renderSchedule();
        const scrolledToNow = checkAndScrollToNowIfInProgram();
        if (!scrolledToNow) setTimeout(scrollToEarliestEvent, 100);

        if (btn) {
            btn.classList.remove('spinning');
            btn.classList.add('success-green');
            setTimeout(() => btn.classList.remove('success-green'), 2000);
        }

        showToastNotification(`Reloaded <a href="${cleanSheetUrl}" target="_blank">${cleanSheetUrl}</a>`, 4000);
    } catch (err) {
        if (btn) btn.classList.remove('spinning');
        console.error('Refresh from Google Sheet failed:', err);
        alert('Could not fetch from Google Sheets. Check that the sheet is publicly shared (anyone with link can view).');
    }
}

function scrollToEarliestEvent() {
    const startHour = 7;
    const hourHeight = currentHourHeight;
    let earliestMinutes = 24 * 60;
    
    const daysToCheck = selectedDay === 'all' ? scheduleData : scheduleData.filter(d => d.date === selectedDay);
    daysToCheck.forEach(d => {
        if (!d.events) return;
        d.events.forEach(e => {
            const timeVal = e.start || "09:00";
            const [h, m] = timeVal.split(':').map(Number);
            const mins = h * 60 + m;
            if (mins < earliestMinutes) earliestMinutes = mins;
        });
    });

    if (earliestMinutes < 24 * 60) {
        const topPx = (earliestMinutes - startHour * 60) * (hourHeight / 60);
        const grid = document.getElementById('calendar-grid');
        const header = document.querySelector('.sticky-header');
        const headerHeight = header ? header.offsetHeight : 0;

        if (grid) {
            const gridTop = grid.getBoundingClientRect().top + window.scrollY;
            const targetY = Math.max(0, gridTop + topPx - headerHeight - 15);
            window.scrollTo({
                top: targetY,
                behavior: 'smooth'
            });
        }
    }
}


function saveScheduleToLocalStorage() {
    try {
        localStorage.setItem('cs_zoom_level', currentHourHeight);
        localStorage.setItem('cs_show_single_sessions', showSingleDaySessions);
        localStorage.setItem('cs_week_view_mode', weekViewMode);
        if (scheduleData && scheduleData.length > 0) {
            const key = `cs_schedule_data_${currentLoadedFile}`;
            localStorage.setItem(key, JSON.stringify(scheduleData));
        }
    } catch (e) {
        console.warn('Could not save schedule data to localStorage:', e);
    }
}

function loadScheduleFromLocalStorage(fileName) {
    try {
        const key = `cs_schedule_data_${fileName}`;
        const saved = localStorage.getItem(key);
        if (saved) {
            const parsed = JSON.parse(saved);
            if (Array.isArray(parsed) && parsed.length > 0) {
                return parsed;
            }
        }
    } catch (e) {
        console.warn('Could not load schedule data from localStorage:', e);
    }
    return null;
}

function checkAndScrollToNowIfInProgram() {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const todayData = scheduleData.find(d => d.date === todayStr);
    
    if (!todayData || !todayData.events || todayData.events.length === 0) {
        return false;
    }

    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    
    let programStart = 24 * 60;
    let programEnd = 0;

    todayData.events.forEach(e => {
        if (e.start) {
            const [sh, sm] = e.start.split(':').map(Number);
            const startMins = sh * 60 + sm;
            if (startMins < programStart) programStart = startMins;
            
            let endMins = startMins + (e.durationMinutes || 15);
            if (e.end) {
                const [eh, em] = e.end.split(':').map(Number);
                endMins = eh * 60 + em;
            }
            if (endMins > programEnd) programEnd = endMins;
        }
    });

    if (currentMinutes >= programStart && currentMinutes <= programEnd) {
        scrollToNow();
        return true;
    }
    
    return false;
}

function setupEventListeners() {
    const refreshBtn = document.getElementById('refresh-sheet-btn');
    if (refreshBtn) refreshBtn.addEventListener('click', refreshSpreadsheetData);


    document.getElementById('undo-btn').addEventListener('click', () => history.undo());
    document.getElementById('redo-btn').addEventListener('click', () => history.redo());
    document.getElementById('save-btn').addEventListener('click', saveSchedule);
    document.getElementById('load-btn').addEventListener('click', () => document.getElementById('file-input').click());
    document.getElementById('file-input').addEventListener('change', loadSchedule);
    document.getElementById('now-btn').addEventListener('click', scrollToNow);


    document.addEventListener('keydown', (e) => {
        const isCmdOrCtrl = e.metaKey || e.ctrlKey;
        const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
        const isEditable = document.activeElement && (document.activeElement.isContentEditable || activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select');

        if (!isEditable && !isCmdOrCtrl) {
            const keyLower = e.key.toLowerCase();
            if (keyLower === 'w') {
                setSelectedDay('all');
                return;
            }
            if (['1', '2', '3', '4', '5'].includes(e.key)) {
                const dayIdx = parseInt(e.key, 10) - 1;
                if (scheduleData && scheduleData[dayIdx]) {
                    setSelectedDay(scheduleData[dayIdx].date);
                }
                return;
            }
        }
        
        if (!isEditable && e.key.toLowerCase() === 't') {
            scrollToNow();
        }
        
        if (isCmdOrCtrl && e.key.toLowerCase() === 'z') {
            if (e.shiftKey) {
                history.redo();
            } else {
                history.undo();
            }
            e.preventDefault();
        }
        
        if (isCmdOrCtrl && e.key.toLowerCase() === 'y') {
            history.redo();
            e.preventDefault();
        }
        
        if (isCmdOrCtrl && e.key.toLowerCase() === 's') {
            saveSchedule();
            e.preventDefault();
        }

        if (isCmdOrCtrl && e.key.toLowerCase() === 'o') {
            document.getElementById('file-input').click();
            e.preventDefault();
        }
    });

    document.getElementById('calendar-grid').addEventListener('dblclick', (e) => {
        const grid = e.currentTarget.querySelector('div[style*="position: relative"]');
        if (!grid) return;
        
        if (e.target.closest('.calendar-event') || e.target.closest('.calendar-time-marker')) {
            return;
        }

        const rect = grid.getBoundingClientRect();
        const y = e.clientY - rect.top;
        
        const hourHeight = currentHourHeight;
        const startHour = 7;
        const minutesPerPixel = 60 / hourHeight;
        
        const minutesSinceStart = y * minutesPerPixel;
        const snappedMinutesSinceStart = Math.round(minutesSinceStart / 5) * 5;
        
        const totalMinutesSinceMidnight = (startHour * 60) + snappedMinutesSinceStart;
        const h = Math.floor(totalMinutesSinceMidnight / 60);
        const m = Math.floor(totalMinutesSinceMidnight % 60);
        const timeStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
        
        createEventAtTime(selectedDay, timeStr);
    });

    document.getElementById('zoom-slider').addEventListener('input', (e) => {
        currentHourHeight = parseInt(e.target.value);
        renderSchedule();
    });

    document.getElementById('calendar-grid').addEventListener('wheel', (e) => {
        // Handle zoom (Ctrl+Wheel or Cmd+Wheel)
        if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            
            // Focal point zoom logic
            const grid = e.currentTarget.querySelector('div[style*="position: relative"]');
            const rect = grid.getBoundingClientRect();
            const mouseY = e.clientY - rect.top;
            const minutesAtCursor = mouseY / (currentHourHeight / 60);

            const zoomSpeed = 0.002;
            const factor = Math.exp(-e.deltaY * zoomSpeed);
            
            const oldHeight = currentHourHeight;
            currentHourHeight = Math.min(1500, Math.max(80, Math.round(currentHourHeight * factor)));
            
            if (oldHeight !== currentHourHeight) {
                renderSchedule();
                
                // Adjust scroll to keep the time at the cursor position fixed
                const newMouseY = minutesAtCursor * (currentHourHeight / 60);
                const scrollDiff = newMouseY - mouseY;
                window.scrollBy(0, scrollDiff);
            }
        }
    }, { passive: false });
}

function saveSchedule() {
    const data = {
        zoom: Math.round(currentHourHeight),
        scheduleData: scheduleData
    };
    const blob = new Blob([JSON.stringify(data, null, 4)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'schedule.json';
    a.click();
    URL.revokeObjectURL(url);
}

function loadSchedule(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);
            if (data.scheduleData) {
                history.push();
                scheduleData = data.scheduleData;
                if (data.zoom) {
                    const parsedZoom = parseInt(data.zoom, 10);
                    if (!isNaN(parsedZoom) && parsedZoom >= 80 && parsedZoom <= 1500) {
                        currentHourHeight = parsedZoom;
                    }
                }
                renderSchedule();
                updateNowLine();
            }
        } catch (err) {
            alert('Error parsing JSON file');
            console.error(err);
        }
    };
    reader.readAsText(file);
    event.target.value = ''; // Reset for next time
}

function renderSchedule() {
    saveScheduleToLocalStorage();
    renderCalendarView();
    updateNowLine();
    const slider = document.getElementById('zoom-slider');
    if (slider) slider.value = currentHourHeight;
    const zoomDisplay = document.getElementById('zoom-value-display');
    if (zoomDisplay) zoomDisplay.textContent = `${Math.round(currentHourHeight)}px / hr`;
}

function esc(str) {
    if (!str) return "";
    return str.toString()
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function addMinutes(timeStr, minutes) {
    if (!minutes) return timeStr;
    const [h, m] = timeStr.split(':').map(Number);
    const date = new Date(2000, 0, 1, h, m + minutes);
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function timeToMinutes(timeStr) {
    if (!timeStr) return 0;
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + m;
}

function getMinutesDiff(timeStr1, timeStr2) {
    const [h1, m1] = timeStr1.split(':').map(Number);
    const [h2, m2] = timeStr2.split(':').map(Number);
    return (h1 * 60 + m1) - (h2 * 60 + m2);
}


function formatTime(timeStr) {
    if (!timeStr) return '';
    const [h, m] = timeStr.split(':').map(Number);
    const period = h < 12 ? 'a' : 'p';
    const displayH = h % 12 || 12;
    return `${displayH}:${m < 10 ? '0' : ''}${m}${period}`;
}

function isBufferEvent(event) {
    const name = event.name || event.title || "";
    const type = event.type || "";
    return type === 'break' || 
           name.toLowerCase().includes('break') || 
           name.toLowerCase().includes('lunch') || 
           name.toLowerCase().includes('dinner') ||
           name.toLowerCase().includes('buffet');
}

// Compute per-event actual times for an entire day using a track-aware delay cascade.
// Algorithm:
//   1. Assign each non-buffer event to a "track" using greedy interval scheduling on BASE times (origStart/origEnd)
//      (first available track whose last event ended ≤ this event's origStart).
//      Buffer events (breaks/lunch) are shared — they receive the max delay from all tracks.
//   2. Cascade delays independently per track; buffer events merge all tracks' delays.
// Returns an array of { actualStart, actualEnd } indexed by event order.
function computeTrackAwareEventTimes(events) {
    const trackEnds = [];          // original end-minute per track
    const eventTrack = [];         // track index per event (-1 = shared buffer)

    for (let i = 0; i < events.length; i++) {
        const e = events[i];
        const startM = timeToMinutes(e.origStart || e.start);
        const endM   = timeToMinutes(e.origEnd || e.end || e.start);
        if (isBufferEvent(e)) {
            eventTrack.push(-1);
            // After a shared buffer, all tracks logically reset to buffer's original end
            for (let t = 0; t < trackEnds.length; t++) trackEnds[t] = endM;
        } else {
            let assigned = -1;
            for (let t = 0; t < trackEnds.length; t++) {
                if (trackEnds[t] <= startM) { assigned = t; break; }
            }
            if (assigned === -1) { assigned = trackEnds.length; trackEnds.push(0); }
            eventTrack.push(assigned);
            trackEnds[assigned] = endM;
        }
    }

    const numTracks = Math.max(trackEnds.length, 1);
    const delays = new Array(numTracks).fill(0);
    const result = [];

    for (let i = 0; i < events.length; i++) {
        const e = events[i];
        const track = eventTrack[i];
        if (track === -1) {
            const maxDelay = delays.reduce((m, d) => Math.max(m, d), 0);
            const { actualStart, actualEnd, newDelay } = getEventTimes(e, maxDelay);
            for (let t = 0; t < delays.length; t++) delays[t] = newDelay;
            result.push({ actualStart, actualEnd });
        } else {
            const currentDelay = delays[track];
            const { actualStart, actualEnd, newDelay } = getEventTimes(e, currentDelay);
            
            // If this talk is delayed (e.g. e.delay > 0), the event immediately preceding it
            // (e.g. a break or previous talk) ran long or shifted to fill the gap up to actualStart.
            if (e.delay && e.delay > 0) {
                if (i > 0 && result[i - 1]) {
                    result[i - 1].actualEnd = actualStart;
                }
            }

            delays[track] = newDelay;
            result.push({ actualStart, actualEnd });
        }
    }
    return result;
}

// Compute the incoming cumulative delay for the event at `upToIndex`, using track-aware cascade.
function getParallelAwareCumulativeDelay(events, upToIndex) {
    if (upToIndex <= 0) return 0;

    const trackEnds = [];
    const eventTrack = [];
    for (let i = 0; i < events.length; i++) {
        const e = events[i];
        const startM = timeToMinutes(e.origStart || e.start);
        const endM   = timeToMinutes(e.origEnd || e.end || e.start);
        if (isBufferEvent(e)) {
            eventTrack.push(-1);
            for (let t = 0; t < trackEnds.length; t++) trackEnds[t] = endM;
        } else {
            let assigned = -1;
            for (let t = 0; t < trackEnds.length; t++) {
                if (trackEnds[t] <= startM) { assigned = t; break; }
            }
            if (assigned === -1) { assigned = trackEnds.length; trackEnds.push(0); }
            eventTrack.push(assigned);
            trackEnds[assigned] = endM;
        }
    }

    const numTracks = Math.max(trackEnds.length, 1);
    const delays = new Array(numTracks).fill(0);

    for (let i = 0; i < upToIndex; i++) {
        const e = events[i];
        const track = eventTrack[i];
        if (track === -1) {
            const maxDelay = delays.reduce((m, d) => Math.max(m, d), 0);
            const { newDelay } = getEventTimes(e, maxDelay);
            for (let t = 0; t < delays.length; t++) delays[t] = newDelay;
        } else {
            const { newDelay } = getEventTimes(e, delays[track]);
            delays[track] = newDelay;
        }
    }

    const targetTrack = eventTrack[upToIndex];
    if (targetTrack === -1) {
        return delays.reduce((m, d) => Math.max(m, d), 0);
    }
    return delays[targetTrack] || 0;
}

function getEventTimes(event, currentDelay) {
    const originalStart = event.origStart || event.start;
    let originalEnd = event.origEnd || event.end;
    if (!originalEnd) {
        const durMins = parseInt(event.duration ?? event.durationMinutes ?? 0, 10) || 0;
        originalEnd = durMins > 0 ? addMinutes(originalStart, durMins) : originalStart;
    }
    
    const manualDelay = event.delay || 0;
    const effectiveDelay = currentDelay + manualDelay;
    
    const actualStart = addMinutes(originalStart, effectiveDelay);

    let actualEnd;
    if (isBufferEvent(event)) {
        // Break starts at actualStart, but absorbs delay by ending at originalEnd if possible
        const actStartM = timeToMinutes(actualStart);
        const origEndM = timeToMinutes(originalEnd);
        actualEnd = actStartM > origEndM ? actualStart : originalEnd;
    } else {
        // Standard event maintains its duration, shifted by the effective delay
        actualEnd = addMinutes(originalEnd, effectiveDelay);
    }
    
    const newDelay = getMinutesDiff(actualEnd, originalEnd);
    return { actualStart, actualEnd, newDelay };
}

let activeTimeBefore = null;
let isInlineTimeCanceled = false;

function handleInlineTimeFocus(e, date, index, type) {
    const day = scheduleData.find(d => d.date === date);
    if (!day) return;
    const event = day.events[index];
    if (!event) return;

    isInlineTimeCanceled = false;
    const cumulativeDelayBefore = getParallelAwareCumulativeDelay(day.events, index);
    const { actualStart, actualEnd } = getEventTimes(event, cumulativeDelayBefore);
    activeTimeBefore = (type === 'end') ? actualEnd : actualStart;

    const now = new Date();
    const nowStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    e.target.innerText = formatTime(nowStr);

    setTimeout(() => {
        const sel = window.getSelection();
        if (sel) {
            const range = document.createRange();
            const textNode = e.target.firstChild;
            if (textNode && textNode.nodeType === Node.TEXT_NODE) {
                const offset = Math.max(0, textNode.nodeValue.length - 1);
                range.setStart(textNode, offset);
                range.setEnd(textNode, offset);
            } else {
                range.selectNodeContents(e.target);
                range.collapse(false);
            }
            sel.removeAllRanges();
            sel.addRange(range);
        }
    }, 0);
}

function parseAndNormalizeTimeInput(rawInput, referenceTime = null) {
    if (!rawInput) return null;
    let input = rawInput.trim().toLowerCase();
    if (input === 'now' || input === '') {
        const now = new Date();
        return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    }

    let isRefPM = false;
    if (referenceTime) {
        const [refH] = referenceTime.split(':').map(Number);
        if (refH >= 12) isRefPM = true;
    }

    // Handle standard H:MM or HH:MM with optional meridiem (e.g. 9:02a, 9:02am, 2:15p, 2:15pm)
    const twelveHourMatch = input.match(/^(\d{1,2}):(\d{2})\s*([ap](?:m)?)?$/);
    if (twelveHourMatch) {
        let hours = parseInt(twelveHourMatch[1], 10);
        const minutes = twelveHourMatch[2];
        const meridiem = twelveHourMatch[3];
        if (meridiem) {
            if (meridiem.startsWith('p') && hours < 12) hours += 12;
            if (meridiem.startsWith('a') && hours === 12) hours = 0;
        } else {
            if (hours < 12 && (isRefPM || hours <= 7)) {
                hours += 12;
            }
        }
        return `${String(hours).padStart(2, '0')}:${minutes}`;
    }

    // Handle digit-only or digit+meridiem formats without colon (e.g. 902a, 902am, 902, 1430, 215p)
    const compactMatch = input.match(/^(\d{3,4})\s*([ap](?:m)?)?$/);
    if (compactMatch) {
        const digits = compactMatch[1];
        const meridiem = compactMatch[2];
        let hours = parseInt(digits.length === 3 ? digits.slice(0, 1) : digits.slice(0, 2), 10);
        const minutes = digits.slice(-2);
        if (meridiem) {
            if (meridiem.startsWith('p') && hours < 12) hours += 12;
            if (meridiem.startsWith('a') && hours === 12) hours = 0;
        } else {
            if (hours < 12 && (isRefPM || hours <= 7)) {
                hours += 12;
            }
        }
        return `${String(hours).padStart(2, '0')}:${minutes}`;
    }

    // Standard HH:MM
    if (/^\d{1,2}:\d{2}$/.test(input)) {
        const parts = input.split(':');
        let hours = parseInt(parts[0], 10);
        if (hours < 12 && (isRefPM || hours <= 7)) {
            hours += 12;
        }
        return `${String(hours).padStart(2, '0')}:${parts[1]}`;
    }
    return null;
}

function handleInlineTimeBlur(e, date, index, type) {
    const day = scheduleData.find(d => d.date === date);
    if (!day) return;
    const event = day.events[index];
    if (!event) return;

    if (isInlineTimeCanceled) {
        e.target.innerText = formatTime(activeTimeBefore);
        activeTimeBefore = null;
        isInlineTimeCanceled = false;
        return;
    }

    const rawText = e.target.innerText.trim();
    const newTime = parseAndNormalizeTimeInput(rawText, activeTimeBefore);

    if (newTime && newTime !== activeTimeBefore) {
        history.push();
        const cumulativeDelayBefore = getParallelAwareCumulativeDelay(day.events, index);

        if (type === 'end') {
            const currentActualStart = getEventTimes(event, cumulativeDelayBefore).actualStart;
            const newDuration = getMinutesDiff(newTime, currentActualStart);
            const origStart = event.origStart || event.start;
            event.origEnd = addMinutes(origStart, Math.max(5, newDuration));
            event.end = event.origEnd;
        } else {
            const currentActualStart = getEventTimes(event, cumulativeDelayBefore).actualStart;
            const diff = getMinutesDiff(newTime, currentActualStart);
            event.delay = (event.delay || 0) + diff;
        }
        renderSchedule();
        updateNowLine();
    } else {
        // Reset text back to previous valid time if invalid input
        e.target.innerText = formatTime(activeTimeBefore);
    }
    activeTimeBefore = null;
}

function handleInlineTimeKeydown(e, date, index, type) {
    e.stopPropagation();
    if (e.key === 'Escape') {
        e.preventDefault();
        isInlineTimeCanceled = true;
        e.target.blur();
    } else if (e.key === 'Enter') {
        e.preventDefault();
        e.target.blur();
    }
}

let activeInlineFieldBefore = null;
let activeInlineFieldName = null;
let isInlineTextCanceled = false;
let isFirstFocus = false;

function selectAllText(el) {
    if (!el) return;
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
}

function copyTextToClipboard(text) {
    if (!text) return;
    const truncated = text.length > 35 ? text.substring(0, 32) + '...' : text;
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => {
            showToastNotification(`Copied to clipboard: "${esc(truncated)}"`, 2000);
        }).catch(err => {
            console.error('Clipboard copy failed:', err);
        });
    } else {
        try {
            const textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            showToastNotification(`Copied to clipboard: "${esc(truncated)}"`, 2000);
        } catch (e) {}
    }
}

function handleInlineFocus(e, date, index, field) {
    const day = scheduleData.find(d => d.date === date);
    if (!day) return;
    const event = day.events[index];
    if (!event) return;

    isInlineTextCanceled = false;
    activeInlineFieldName = field;
    activeInlineFieldBefore = field === 'name' 
        ? (event.name || event.title || "") 
        : (event.subtitle || event.description || "");
    isFirstFocus = true;

    const el = e.target;
    const textToCopy = el.innerText.trim();
    if (textToCopy) {
        copyTextToClipboard(textToCopy);
    }

    setTimeout(() => {
        selectAllText(el);
    }, 0);
}

function handleInlineMouseUp(e, date, index, field) {
    if (isFirstFocus) {
        isFirstFocus = false;
        e.preventDefault();
        selectAllText(e.target);
    }
}

function handleInlineBlur(e, date, index, field) {
    const day = scheduleData.find(d => d.date === date);
    if (!day) return;
    const event = day.events[index];
    if (!event) return;

    isFirstFocus = false;

    if (isInlineTextCanceled) {
        if (activeInlineFieldBefore !== null) {
            e.target.innerText = activeInlineFieldBefore;
        }
        activeInlineFieldBefore = null;
        activeInlineFieldName = null;
        isInlineTextCanceled = false;
        return;
    }

    const newText = e.target.innerText.trim();
    const oldText = activeInlineFieldBefore !== null 
        ? activeInlineFieldBefore 
        : (field === 'name' ? (event.name || "") : (event.subtitle || ""));

    if (newText !== oldText) {
        history.push();
        if (field === 'name') {
            event.name = newText;
        } else if (field === 'subtitle') {
            event.subtitle = newText;
        }
        renderSchedule();
    }

    activeInlineFieldBefore = null;
    activeInlineFieldName = null;
}

function handleInlineKeydown(e, date, index, field) {
    e.stopPropagation();
    if (e.key === 'Escape') {
        e.preventDefault();
        isInlineTextCanceled = true;
        e.target.blur();
    } else if (e.key === 'Enter') {
        e.preventDefault();
        e.target.blur();
    } else if (e.key === 'Tab') {
        const card = e.target.closest('.event-card-content') || e.target.closest('.calendar-event');
        if (card) {
            if (!e.shiftKey && field === 'name') {
                const subtitleEl = card.querySelector('.talk-title');
                if (subtitleEl) {
                    e.preventDefault();
                    subtitleEl.focus();
                }
            } else if (e.shiftKey && field === 'subtitle') {
                const nameEl = card.querySelector('.speaker-name');
                if (nameEl) {
                    e.preventDefault();
                    nameEl.focus();
                }
            }
        }
    }
}

function editStartTime(date, index) {
    const day = scheduleData.find(d => d.date === date);
    if (!day) return;
    const event = day.events[index];
    
    const cumulativeDelayBefore = getParallelAwareCumulativeDelay(day.events, index);
    
    const { actualStart } = getEventTimes(event, cumulativeDelayBefore);
    let newTimeInput = prompt(`Edit start time for "${event.name || event.title}" (Enter HH:MM or leave blank for 'now'):`, actualStart);
    
    const parsed = parseAndNormalizeTimeInput(newTimeInput, actualStart);
    if (parsed) {
        history.push();
        const currentActualStart = getEventTimes(event, cumulativeDelayBefore).actualStart;
        const diff = getMinutesDiff(parsed, currentActualStart);
        event.delay = (event.delay || 0) + diff;
        renderSchedule();
        updateNowLine();
    }
}

function editEndTime(date, index) {
    const day = scheduleData.find(d => d.date === date);
    if (!day) return;
    const event = day.events[index];
    
    const cumulativeDelayBefore = getParallelAwareCumulativeDelay(day.events, index);
    const effectiveDelay = Math.max(cumulativeDelayBefore, event.delay || 0);
    const currentActualEnd = addMinutes(event.origEnd || event.end || event.start, effectiveDelay);

    const newTimeInput = prompt(`Edit end time for "${event.name || event.title}" (HH:MM):`, currentActualEnd);
    const parsed = parseAndNormalizeTimeInput(newTimeInput, currentActualEnd);
    if (parsed) {
        history.push();
        const currentActualStart = getEventTimes(event, cumulativeDelayBefore).actualStart;
        const newDuration = getMinutesDiff(parsed, currentActualStart);
        const origStart = event.origStart || event.start;
        event.origEnd = addMinutes(origStart, Math.max(5, newDuration));
        event.end = event.origEnd;
        renderSchedule();
        updateNowLine();
    }
}

function deleteEvent(date, index) {
    const day = scheduleData.find(d => d.date === date);
    if (!day) return;
    const event = day.events[index];
    if (!event) return;
    
    if (confirm(`Are you sure you want to delete "${event.name || event.title}"?`)) {
        history.push();
        
        const prevBaseEnd = index > 0 
            ? (day.events[index - 1].end || day.events[index - 1].start) 
            : event.start;
        const deletedDuration = getMinutesDiff(event.end || event.start, event.start);

        day.events.splice(index, 1);

        // Fill freed space by shifting subsequent events or expanding next buffer/break event
        if (index < day.events.length) {
            let i = index;
            let currentBaseStart = prevBaseEnd;

            while (i < day.events.length) {
                const nextEv = day.events[i];
                if (isBufferEvent(nextEv)) {
                    if (i === index) {
                        nextEv.start = currentBaseStart;
                    } else {
                        nextEv.start = addMinutes(nextEv.start, -deletedDuration);
                    }
                    nextEv.delay = 0;
                    break;
                } else {
                    const evDuration = getMinutesDiff(nextEv.end || nextEv.start, nextEv.start);
                    if (i === index) {
                        nextEv.start = currentBaseStart;
                    } else {
                        nextEv.start = addMinutes(nextEv.start, -deletedDuration);
                    }
                    nextEv.end = addMinutes(nextEv.start, evDuration);
                    nextEv.delay = 0;
                    currentBaseStart = nextEv.end;
                    i++;
                }
            }
        }

        renderSchedule();
        updateNowLine();
    }
}

function changeEventType(date, index, newType) {
    const day = scheduleData.find(d => d.date === date);
    if (!day) return;
    const event = day.events[index];
    
    if (event.type !== newType) {
        history.push();
        event.type = newType;
        renderSchedule();
    }
}

function createEventAtTime(date, startTime) {
    const day = scheduleData.find(d => d.date === date);
    if (!day) return;
    
    const endTime = addMinutes(startTime, 30);
    
    const newEvent = {
        start: startTime,
        end: endTime,
        name: "New Event",
        subtitle: "",
        type: "session"
    };
    
    history.push();
    day.events.push(newEvent);
    day.events.sort((a, b) => getMinutesDiff(a.start, b.start));
    
    renderSchedule();
    
    const index = day.events.indexOf(newEvent);
    editEventName(date, index);
}

function getInferredType(event) {
    const displayName = event.name || event.title || "";
    const lowerName = displayName.toLowerCase();
    if (event.type && EVENT_TYPES[event.type]) return event.type;
    if (displayName.includes('TikTalks')) return 'tiktalk';
    if (lowerName.includes('lunch') || lowerName.includes('dinner') || lowerName.includes('buffet')) return 'meal';
    if (lowerName.includes('break')) return 'break';
    return event.type || 'session';
}

function isSessionHeaderEvent(event) {
    if (!event) return false;
    const durMins = parseInt(event.duration ?? event.durationMinutes ?? (event.start === event.end ? 0 : -1), 10);
    if (durMins === 0) return true;
    const displayName = event.name || event.title || "";
    const subTitle = event.subtitle || event.description || "";
    if (displayName.startsWith('S') && (subTitle.includes('Chair') || displayName.includes('·'))) {
        return true;
    }
    return false;
}

function toggleSingleDaySessions() {
    showSingleDaySessions = !showSingleDaySessions;
    saveScheduleToLocalStorage();
    renderSchedule();
}

function setWeekViewMode(mode) {
    if (weekViewMode !== mode) {
        weekViewMode = mode;
        saveScheduleToLocalStorage();
        renderSchedule();
    }
}

function renderCalendarView() {
    const navContainer = document.getElementById('day-nav-container');
    const gridContainer = document.getElementById('calendar-grid');
    const isAllDays = selectedDay === 'all';
    const dayIndex = isAllDays ? -1 : scheduleData.findIndex(d => d.date === selectedDay);
    const gutterWidth = isAllDays ? '48px' : '88px';
    gridContainer.style.setProperty('--gutter-width', isAllDays ? '48px' : '88px');

    const sessionToggleBtnHTML = isAllDays ? `
        <div class="view-mode-toggle">
            <button class="toggle-mode-btn ${weekViewMode === 'talks' ? 'active' : ''}" onclick="setWeekViewMode('talks')" title="Show individual talks in weekly grid">Talks</button>
            <button class="toggle-mode-btn ${weekViewMode === 'sessions' ? 'active' : ''}" onclick="setWeekViewMode('sessions')" title="Show session titles in weekly grid">Sessions</button>
        </div>
    ` : `
        <div class="view-mode-toggle">
            <button class="toggle-mode-btn ${showSingleDaySessions ? 'active' : ''}" onclick="toggleSingleDaySessions()" title="Toggle session names column on right">
                ${showSingleDaySessions ? 'Hide Sessions' : 'Show Sessions'}
            </button>
        </div>
    `;

    const colHeaderHTML = isAllDays ? `
        <div class="calendar-column-headers" style="display: flex; width: 100%; box-sizing: border-box; border-top: 1px solid var(--border-color); border-bottom: 1px solid var(--border-color); background: var(--bg-color); padding: 8px 0; padding-left: var(--gutter-width, 48px); margin-top: 6px;">
            ${scheduleData.map((d, i) => `
                <div class="col-header-item" style="flex: 1; text-align: center; font-weight: 700; font-size: 0.85rem; color: var(--text-primary); border-right: ${i < scheduleData.length - 1 ? '1px solid var(--border-color)' : 'none'}; box-sizing: border-box;">
                    ${d.day}
                </div>
            `).join('')}
        </div>
    ` : '';

    navContainer.innerHTML = `
        <div class="day-navigation">
            <button class="nav-arrow" onclick="prevDay()" ${isAllDays || dayIndex === 0 ? 'disabled' : ''}>&larr;</button>
            <div class="day-tabs">
                <div class="day-tab ${isAllDays ? 'active' : ''}" onclick="setSelectedDay('all')">
                    All Week
                </div>
                ${scheduleData.map(day => `
                    <div class="day-tab ${!isAllDays && day.date === selectedDay ? 'active' : ''}" onclick="setSelectedDay('${day.date}')">
                        ${day.day.split(',')[0]} ${day.day.split(' ')[2]}
                    </div>
                `).join('')}
            </div>
            <button class="nav-arrow" onclick="nextDay()" ${isAllDays || dayIndex === scheduleData.length - 1 ? 'disabled' : ''}>&rarr;</button>
            ${sessionToggleBtnHTML}
        </div>
        ${colHeaderHTML}
    `;

    const startHour = 7;
    const endHour = 22;
    const hourHeight = currentHourHeight; 
    const gridHeight = (endHour - startHour + 1) * hourHeight;
    const pixelsPerMinute = hourHeight / 60;
    
    gridContainer.style.height = `${gridHeight}px`;

    const eventsHTML = isAllDays ? 
        scheduleData.map((day, colIdx) => renderCalendarEvents(day.date, startHour, hourHeight, colIdx, scheduleData.length)).join('') :
        renderCalendarEvents(selectedDay, startHour, hourHeight, 0, 1);

    const dividersHTML = isAllDays ?
        scheduleData.map((_, i) => i > 0 ? `<div style="position: absolute; top: 0; bottom: 0; left: ${(i / scheduleData.length) * 100}%; width: 1px; background: rgba(255,255,255,0.08); z-index: 10;"></div>` : '').join('') : '';

    let sessionsSideColumnHTML = '';
    if (!isAllDays && showSingleDaySessions) {
        const dayData = scheduleData.find(d => d.date === selectedDay);
        if (dayData && dayData.events) {
            const trackTimes = computeTrackAwareEventTimes(dayData.events);
            const sessionCards = dayData.events.map((event, idx) => {
                if (!isSessionHeaderEvent(event)) return '';
                const { actualStart } = trackTimes[idx];
                const [sh, sm] = actualStart.split(':').map(Number);
                const top = ((sh - startHour) * 60 + sm) * pixelsPerMinute;
                
                // Find next session header or break/meal/social event to compute height
                let endActualStart = null;
                for (let j = idx + 1; j < dayData.events.length; j++) {
                    const nextEv = dayData.events[j];
                    const type = getInferredType(nextEv);
                    const isNextSessHeader = isSessionHeaderEvent(nextEv);
                    if (isNextSessHeader || type === 'break' || type === 'meal' || type === 'social' || type === 'workshop') {
                        endActualStart = trackTimes[j].actualStart;
                        break;
                    }
                }
                if (!endActualStart && dayData.events.length > 0) {
                    endActualStart = trackTimes[dayData.events.length - 1].actualEnd;
                }

                let heightPx = 36;
                if (endActualStart) {
                    const durMins = getMinutesDiff(endActualStart, actualStart);
                    if (durMins > 0) heightPx = Math.max(36, durMins * pixelsPerMinute);
                }
                
                const sName = event.name || event.title || "";
                const sSub = event.subtitle || event.description || "";

                const inlineStartTimeBadge = `<span class="inline-time-badge" contenteditable="true" 
                      onfocus="handleInlineTimeFocus(event, '${selectedDay}', ${idx}, 'start')" 
                      onblur="handleInlineTimeBlur(event, '${selectedDay}', ${idx}, 'start')" 
                      onkeydown="handleInlineTimeKeydown(event, '${selectedDay}', ${idx}, 'start')" 
                      title="Click to edit start time">${formatTime(actualStart)}</span>`;
                
                const inlineEndTimeBadge = (endActualStart && endActualStart !== actualStart) ? ` &ndash; <span class="inline-time-badge" contenteditable="true" 
                      onfocus="handleInlineTimeFocus(event, '${selectedDay}', ${idx}, 'end')" 
                      onblur="handleInlineTimeBlur(event, '${selectedDay}', ${idx}, 'end')" 
                      onkeydown="handleInlineTimeKeydown(event, '${selectedDay}', ${idx}, 'end')" 
                      title="Click to edit end time">${formatTime(endActualStart)}</span>` : '';

                return `
                    <div class="side-session-card" style="top: ${top}px; height: ${heightPx}px; z-index: ${100 + idx};">
                        <div class="side-session-time">${inlineStartTimeBadge}${inlineEndTimeBadge}</div>
                        <div class="side-session-title" contenteditable="true" tabindex="0"
                             onfocus="handleInlineFocus(event, '${selectedDay}', ${idx}, 'name')" 
                             onblur="handleInlineBlur(event, '${selectedDay}', ${idx}, 'name')" 
                             onkeydown="handleInlineKeydown(event, '${selectedDay}', ${idx}, 'name')"
                             onmouseup="handleInlineMouseUp(event, '${selectedDay}', ${idx}, 'name')">${esc(sName)}</div>
                        <div class="side-session-chair" contenteditable="true" tabindex="0"
                             onfocus="handleInlineFocus(event, '${selectedDay}', ${idx}, 'subtitle')" 
                             onblur="handleInlineBlur(event, '${selectedDay}', ${idx}, 'subtitle')" 
                             onkeydown="handleInlineKeydown(event, '${selectedDay}', ${idx}, 'subtitle')"
                             onmouseup="handleInlineMouseUp(event, '${selectedDay}', ${idx}, 'subtitle')">${esc(sSub)}</div>
                    </div>
                `;
            }).join('');

            sessionsSideColumnHTML = `
                <div class="single-day-sessions-column">
                    <div class="sessions-column-header">Sessions & Chairs</div>
                    <div class="sessions-column-body" style="height: ${gridHeight}px; position: relative;">
                        ${sessionCards}
                    </div>
                </div>
            `;
        }
    }

    gridContainer.className = `calendar-grid ${!isAllDays && showSingleDaySessions ? 'has-sessions-sidebar' : ''}`;
    gridContainer.innerHTML = `
        <div class="calendar-main-wrapper" style="position: relative; height: ${gridHeight}px; margin-left: var(--gutter-width, 0px); margin-right: 0;">
            ${Array.from({length: endHour - startHour + 1}, (_, i) => {
                const hour = startHour + i;
                const top = i * hourHeight;
                const hourTag = isAllDays ? `<span style="position: absolute; left: calc(-1 * var(--gutter-width, 48px) + 6px); top: -10px; font-size: 0.7rem; font-weight: 700; color: rgba(255,255,255,0.4); z-index: 5;">${hour}:00</span>` : '';
                return `<div class="hour-line" style="top: ${top}px" data-hour="${hour}:00">${hourTag}</div>`;
            }).join('')}
            
            ${dividersHTML}

            <div id="calendar-now-line" style="display: none;"></div>
            
            ${eventsHTML}
        </div>
        ${sessionsSideColumnHTML}
    `;
}




function renderCalendarEvents(date, startHour, hourHeight, colIndex = 0, totalCols = 1) {
    const dayData = scheduleData.find(d => d.date === date);
    if (!dayData) return '';

    const pixelsPerMinute = hourHeight / 60;
    const isMultiCol = totalCols > 1;
    const colWidthPercent = 100 / totalCols;
    const colLeftPercent = colIndex * colWidthPercent;

    // Filter events based on view mode
    let targetEvents = dayData.events;
    if (!isMultiCol) {
        // Single day view: omit 0-duration session headers from the main calendar grid
        targetEvents = dayData.events.filter(e => !isSessionHeaderEvent(e));
    } else {
        // All week view:
        if (weekViewMode === 'sessions') {
            // Show session headers, breaks, meals, workshops, socials, but omit individual talks
            targetEvents = dayData.events.filter(e => {
                if (isSessionHeaderEvent(e)) return true;
                const type = getInferredType(e);
                return type === 'break' || type === 'meal' || type === 'social' || type === 'workshop';
            });
        } else {
            // Default talks mode: omit 0-duration session headers
            targetEvents = dayData.events.filter(e => !isSessionHeaderEvent(e));
        }
    }

    // Calculate parallel session layout columns, using track-aware delay cascade.
    // Each parallel track (room) carries its own independent delay; buffer events merge all tracks.
    const computedItems = (function() {
        const trackTimes = computeTrackAwareEventTimes(targetEvents);
        const items = targetEvents.map((event, index) => {
            let { actualStart, actualEnd } = trackTimes[index];

            // In week sessions view mode, extend session header blocks to next event's start time
            if (isMultiCol && weekViewMode === 'sessions' && isSessionHeaderEvent(event)) {
                let nextEventStart = null;
                for (let j = index + 1; j < targetEvents.length; j++) {
                    nextEventStart = trackTimes[j].actualStart;
                    break;
                }
                if (nextEventStart) {
                    actualEnd = nextEventStart;
                }
            }

            const startM = timeToMinutes(actualStart);
            const endM = timeToMinutes(actualEnd);
            // Use ORIGINAL times for column layout — delays must not create false overlaps
            const origStartM = timeToMinutes(event.start);
            const origEndM = isMultiCol && weekViewMode === 'sessions' && isSessionHeaderEvent(event) ? endM : timeToMinutes(event.end || event.start);
            return { event, actualStart, actualEnd, startM, endM, origStartM, origEndM, index };
        });

        // Overlap = overlap at ORIGINAL scheduled times only.
        // This ensures sequentially-scheduled talks (David → Conor) always stay full-width,
        // even if a delay causes David to run into Conor's time slot.
        // Thursday's Room A/B events overlap in original schedule → parallel columns.
        items.forEach(item => {
            item.overlapping = items.filter(other =>
                other.index !== item.index &&
                item.origStartM < other.origEndM &&
                item.origEndM > other.origStartM
            );
        });

        items.forEach(item => {
            if (item.overlapping.length === 0) {
                item.colIndex = 0;
                item.numCols = 1;
            } else {
                const usedCols = item.overlapping
                    .filter(other => other.colIndex !== undefined)
                    .map(other => other.colIndex);
                let col = 0;
                while (usedCols.includes(col)) col++;
                item.colIndex = col;
            }
        });

        items.forEach(item => {
            if (item.overlapping.length === 0) {
                item.numCols = 1;
            } else {
                const allInCluster = [item, ...item.overlapping];
                item.numCols = Math.max(...allInCluster.map(x => (x.colIndex !== undefined ? x.colIndex : 0))) + 1;
            }
        });

        return items;
    })();

    return computedItems.map(({ event, actualStart, actualEnd, index, colIndex: subColIdx, numCols }) => {
        // Find the true index of this event in dayData.events array
        const trueEventIndex = dayData.events.indexOf(event);

        const [sh, sm] = actualStart.split(':').map(Number);
        const top = ((sh - startHour) * 60 + sm) * pixelsPerMinute;
        const duration = getMinutesDiff(actualEnd, actualStart);
        const height = duration > 0 ? duration * pixelsPerMinute : 32;

        let displayName = event.name || event.title || "";
        let talkTitle = event.subtitle || event.description || "";

        let typeClass = 'event-talk';
        const currentType = getInferredType(event);
        const isSessHdr = isSessionHeaderEvent(event);

        if (isSessHdr) typeClass = 'event-session-header';
        else if (currentType === 'tiktalk') typeClass = 'event-tiktalk';
        else if (currentType === 'meal') typeClass = 'event-meal';
        else if (currentType === 'break') typeClass = 'event-break';
        else if (currentType === 'social') typeClass = 'event-social';
        else if (currentType === 'workshop') typeClass = 'event-workshop';
        else if (currentType === 'session') typeClass = duration > 20 ? 'event-long-talk' : 'event-talk';
        else if (currentType === 'long-talk') typeClass = 'event-long-talk';

        const nextItem = computedItems[index + 1];
        const showEndTime = duration > 0 && (nextItem ? (nextItem.actualStart !== actualEnd) : true);
        
        const isShifted = getMinutesDiff(actualStart, event.start) !== 0;
        const originalTimeDisplay = isShifted ? `<span class="original-time" title="Original start time: ${formatTime(event.start)}">${formatTime(event.start)}</span>` : '';
        const inlineHeaderTime = `<span class="inline-time-badge" contenteditable="true" 
              onfocus="handleInlineTimeFocus(event, '${date}', ${trueEventIndex}, 'start')" 
              onblur="handleInlineTimeBlur(event, '${date}', ${trueEventIndex}, 'start')" 
              onkeydown="handleInlineTimeKeydown(event, '${date}', ${trueEventIndex}, 'start')" 
              title="Click to edit start time">${formatTime(actualStart)}</span>`;

        const [osh, osm] = event.start.split(':').map(Number);
        const origTop = ((osh - startHour) * 60 + osm) * pixelsPerMinute;

        const subWidthPercent = isMultiCol ? (colWidthPercent / numCols) : (100 / numCols);
        const subLeftOffset = isMultiCol 
            ? `calc(${colLeftPercent}% + ${subColIdx} * (${colWidthPercent}% / ${numCols}) + 2px)` 
            : `calc(${subColIdx} * (100% / ${numCols}))`;
        const leftCss = subLeftOffset;
        const widthCss = isMultiCol 
            ? `calc(${subWidthPercent}% - 4px)` 
            : `calc(${100 / numCols}% - 4px)`;
        const fontScaleCss = isMultiCol ? 'font-size: 0.85rem;' : '';

        const weekEndTimeMarkerHTML = showEndTime ? `
            <div class="calendar-event-end-marker" style="position: absolute; top: ${top + height + 2}px; left: calc(${leftCss} + 10px); z-index: ${100 + index}; display: flex; align-items: center; gap: 6px; font-size: 0.75rem; font-weight: 700; font-family: monospace; color: var(--text-primary);">
                <div class="end-time-black-square" style="width: 10px; height: 10px; background: #000; border: 1px solid var(--border-color); border-radius: 2px; flex-shrink: 0;"></div>
                <span class="inline-time-badge" contenteditable="true" 
                      onfocus="handleInlineTimeFocus(event, '${date}', ${trueEventIndex}, 'end')" 
                      onblur="handleInlineTimeBlur(event, '${date}', ${trueEventIndex}, 'end')" 
                      onkeydown="handleInlineTimeKeydown(event, '${date}', ${trueEventIndex}, 'end')" 
                      title="Click to edit end time">${formatTime(actualEnd)}</span>
            </div>
        ` : '';

        let markerHTML = '';
        const eventColor = EVENT_TYPES[currentType]?.color || '#00b894';
        const durationTagHTML = `<span class="event-duration-left-tag" style="color: ${eventColor};">${duration}</span>`;

        if (!isMultiCol) {
            const origDuration = getMinutesDiff(event.origEnd || event.end || event.start, event.origStart || event.start);
            const isDurationChanged = duration !== origDuration;
            const origDurationHTML = isDurationChanged ? `<span class="original-time" title="Original duration: ${origDuration}m">${origDuration}</span>` : '';

            const midTop = top + (height / 2);
            const durationMarkerHTML = `<div class="calendar-duration-marker" style="top: ${midTop}px;">
                ${origDurationHTML}
                <span class="event-duration-left-tag" style="color: ${eventColor};">${duration}</span>
            </div>`;
            const endTimeMarkerHTML = showEndTime ? `
                <div class="calendar-time-marker end-time" style="top: ${top + height}px;">
                    <span class="inline-time-badge" contenteditable="true" 
                          onfocus="handleInlineTimeFocus(event, '${date}', ${trueEventIndex}, 'end')" 
                          onblur="handleInlineTimeBlur(event, '${date}', ${trueEventIndex}, 'end')" 
                          onkeydown="handleInlineTimeKeydown(event, '${date}', ${trueEventIndex}, 'end')" 
                          title="Click to edit end time">${formatTime(actualEnd)}</span>
                </div>` : '';
            const origTimeMarkerHTML = isShifted ? `<span class="original-time" title="Original start time: ${formatTime(event.start)}">${formatTime(event.start)}</span>` : '';
            markerHTML = `
                <div class="calendar-time-marker" style="top: ${top}px;">
                    ${origTimeMarkerHTML}
                    <span class="inline-time-badge" contenteditable="true" 
                          onfocus="handleInlineTimeFocus(event, '${date}', ${trueEventIndex}, 'start')" 
                          onblur="handleInlineTimeBlur(event, '${date}', ${trueEventIndex}, 'start')" 
                          onkeydown="handleInlineTimeKeydown(event, '${date}', ${trueEventIndex}, 'start')" 
                          title="Click to edit start time">${formatTime(actualStart)}</span>
                </div>
                ${durationMarkerHTML}
                ${endTimeMarkerHTML}
            `;
        }

        return `
            ${markerHTML}
            <div class="calendar-event ${typeClass} ${isMultiCol ? 'week-mode-card' : ''}" style="top: ${top}px; height: ${height}px; min-height: ${height}px; left: ${leftCss}; width: ${widthCss}; z-index: ${100 + index}; ${fontScaleCss}" 
                 data-start="${actualStart}" data-end="${actualEnd}">
                <button class="delete-btn" onclick="deleteEvent('${date}', ${trueEventIndex})" title="Delete event">&times;</button>
                <div class="event-card-content">
                    <div class="event-header-tag">
                        <div class="type-square-container">
                            <div class="event-color-square" 
                                 title="Change event type" 
                                 style="background: ${EVENT_TYPES[currentType]?.color || '#00b894'};">
                            </div>
                            <div class="type-options-popover">
                                ${Object.entries(EVENT_TYPES).map(([type, data]) => `
                                    <div class="type-option-item" onclick="event.stopPropagation(); changeEventType('${date}', ${trueEventIndex}, '${type}')">
                                        <span class="type-color-box" style="background: ${data.color}"></span>
                                        <span>${data.label}</span>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                        ${isMultiCol ? `<span style="font-size: 0.75rem; opacity: 0.85; font-weight: 700; font-family: monospace;">${originalTimeDisplay}${inlineHeaderTime}</span>` : ''}
                    </div>
                    <div class="event-card-text">
                        <div class="speaker-name" contenteditable="true" tabindex="0"
                             onfocus="handleInlineFocus(event, '${date}', ${trueEventIndex}, 'name')" 
                             onblur="handleInlineBlur(event, '${date}', ${trueEventIndex}, 'name')" 
                             onkeydown="handleInlineKeydown(event, '${date}', ${trueEventIndex}, 'name')"
                             onmouseup="handleInlineMouseUp(event, '${date}', ${trueEventIndex}, 'name')">${esc(displayName)}</div>
                        <div class="talk-title" contenteditable="true" tabindex="0"
                             onfocus="handleInlineFocus(event, '${date}', ${trueEventIndex}, 'subtitle')" 
                             onblur="handleInlineBlur(event, '${date}', ${trueEventIndex}, 'subtitle')" 
                             onkeydown="handleInlineKeydown(event, '${date}', ${trueEventIndex}, 'subtitle')"
                             onmouseup="handleInlineMouseUp(event, '${date}', ${trueEventIndex}, 'subtitle')">${esc(talkTitle)}</div>
                    </div>
                </div>
            </div>
            ${isMultiCol ? weekEndTimeMarkerHTML : ''}

        `;



    }).join('');
}

function updateNowLine() {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const timeStr = now.getHours() + ":" + (now.getMinutes() < 10 ? '0' : '') + now.getMinutes();

    const nowLine = document.getElementById('calendar-now-line');
    if (!nowLine) return;

    const isAllDays = selectedDay === 'all';
    const isTodayInSchedule = scheduleData.some(d => d.date === todayStr);

    if ((isAllDays && isTodayInSchedule) || selectedDay === todayStr) {
        nowLine.style.display = 'block';
        const startHour = 7;
        const hourHeight = currentHourHeight;
        const pixelsPerMinute = hourHeight / 60;
        const top = (nowMinutes - startHour * 60) * pixelsPerMinute;
        nowLine.style.top = `${top}px`;
        nowLine.setAttribute('data-time', formatTime(timeStr));

        nowLine.style.left = 'calc(-1 * var(--gutter-width, 48px))';
        nowLine.style.width = 'calc(100% + var(--gutter-width, 48px))';
        
        let remainingLine = document.getElementById('calendar-now-remaining-line');
        if (!remainingLine) {
            remainingLine = document.createElement('div');
            remainingLine.id = 'calendar-now-remaining-line';
            nowLine.appendChild(remainingLine);
        }

        let currentActiveEndM = null;
        let activeEventElement = null;

        document.querySelectorAll('.calendar-event').forEach(el => {
            const [sh, sm] = el.dataset.start.split(':').map(Number);
            const [eh, em] = el.dataset.end.split(':').map(Number);
            const smins = sh * 60 + sm;
            const emins = eh * 60 + em;
            if (nowMinutes >= smins && nowMinutes < emins) {
                el.classList.add('current');
                if (currentActiveEndM === null || emins > currentActiveEndM) {
                    currentActiveEndM = emins;
                    activeEventElement = el;
                }
            } else {
                el.classList.remove('current');
            }
        });

        if (currentActiveEndM !== null) {
            const remainingMins = currentActiveEndM - nowMinutes;
            const height = remainingMins * pixelsPerMinute;
            remainingLine.style.display = 'flex';
            remainingLine.style.height = `${height}px`;
            remainingLine.setAttribute('data-remaining', remainingMins);
        } else {
            remainingLine.style.display = 'none';
        }
    } else {
        nowLine.style.display = 'none';
    }
}


function scrollToNow() {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const isToday = scheduleData.some(d => d.date === todayStr);

    if (!isToday) {
        console.log('Today is not in the schedule.');
        return;
    }

    if (selectedDay !== todayStr) {
        setSelectedDay(todayStr);
    }

    // Larger delay to ensure DOM is fully rendered before measuring
    setTimeout(() => {
        const nowLine = document.getElementById('calendar-now-line');
        
        if (nowLine) {
            // Ensure nowLine is visible if it was hidden due to time-of-day
            if (nowLine.style.display === 'none') {
                nowLine.style.display = 'block'; 
            }
            
            const rect = nowLine.getBoundingClientRect();
            const header = document.querySelector('.sticky-header');
            const headerHeight = header ? header.offsetHeight : 0;
            const availableHeight = window.innerHeight - headerHeight;
            const targetOffset = headerHeight + (availableHeight / 3);
            
            window.scrollTo({
                top: window.scrollY + rect.top - targetOffset,
                behavior: 'smooth'
            });
        } else {
            console.error('Could not find now-line element');
        }
    }, 150);
}

function setSelectedDay(date) {
    selectedDay = date;
    try {
        localStorage.setItem('cs_selected_day', date);
    } catch (e) {}
    renderSchedule();
}

function nextDay() {
    const currentIndex = scheduleData.findIndex(d => d.date === selectedDay);
    if (currentIndex < scheduleData.length - 1) {
        setSelectedDay(scheduleData[currentIndex + 1].date);
    }
}

function prevDay() {
    const currentIndex = scheduleData.findIndex(d => d.date === selectedDay);
    if (currentIndex > 0) {
        setSelectedDay(scheduleData[currentIndex - 1].date);
    }
}

// Load version from version.json so the timestamp is never hardcoded in index.html
fetch('version.json?_=' + Date.now())
    .then(r => r.json())
    .then(data => {
        const badge = document.getElementById('app-version-badge');
        if (badge && data.version) badge.textContent = 'v ' + data.version;
    })
    .catch(() => {});

document.addEventListener('DOMContentLoaded', init);
window.addEventListener('resize', () => {
    renderSchedule();
});
window.setSelectedDay = setSelectedDay;
window.nextDay = nextDay;
window.prevDay = prevDay;
window.editStartTime = editStartTime;
window.deleteEvent = deleteEvent;
window.editEndTime = editEndTime;
window.changeEventType = changeEventType;
window.handleInlineTimeFocus = handleInlineTimeFocus;
window.handleInlineTimeBlur = handleInlineTimeBlur;
window.handleInlineTimeKeydown = handleInlineTimeKeydown;
window.handleInlineFocus = handleInlineFocus;
window.handleInlineBlur = handleInlineBlur;
window.handleInlineKeydown = handleInlineKeydown;
window.handleInlineMouseUp = handleInlineMouseUp;
window.toggleSingleDaySessions = toggleSingleDaySessions;
window.setWeekViewMode = setWeekViewMode;

