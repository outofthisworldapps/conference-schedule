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
        const response = await fetch('schedule.json');
        const data = await response.json();
        scheduleData = data.scheduleData;
        
        const todayStr = new Date().toISOString().split('T')[0];
        const hasToday = scheduleData.some(d => d.date === todayStr);
        if (hasToday) {
            selectedDay = todayStr;
        } else if (scheduleData.length > 0) {
            selectedDay = scheduleData[0].date;
        }

        setupEventListeners();
        history.updateButtons();
        renderSchedule();
        
        setInterval(updateNowLine, 60000);
    } catch (error) {
        console.error('Error loading schedule:', error);
        document.body.innerHTML += '<div style="padding: 2rem; color: #ff6b6b;">Failed to load schedule data. Please ensure schedule.json exists.</div>';
    }
}

function setupEventListeners() {
    document.getElementById('undo-btn').addEventListener('click', () => history.undo());
    document.getElementById('redo-btn').addEventListener('click', () => history.redo());
    document.getElementById('save-btn').addEventListener('click', saveSchedule);
    document.getElementById('load-btn').addEventListener('click', () => document.getElementById('file-input').click());
    document.getElementById('file-input').addEventListener('change', loadSchedule);
    document.getElementById('now-btn').addEventListener('click', scrollToNow);

    document.addEventListener('keydown', (e) => {
        const isCmdOrCtrl = e.metaKey || e.ctrlKey;
        
        if (e.key.toLowerCase() === 't') {
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
            currentHourHeight = Math.min(1500, Math.max(80, currentHourHeight * factor));
            
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
    const data = { scheduleData: scheduleData };
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
    renderCalendarView();
    updateNowLine();
    const slider = document.getElementById('zoom-slider');
    if (slider) slider.value = currentHourHeight;
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
    
    if (newTimeInput !== null && (newTimeInput.toLowerCase() === 'now' || newTimeInput.trim() === '')) {
        const now = new Date();
        newTimeInput = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    }
    
    if (newTimeInput && /^\d{1,2}:\d{2}$/.test(newTimeInput)) {
        history.push();
        // Calculate delay relative to ORIGINAL start time to "pin" it
        const newDelay = getMinutesDiff(newTimeInput, event.start);
        event.delay = newDelay;
        
        renderSchedule();
        updateNowLine();
    }
}

function editEventName(date, index) {
    const day = scheduleData.find(d => d.date === date);
    if (!day) return;
    const event = day.events[index];
    
    const newName = prompt(`Edit name for this event:`, event.name);
    if (newName !== null && newName.trim() !== "" && newName !== event.name) {
        history.push();
        event.name = newName;
        renderSchedule();
    }
}

function editEventSubtitle(date, index) {
    const day = scheduleData.find(d => d.date === date);
    if (!day) return;
    const event = day.events[index];
    
    const newSubtitle = prompt(`Edit subtitle for this event:`, event.subtitle || "");
    if (newSubtitle !== null && newSubtitle !== event.subtitle) {
        history.push();
        event.subtitle = newSubtitle;
        renderSchedule();
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
    
    if (newTimeInput && /^\d{1,2}:\d{2}$/.test(newTimeInput)) {
        history.push();
        const newDelay = getMinutesDiff(newTimeInput, event.end || event.start);
        // We want to update the original end time so that originalEnd + effectiveDelay = newTimeInput
        // originalEnd = newTimeInput - effectiveDelay
        const newOriginalEnd = addMinutes(newTimeInput, -effectiveDelay);
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
    const dayIndex = scheduleData.findIndex(d => d.date === selectedDay);
    
    navContainer.innerHTML = `
        <div class="day-navigation">
            <button class="nav-arrow" onclick="prevDay()" ${dayIndex === 0 ? 'disabled' : ''}>&larr;</button>
            <div class="day-tabs">
                ${scheduleData.map(day => `
                    <div class="day-tab ${day.date === selectedDay ? 'active' : ''}" onclick="setSelectedDay('${day.date}')">
                        ${day.day.split(',')[0]} ${day.day.split(' ')[2]}
                    </div>
                `).join('')}
            </div>
            <button class="nav-arrow" onclick="nextDay()" ${dayIndex === scheduleData.length - 1 ? 'disabled' : ''}>&rarr;</button>
        </div>
    `;
    
    const startHour = 7;
    const endHour = 22;
    const hourHeight = currentHourHeight; 
    const gridHeight = (endHour - startHour + 1) * hourHeight;
    
    gridContainer.style.height = `${gridHeight}px`;

    gridContainer.innerHTML = `
        <div style="position: relative; height: ${gridHeight}px; margin-left: 60px;">
            ${Array.from({length: endHour - startHour + 1}, (_, i) => {
                const hour = startHour + i;
                const top = i * hourHeight;
                return `<div class="hour-line" style="top: ${top}px" data-hour="${hour}:00"></div>`;
            }).join('')}
            
            <div id="calendar-now-line" style="display: none;"></div>
            
            ${renderCalendarEvents(selectedDay, startHour, hourHeight)}
        </div>
    `;
}

function renderCalendarEvents(date, startHour, hourHeight) {
    const dayData = scheduleData.find(d => d.date === date);
    if (!dayData) return '';

    let cumulativeDelay = 0;
    const pixelsPerMinute = hourHeight / 60;

    const computedEvents = dayData.events.map((event, index) => {
        const { actualStart, actualEnd, newDelay } = getEventTimes(event, cumulativeDelay);
        cumulativeDelay = newDelay;
        return { event, actualStart, actualEnd, index };
    });

    // Extend end times to next start if gap is small (<= 10 mins)
    for (let i = 0; i < computedEvents.length - 1; i++) {
        const gap = getMinutesDiff(computedEvents[i+1].actualStart, computedEvents[i].actualEnd);
        if (gap > 0 && gap <= 10) {
            computedEvents[i].actualEnd = computedEvents[i+1].actualStart;
        }
    }

    return computedEvents.map(({ event, actualStart, actualEnd, index }) => {

        const [sh, sm] = actualStart.split(':').map(Number);
        
        const top = ((sh - startHour) * 60 + sm) * pixelsPerMinute;
        const duration = getMinutesDiff(actualEnd, actualStart);
        const height = duration * pixelsPerMinute;

        let displayName = event.name || event.title || "";
        let talkTitle = event.subtitle || event.description || "";

        let typeClass = 'event-talk';
        const lowerName = displayName.toLowerCase();
        const currentType = getInferredType(event);

        if (currentType === 'tiktalk') {
            typeClass = 'event-tiktalk';
        } else if (currentType === 'meal') {
            typeClass = 'event-meal';
        } else if (currentType === 'break') {
            typeClass = 'event-break';
        } else if (currentType === 'social') {
            typeClass = 'event-social';
        } else if (currentType === 'workshop') {
            typeClass = 'event-workshop';
        } else if (currentType === 'session') {
            typeClass = duration > 20 ? 'event-long-talk' : 'event-talk';
        } else if (currentType === 'long-talk') {
            typeClass = 'event-long-talk';
        }

        /* 
        Removal of textOffsetStyle logic as it interfered with zoom and triggered clipping.
        We now rely on the user zooming in to resolve any text overlaps.
        */

        const nextEvent = dayData.events[index + 1];
        const showEndTime = nextEvent ? (nextEvent.start !== event.end) : true;
        const endTimeGutter = showEndTime ? `<div class="calendar-time-marker end-time clickable" style="top: ${top + height}px;" onclick="editEndTime('${date}', ${index})">${formatTime(actualEnd)}</div>` : '';

        // Show original time if the event is shifted
        const isShifted = getMinutesDiff(actualStart, event.start) !== 0;
        const originalTimeDisplay = isShifted
            ? `<div class="original-time">${formatTime(event.start)}</div>` 
            : '';

        return `
            <div class="calendar-time-marker clickable" style="top: ${top}px;" onclick="editStartTime('${date}', ${index})">
                ${originalTimeDisplay}
                ${formatTime(actualStart)}
            </div>
            ${endTimeGutter}
            <div class="calendar-event ${typeClass}" style="top: ${top}px; height: ${height}px; z-index: ${100 + index};" 
                 data-start="${actualStart}" data-end="${actualEnd}">
                <div class="type-selector-container">
                    <div class="custom-type-dropdown">
                        <div class="type-trigger">
                            <div class="type-color-box" style="background: ${EVENT_TYPES[currentType]?.color || '#fff'}"></div>
                            <span>${EVENT_TYPES[currentType]?.label || 'Talk'}</span>
                        </div>
                        <div class="type-options">
                            ${Object.entries(EVENT_TYPES).map(([type, data]) => `
                                <div class="type-option" onclick="changeEventType('${date}', ${index}, '${type}')">
                                    <div class="type-color-box" style="background: ${data.color}"></div>
                                    ${data.label}
                                </div>
                            `).join('')}
                        </div>
                    </div>
                </div>
                <button class="delete-btn" onclick="deleteEvent('${date}', ${index})" title="Delete event">&times;</button>
                <h4 class="editable" onclick="editEventName('${date}', ${index})">${esc(displayName)}</h4>
                <div class="event-subtitle editable" onclick="editEventSubtitle('${date}', ${index})">${esc(talkTitle)}</div>
            </div>
        `;
    }).join('');
}

function updateNowLine() {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const timeStr = now.getHours() + ":" + (now.getMinutes() < 10 ? '0' : '') + now.getMinutes();

    const nowLine = document.getElementById('calendar-now-line');
    if (selectedDay === todayStr && nowLine) {
        nowLine.style.display = 'block';
        const startHour = 7;
        const hourHeight = currentHourHeight;
        const top = (nowMinutes - startHour * 60) * (hourHeight / 60);
        nowLine.style.top = `${top}px`;
        nowLine.setAttribute('data-time', formatTime(timeStr));
        
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
    } else if (nowLine) {
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
window.setSelectedDay = setSelectedDay;
window.nextDay = nextDay;
window.prevDay = prevDay;
window.editStartTime = editStartTime;
window.editEventName = editEventName;
window.editEventSubtitle = editEventSubtitle;
window.deleteEvent = deleteEvent;
window.editEndTime = editEndTime;
window.changeEventType = changeEventType;
