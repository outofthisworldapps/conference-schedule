let currentView = 'calendar';
let selectedDay = '2026-04-14';
let scheduleData = [];
let currentHourHeight = 500;

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

async function loadConference(fileName) {
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

        const localSavedData = loadScheduleFromLocalStorage(fileName);
        if (localSavedData) {
            scheduleData = localSavedData;
        } else {
            const response = await fetch(`${fileName}?t=${Date.now()}`);
            const data = await response.json();
            scheduleData = data.scheduleData || [];
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

async function refreshSpreadsheetData() {
    const btn = document.getElementById('refresh-sheet-btn');
    if (btn) {
        btn.classList.remove('success-green');
        btn.classList.add('spinning');
    }
    
    try {
        await loadConference(currentLoadedFile);
        if (btn) {
            btn.classList.remove('spinning');
            btn.classList.add('success-green');
            setTimeout(() => {
                btn.classList.remove('success-green');
            }, 1500);
        }
    } catch (err) {
        if (btn) btn.classList.remove('spinning');
        console.error('Refresh failed:', err);
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
    if (refreshBtn) {
        refreshBtn.addEventListener('click', refreshSpreadsheetData);
    }

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

function getEventTimes(event, currentDelay) {
    const originalStart = event.start;
    const originalEnd = event.end || event.start;
    
    // Treat event.delay as a target delay from the ORIGINAL start time.
    // The event will start at either its manual target time or the cascaded delayed time, whichever is later.
    const targetDelay = event.delay || 0;
    const effectiveDelay = Math.max(currentDelay, targetDelay);
    
    const actualStart = addMinutes(originalStart, effectiveDelay);

    let actualEnd;
    if (isBufferEvent(event)) {
        // Break starts at actualStart, but absorbs delay by ending at originalEnd if possible
        actualEnd = getMinutesDiff(actualStart, originalEnd) > 0 ? actualStart : originalEnd;
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
    let cumulativeDelayBefore = 0;
    for (let i = 0; i < index; i++) {
        const { newDelay } = getEventTimes(day.events[i], cumulativeDelayBefore);
        cumulativeDelayBefore = newDelay;
    }
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

function parseAndNormalizeTimeInput(rawInput) {
    if (!rawInput) return null;
    let input = rawInput.trim().toLowerCase();
    if (input === 'now' || input === '') {
        const now = new Date();
        return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    }

    // Handle standard H:MM or HH:MM with optional meridiem (e.g. 9:02a, 9:02am, 2:15p, 2:15pm)
    const twelveHourMatch = input.match(/^(\d{1,2}):(\d{2})\s*([ap](?:m)?)?$/);
    if (twelveHourMatch) {
        let hours = parseInt(twelveHourMatch[1], 10);
        const minutes = twelveHourMatch[2];
        const meridiem = twelveHourMatch[3];
        if (meridiem && meridiem.startsWith('p') && hours < 12) hours += 12;
        if (meridiem && meridiem.startsWith('a') && hours === 12) hours = 0;
        return `${String(hours).padStart(2, '0')}:${minutes}`;
    }

    // Handle digit-only or digit+meridiem formats without colon (e.g. 902a, 902am, 902, 1430, 215p)
    const compactMatch = input.match(/^(\d{3,4})\s*([ap](?:m)?)?$/);
    if (compactMatch) {
        const digits = compactMatch[1];
        const meridiem = compactMatch[2];
        let hours = parseInt(digits.length === 3 ? digits.slice(0, 1) : digits.slice(0, 2), 10);
        const minutes = digits.slice(-2);
        if (meridiem && meridiem.startsWith('p') && hours < 12) hours += 12;
        if (meridiem && meridiem.startsWith('a') && hours === 12) hours = 0;
        return `${String(hours).padStart(2, '0')}:${minutes}`;
    }

    // Standard HH:MM
    if (/^\d{1,2}:\d{2}$/.test(input)) {
        const parts = input.split(':');
        return `${String(parseInt(parts[0], 10)).padStart(2, '0')}:${parts[1]}`;
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
    const newTime = parseAndNormalizeTimeInput(rawText);

    if (newTime && newTime !== activeTimeBefore) {
        history.push();
        let cumulativeDelayBefore = 0;
        for (let i = 0; i < index; i++) {
            const { newDelay } = getEventTimes(day.events[i], cumulativeDelayBefore);
            cumulativeDelayBefore = newDelay;
        }

        if (type === 'end') {
            const effectiveDelay = Math.max(cumulativeDelayBefore, event.delay || 0);
            const newOriginalEnd = addMinutes(newTime, -effectiveDelay);
            event.end = newOriginalEnd;
        } else {
            const newDelay = getMinutesDiff(newTime, event.start);
            event.delay = newDelay;
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

let activeInlineNameBefore = null;
let activeInlineSubtitleBefore = null;
let activeInlineHTMLBefore = null;
let isInlineTextCanceled = false;

function handleInlineFocus(e, date, index) {
    const day = scheduleData.find(d => d.date === date);
    if (!day) return;
    const event = day.events[index];
    if (!event) return;
    isInlineTextCanceled = false;
    activeInlineNameBefore = event.name || "";
    activeInlineSubtitleBefore = event.subtitle || "";
    activeInlineHTMLBefore = e.target.innerHTML;
}

function handleInlineBlur(e, date, index) {
    const day = scheduleData.find(d => d.date === date);
    if (!day) return;
    const event = day.events[index];
    if (!event) return;

    if (isInlineTextCanceled) {
        if (activeInlineHTMLBefore !== null) {
            e.target.innerHTML = activeInlineHTMLBefore;
        }
        activeInlineNameBefore = null;
        activeInlineSubtitleBefore = null;
        activeInlineHTMLBefore = null;
        isInlineTextCanceled = false;
        return;
    }

    const speakerEl = e.target.querySelector('.speaker-name');
    const titleEl = e.target.querySelector('.talk-title');

    let newName = speakerEl ? speakerEl.innerText.trim() : "";
    let newTitle = titleEl ? titleEl.innerText.trim() : "";

    if (!speakerEl && !titleEl) {
        const text = e.target.innerText.trim();
        const lines = text.split('\n').filter(Boolean);
        newName = lines[0] || "";
        newTitle = lines.slice(1).join(' ') || "";
    }

    if (newName !== activeInlineNameBefore || newTitle !== activeInlineSubtitleBefore) {
        history.push();
        event.name = newName;
        event.subtitle = newTitle;
    }
    activeInlineNameBefore = null;
    activeInlineSubtitleBefore = null;
    activeInlineHTMLBefore = null;
}

function handleInlineKeydown(e, date, index) {
    e.stopPropagation();
    if (e.key === 'Escape') {
        e.preventDefault();
        isInlineTextCanceled = true;
        e.target.blur();
    } else if (e.key === 'Enter' && e.metaKey) {
        e.preventDefault();
        e.target.blur();
    }
}

function editStartTime(date, index) {
    const day = scheduleData.find(d => d.date === date);
    if (!day) return;
    const event = day.events[index];
    
    let cumulativeDelayBefore = 0;
    for (let i = 0; i < index; i++) {
        const e = day.events[i];
        const { newDelay } = getEventTimes(e, cumulativeDelayBefore);
        cumulativeDelayBefore = newDelay;
    }
    
    const currentActualStart = addMinutes(event.start, cumulativeDelayBefore + (event.delay || 0));
    let newTimeInput = prompt(`Edit start time for "${event.name || event.title}" (Enter HH:MM or leave blank for 'now'):`, currentActualStart);
    
    const parsed = parseAndNormalizeTimeInput(newTimeInput);
    if (parsed) {
        history.push();
        const newDelay = getMinutesDiff(parsed, event.start);
        event.delay = newDelay;
        renderSchedule();
        updateNowLine();
    }
}

function editEndTime(date, index) {
    const day = scheduleData.find(d => d.date === date);
    if (!day) return;
    const event = day.events[index];
    
    let cumulativeDelayBefore = 0;
    for (let i = 0; i < index; i++) {
        const { newDelay } = getEventTimes(day.events[i], cumulativeDelayBefore);
        cumulativeDelayBefore = newDelay;
    }
    const effectiveDelay = Math.max(cumulativeDelayBefore, event.delay || 0);
    const currentActualEnd = addMinutes(event.end || event.start, effectiveDelay);

    const newTimeInput = prompt(`Edit end time for "${event.name || event.title}" (HH:MM):`, currentActualEnd);
    const parsed = parseAndNormalizeTimeInput(newTimeInput);
    if (parsed) {
        history.push();
        const newOriginalEnd = addMinutes(parsed, -effectiveDelay);
        event.end = newOriginalEnd;
        renderSchedule();
        updateNowLine();
    }
}

function deleteEvent(date, index) {
    const day = scheduleData.find(d => d.date === date);
    if (!day) return;
    const event = day.events[index];
    
    if (confirm(`Are you sure you want to delete "${event.name || event.title}"?`)) {
        history.push();
        day.events.splice(index, 1);
        renderSchedule();
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

function renderCalendarView() {
    const navContainer = document.getElementById('day-nav-container');
    const gridContainer = document.getElementById('calendar-grid');
    const isAllDays = selectedDay === 'all';
    const dayIndex = isAllDays ? -1 : scheduleData.findIndex(d => d.date === selectedDay);
    const gutterWidth = isAllDays ? '0px' : '68px';
    gridContainer.style.setProperty('--gutter-width', isAllDays ? '0px' : '68px');

    const colHeaderHTML = isAllDays ? `
        <div class="calendar-column-headers" style="display: flex; width: 100%; box-sizing: border-box; border-top: 1px solid var(--border-color); border-bottom: 1px solid var(--border-color); background: var(--bg-color); padding: 8px 0; margin-top: 6px;">
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
        </div>
        ${colHeaderHTML}
    `;

    const startHour = 7;
    const endHour = 22;
    const hourHeight = currentHourHeight; 
    const gridHeight = (endHour - startHour + 1) * hourHeight;
    
    gridContainer.style.height = `${gridHeight}px`;

    const eventsHTML = isAllDays ? 
        scheduleData.map((day, colIdx) => renderCalendarEvents(day.date, startHour, hourHeight, colIdx, scheduleData.length)).join('') :
        renderCalendarEvents(selectedDay, startHour, hourHeight, 0, 1);

    const dividersHTML = isAllDays ?
        scheduleData.map((_, i) => i > 0 ? `<div style="position: absolute; top: 0; bottom: 0; left: ${(i / scheduleData.length) * 100}%; width: 1px; background: rgba(255,255,255,0.08); z-index: 10;"></div>` : '').join('') : '';

    gridContainer.innerHTML = `
        <div style="position: relative; height: ${gridHeight}px; margin-left: var(--gutter-width, 0px); margin-right: 0;">
            ${Array.from({length: endHour - startHour + 1}, (_, i) => {
                const hour = startHour + i;
                const top = i * hourHeight;
                const hourTag = isAllDays ? `<span style="position: absolute; left: 8px; top: -10px; font-size: 0.7rem; font-weight: 700; color: rgba(255,255,255,0.3); background: var(--bg-color); padding: 0 4px; z-index: 5;">${hour}:00</span>` : '';
                return `<div class="hour-line" style="top: ${top}px" data-hour="${hour}:00">${hourTag}</div>`;
            }).join('')}
            
            ${dividersHTML}

            <div id="calendar-now-line" style="display: none;"></div>
            
            ${eventsHTML}
        </div>
    `;
}




function renderCalendarEvents(date, startHour, hourHeight, colIndex = 0, totalCols = 1) {
    const dayData = scheduleData.find(d => d.date === date);
    if (!dayData) return '';

    let cumulativeDelay = 0;
    const pixelsPerMinute = hourHeight / 60;
    const isMultiCol = totalCols > 1;
    const colWidthPercent = 100 / totalCols;
    const colLeftPercent = colIndex * colWidthPercent;

    // Calculate parallel session layout columns
    const computedItems = (function() {
        let cumulativeDelay = 0;
        const items = dayData.events.map((event, index) => {
            const { actualStart, actualEnd, newDelay } = getEventTimes(event, cumulativeDelay);
            cumulativeDelay = newDelay;
            const startM = timeToMinutes(actualStart);
            const endM = timeToMinutes(actualEnd);
            return { event, actualStart, actualEnd, startM, endM, index };
        });

        items.forEach(item => {
            item.overlapping = items.filter(other =>
                other.index !== item.index &&
                item.startM < other.endM &&
                item.endM > other.startM
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
        const [sh, sm] = actualStart.split(':').map(Number);
        const top = ((sh - startHour) * 60 + sm) * pixelsPerMinute;
        const duration = getMinutesDiff(actualEnd, actualStart);
        const height = duration * pixelsPerMinute;

        let displayName = event.name || event.title || "";
        let talkTitle = event.subtitle || event.description || "";

        let typeClass = 'event-talk';
        const currentType = getInferredType(event);

        if (currentType === 'tiktalk') typeClass = 'event-tiktalk';
        else if (currentType === 'meal') typeClass = 'event-meal';
        else if (currentType === 'break') typeClass = 'event-break';
        else if (currentType === 'social') typeClass = 'event-social';
        else if (currentType === 'workshop') typeClass = 'event-workshop';
        else if (currentType === 'session') typeClass = duration > 20 ? 'event-long-talk' : 'event-talk';
        else if (currentType === 'long-talk') typeClass = 'event-long-talk';

        const nextEvent = dayData.events[index + 1];
        const showEndTime = nextEvent ? (nextEvent.start !== event.end) : true;
        
        const isShifted = getMinutesDiff(actualStart, event.start) !== 0;
        const originalTimeDisplay = isShifted ? `<span class="original-time" title="Original start time: ${formatTime(event.start)}">${formatTime(event.start)}</span>` : '';

        const [osh, osm] = event.start.split(':').map(Number);
        const origTop = ((osh - startHour) * 60 + osm) * pixelsPerMinute;

        const subWidthPercent = isMultiCol ? (colWidthPercent / numCols) : (100 / numCols);
        const subLeftOffset = isMultiCol 
            ? `calc(${colLeftPercent}% + ${subColIdx} * (${colWidthPercent}% / ${numCols}) + 2px)` 
            : `calc(${subColIdx} * (100% / ${numCols}))`;
        const leftCss = subLeftOffset;
        const widthCss = isMultiCol 
            ? `calc(${subWidthPercent}% - 4px)` 
            : `calc(100% - 4px)`;
        const fontScaleCss = isMultiCol ? 'font-size: 0.85rem;' : '';

        const weekEndTimeMarkerHTML = showEndTime ? `
            <div class="calendar-event-end-marker" style="position: absolute; top: ${top + height + 2}px; left: calc(${leftCss} + 10px); z-index: ${100 + index}; display: flex; align-items: center; gap: 6px; font-size: 0.75rem; font-weight: 700; font-family: monospace; color: var(--text-primary);">
                <div class="end-time-black-square" style="width: 10px; height: 10px; background: #000; border: 1px solid var(--border-color); border-radius: 2px; flex-shrink: 0;"></div>
                <span class="inline-time-badge" contenteditable="true" 
                      onfocus="handleInlineTimeFocus(event, '${date}', ${index}, 'end')" 
                      onblur="handleInlineTimeBlur(event, '${date}', ${index}, 'end')" 
                      onkeydown="handleInlineTimeKeydown(event, '${date}', ${index}, 'end')" 
                      title="Click to edit end time">${formatTime(actualEnd)}</span>
            </div>
        ` : '';

        let markerHTML = '';
        if (!isMultiCol) {
            const endTimeMarkerHTML = showEndTime ? `
                <div class="calendar-time-marker end-time" style="top: ${top + height}px;">
                    <span class="inline-time-badge" contenteditable="true" 
                          onfocus="handleInlineTimeFocus(event, '${date}', ${index}, 'end')" 
                          onblur="handleInlineTimeBlur(event, '${date}', ${index}, 'end')" 
                          onkeydown="handleInlineTimeKeydown(event, '${date}', ${index}, 'end')" 
                          title="Click to edit end time">${formatTime(actualEnd)}</span>
                </div>` : '';
            const origTimeMarkerHTML = isShifted ? `
                <div class="calendar-time-marker original-time-marker" style="top: ${origTop}px;">
                    <span class="original-time" title="Original start time: ${formatTime(event.start)}">${formatTime(event.start)}</span>
                </div>` : '';
            markerHTML = `
                ${origTimeMarkerHTML}
                <div class="calendar-time-marker" style="top: ${top}px;">
                    <span class="inline-time-badge" contenteditable="true" 
                          onfocus="handleInlineTimeFocus(event, '${date}', ${index}, 'start')" 
                          onblur="handleInlineTimeBlur(event, '${date}', ${index}, 'start')" 
                          onkeydown="handleInlineTimeKeydown(event, '${date}', ${index}, 'start')" 
                          title="Click to edit start time">${formatTime(actualStart)}</span>
                </div>
                ${endTimeMarkerHTML}
            `;
        }

        const inlineHeaderTime = `<span class="inline-time-badge" contenteditable="true" 
                                       onfocus="handleInlineTimeFocus(event, '${date}', ${index}, 'start')" 
                                       onblur="handleInlineTimeBlur(event, '${date}', ${index}, 'start')" 
                                       onkeydown="handleInlineTimeKeydown(event, '${date}', ${index}, 'start')" 
                                       title="Click to edit start time">${formatTime(actualStart)}</span>`;

        return `
            ${markerHTML}
            <div class="calendar-event ${typeClass}" style="top: ${top}px; height: ${height}px; left: ${leftCss}; width: ${widthCss}; z-index: ${100 + index}; ${fontScaleCss}" 
                 data-start="${actualStart}" data-end="${actualEnd}">
                <button class="delete-btn" onclick="deleteEvent('${date}', ${index})" title="Delete event">&times;</button>
                <div class="event-card-content">
                    <div class="event-header-tag">
                        <div class="type-square-container">
                            <div class="event-color-square" 
                                 title="Change event type" 
                                 style="background: ${EVENT_TYPES[currentType]?.color || '#00b894'};">
                            </div>
                            <div class="type-options-popover">
                                ${Object.entries(EVENT_TYPES).map(([type, data]) => `
                                    <div class="type-option-item" onclick="event.stopPropagation(); changeEventType('${date}', ${index}, '${type}')">
                                        <span class="type-color-box" style="background: ${data.color}"></span>
                                        <span>${data.label}</span>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                        ${isMultiCol ? `<span style="font-size: 0.75rem; opacity: 0.85; font-weight: 700; font-family: monospace;">${originalTimeDisplay}${inlineHeaderTime}</span>` : ''}
                    </div>
                    <div class="event-card-text" contenteditable="true" 
                         onfocus="handleInlineFocus(event, '${date}', ${index})" 
                         onblur="handleInlineBlur(event, '${date}', ${index})" 
                         onkeydown="handleInlineKeydown(event, '${date}', ${index})">
                        ${displayName ? `<div class="speaker-name">${esc(displayName)}</div>` : ''}
                        ${talkTitle ? `<div class="talk-title">${esc(talkTitle)}</div>` : ''}
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
        const top = (nowMinutes - startHour * 60) * (hourHeight / 60);
        nowLine.style.top = `${top}px`;
        nowLine.setAttribute('data-time', formatTime(timeStr));

        if (isAllDays) {
            const colIdx = scheduleData.findIndex(d => d.date === todayStr);
            if (colIdx >= 0) {
                const colWidthPercent = 100 / scheduleData.length;
                const colLeftPercent = colIdx * colWidthPercent;
                nowLine.style.left = `calc(${colLeftPercent}% + 2px)`;
                nowLine.style.width = `calc(${colWidthPercent}% - 4px)`;
            }
        } else {
            nowLine.style.left = 'calc(-1 * var(--gutter-width, 68px))';
            nowLine.style.width = 'calc(100% + var(--gutter-width, 68px))';
        }
        
        document.querySelectorAll('.calendar-event').forEach(el => {
            const [sh, sm] = el.dataset.start.split(':').map(Number);
            const [eh, em] = el.dataset.end.split(':').map(Number);
            const smins = sh * 60 + sm;
            const emins = eh * 60 + em;
            if (nowMinutes >= smins && nowMinutes < emins) {
                el.classList.add('current');
            } else {
                el.classList.remove('current');
            }
        });
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

