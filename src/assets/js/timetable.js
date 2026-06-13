const API_URL_BASE = window.api.env.API_URL.replace('/students', '');
const CLASSES_API = `${API_URL_BASE}/classes`;
const X_API_KEY = '996de2d470a0f1e9794b7778e216c193258aac001b36813f9ad1d3f957cc7ee7';

let allClasses = [];
let currentViewMode = 'list';

// Tracks the reference date for the displayed week (defaults to today)
let selectedWeekDate = new Date();

// --- Holiday ICS Support ---
// Map of ISO date string (YYYY-MM-DD) -> holiday name
let holidayMap = new Map();

function parseICS(text) {
    const map = new Map();
    const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
    let inEvent = false;
    let dtstart = null;
    let summary = null;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line === 'BEGIN:VEVENT') {
            inEvent = true;
            dtstart = null;
            summary = null;
        } else if (line === 'END:VEVENT') {
            if (inEvent && dtstart && summary) {
                // dtstart format: YYYYMMDD
                const iso = `${dtstart.slice(0, 4)}-${dtstart.slice(4, 6)}-${dtstart.slice(6, 8)}`;
                if (!map.has(iso)) {
                    map.set(iso, summary);
                }
            }
            inEvent = false;
        } else if (inEvent) {
            if (line.startsWith('DTSTART;VALUE=DATE:')) {
                dtstart = line.replace('DTSTART;VALUE=DATE:', '').trim();
            } else if (line.startsWith('SUMMARY:')) {
                summary = line.replace('SUMMARY:', '').trim();
            }
        }
    }
    return map;
}

async function loadHolidays() {
    try {
        const response = await fetch('./assets/basic.ics');
        if (!response.ok) return;
        const text = await response.text();
        holidayMap = parseICS(text);
    } catch (e) {
        console.warn('Could not load holidays ICS:', e);
    }
}
// --- End Holiday ICS Support ---

const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

// Get activated teacher/institution ID
function getActivatedId() {
    const activatedData = localStorage.getItem('Activated_Teacher') || localStorage.getItem('Activated_Institution');
    if (!activatedData) return null;
    const stored = JSON.parse(activatedData);
    return stored.teacher_id || stored.institution_id;
}

async function fetchClasses() {
    const currentId = getActivatedId();
    if (!currentId) {
        document.getElementById('main-application').innerHTML = `
            <div style="padding: 40px; text-align: center;">
                <h2>Activation Required</h2>
                <p>Please activate your account to view timetable.</p>
            </div>
        `;
        return;
    }

    try {
        document.getElementById('loader').classList.remove('hidden');
        
        const response = await fetch(CLASSES_API, { headers: { 'x-api-key': X_API_KEY } });
        if (!response.ok) throw new Error('Failed to fetch classes');

        const data = await response.json();
        const classesItems = Array.isArray(data) ? data : (data.items || []);
        
        allClasses = classesItems.filter(cls => cls.teacher_id === currentId);
        
        populateLocationFilter();
        renderTimetable(allClasses);
        
    } catch (error) {
        console.error('Error fetching data:', error);
        document.getElementById('errorMessage').classList.remove('hidden');
    } finally {
        document.getElementById('loader').classList.add('hidden');
    }
}

function formatTimeAMPM(timeStr) {
    if (!timeStr) return '';
    const [hours24, minutes] = timeStr.split(':');
    let hours = parseInt(hours24, 10);
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12; // Convert 0 to 12
    return `${hours}:${minutes} ${ampm}`;
}

function getWeekDates() {
    const ref = new Date(selectedWeekDate);
    const dayOfWeek = ref.getDay(); // 0 (Sun) to 6 (Sat)
    const distanceToMonday = (dayOfWeek === 0 ? -6 : 1 - dayOfWeek);
    
    const monday = new Date(ref);
    monday.setDate(ref.getDate() + distanceToMonday);

    const dates = {};
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    
    for (let i = 0; i < 7; i++) {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        const label = `${d.getDate()} ${months[d.getMonth()]}`;
        // ISO string: YYYY-MM-DD (local time)
        const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        dates[daysOfWeek[i]] = { label, iso };
    }
    
    return dates;
}

// Sync the date picker input to show the Monday of the current selectedWeekDate
function syncDatePicker() {
    const picker = document.getElementById('weekDatePicker');
    if (!picker) return;
    const ref = new Date(selectedWeekDate);
    const day = ref.getDay();
    const distanceToMonday = (day === 0 ? -6 : 1 - day);
    const monday = new Date(ref);
    monday.setDate(ref.getDate() + distanceToMonday);
    const iso = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`;
    picker.value = iso;
}

// Navigate to prev (-1) or next (+1) week
function navigateWeek(direction) {
    selectedWeekDate.setDate(selectedWeekDate.getDate() + direction * 7);
    syncDatePicker();
    applyFilters();
}

function renderTimetableList(classes) {
    const grid = document.getElementById('timetableGrid');
    grid.innerHTML = '';
    
    // Change grid to vertical stacking for mobile list
    grid.style.display = 'flex';
    grid.style.flexDirection = 'column';
    grid.style.overflowX = 'hidden';

    const weekDates = getWeekDates();

    daysOfWeek.forEach(day => {
        const { label, iso } = weekDates[day];
        const holiday = holidayMap.get(iso);

        const column = document.createElement('div');
        column.className = 'accordion-day-container' + (holiday ? ' holiday-day' : '');
        column.setAttribute('data-day', day);

        const header = document.createElement('div');
        header.className = 'accordion-day-header';
        header.onclick = () => window.toggleAccordion(day);
        
        header.innerHTML = `
            <div class="accordion-header-left">
                <span class="day-name">${day}</span>
                <span class="day-date">${label}</span>
                ${holiday ? `<span class="holiday-banner">${holiday}</span>` : ''}
            </div>
            <svg id="day-icon-${day}" class="accordion-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="18 15 12 9 6 15"></polyline>
            </svg>
        `;

        const content = document.createElement('div');
        content.className = 'accordion-day-content';
        content.id = 'day-content-' + day;
        content.style.display = 'flex'; // Expanded by default

        // Filter and sort classes for this day
        const dayClasses = classes
            .filter(cls => cls.classdate === day)
            .sort((a, b) => {
                const timeA = a.classtime || '24:00';
                const timeB = b.classtime || '24:00';
                return timeA.localeCompare(timeB);
            });

        if (dayClasses.length === 0) {
            content.innerHTML = `
                <div class="empty-day-row">
                    ${holiday ? `Holiday - ${holiday}` : 'No classes scheduled'}
                </div>
            `;
        } else {
            dayClasses.forEach(cls => {
                const card = document.createElement('div');
                card.className = 'mobile-class-card' + (holiday ? ' holiday-class-card' : '');
                
                const startTime = formatTimeAMPM(cls.classtime);
                const endTime = formatTimeAMPM(cls.class_endtime);
                const timeStr = startTime ? `${startTime} - ${endTime}` : 'Time TBA';

                card.innerHTML = `
                    <div class="class-time">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <circle cx="12" cy="12" r="10"></circle>
                            <polyline points="12 6 12 12 16 14"></polyline>
                        </svg>
                        ${timeStr}
                    </div>
                    <div class="class-name">${cls.name || 'Unnamed Class'}</div>
                    <div class="class-location">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                            <circle cx="12" cy="10" r="3"></circle>
                        </svg>
                        ${cls.location || 'No Location'}
                    </div>
                `;
                content.appendChild(card);
            });
        }

        column.appendChild(header);
        column.appendChild(content);
        grid.appendChild(column);
    });
}

function renderTimetableGrid(classes) {
    const grid = document.getElementById('timetableGrid');
    const weekDates = getWeekDates();
    
    const calendarContainer = document.createElement('div');
    calendarContainer.className = 'calendar-container';
    calendarContainer.style.width = '100%';
    calendarContainer.style.display = 'flex';
    calendarContainer.style.flexDirection = 'column';
    
    const scrollWrapper = document.createElement('div');
    scrollWrapper.className = 'calendar-scroll-wrapper';
    
    // Headers
    const headersDiv = document.createElement('div');
    headersDiv.className = 'calendar-headers';
    headersDiv.innerHTML = `<div class="time-header-spacer"></div>`;
    
    daysOfWeek.forEach(day => {
        const { label, iso } = weekDates[day];
        const holiday = holidayMap.get(iso);
        const h = document.createElement('div');
        h.className = 'calendar-day-header' + (holiday ? ' holiday-day' : '');
        h.innerHTML = `<div class="day-name">${day}</div><div class="day-date">${label}</div>${holiday ? `<div class="holiday-banner">${holiday}</span>` : ''}`;
        headersDiv.appendChild(h);
    });
    scrollWrapper.appendChild(headersDiv);
    
    // Grid View Container
    const viewContainer = document.createElement('div');
    viewContainer.className = 'calendar-view-container';
    
    // Time Scale
    const timeScale = document.createElement('div');
    timeScale.className = 'time-scale';
    const START_HOUR = 8;
    const END_HOUR = 22; // 10 PM
    
    for (let i = START_HOUR; i <= END_HOUR; i++) {
        const slot = document.createElement('div');
        slot.className = 'time-slot';
        const ampm = i >= 12 ? 'PM' : 'AM';
        const hr = i % 12 || 12;
        slot.innerHTML = `<span class="time-slot-label">${hr} ${ampm}</span>`;
        timeScale.appendChild(slot);
    }
    viewContainer.appendChild(timeScale);
    
    // Day Columns
    const columnsDiv = document.createElement('div');
    columnsDiv.className = 'grid-columns';
    columnsDiv.innerHTML = `<div class="grid-lines-overlay"></div>`;
    
    daysOfWeek.forEach(day => {
        const { iso } = weekDates[day];
        const isHoliday = holidayMap.has(iso);
        const col = document.createElement('div');
        col.className = 'grid-day-col' + (isHoliday ? ' holiday-day' : '');
        
        const dayClasses = classes.filter(cls => cls.classdate === day);
        
        dayClasses.forEach(cls => {
            if (!cls.classtime || !cls.class_endtime) return;
            
            const [sHour, sMin] = cls.classtime.split(':').map(Number);
            const [eHour, eMin] = cls.class_endtime.split(':').map(Number);
            
            // Calculate top position in pixels
            // 40px per hour, starting at START_HOUR
            const startFraction = (sHour - START_HOUR) + (sMin / 60);
            const topPx = (startFraction * 40) + 20; // +20 offset matching grid-lines-overlay top
            
            // Calculate height in pixels
            const durationFraction = (eHour - sHour) + ((eMin - sMin) / 60);
            const heightPx = durationFraction * 40;
            
            if (topPx < 0 || heightPx <= 0) return; // Bounds check
            
            const card = document.createElement('div');
            card.className = 'grid-class-card';
            card.style.top = `${topPx}px`;
            card.style.height = `${heightPx}px`;
            
            const timeStr = `${formatTimeAMPM(cls.classtime)} - ${formatTimeAMPM(cls.class_endtime)}`;
            
            card.innerHTML = `
                <div class="class-time">${timeStr}</div>
                <div class="class-name"><strong>${cls.name || 'Unnamed'}</strong></div>
                <div class="class-location">
                    <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                        <circle cx="12" cy="10" r="3"></circle>
                    </svg>
                    ${cls.location || 'No Location'}
                </div>
            `;
            col.appendChild(card);
        });
        
        columnsDiv.appendChild(col);
    });
    
    viewContainer.appendChild(columnsDiv);
    scrollWrapper.appendChild(viewContainer);
    calendarContainer.appendChild(scrollWrapper);
    
    grid.innerHTML = '';
    grid.appendChild(calendarContainer);
}

function renderTimetable(classes) {
    if (currentViewMode === 'grid') {
        renderTimetableGrid(classes);
    } else {
        renderTimetableList(classes);
    }
}

function populateLocationFilter() {
    const locationFilter = document.getElementById('locationFilter');
    if (!locationFilter) return;

    const currentSelection = locationFilter.value;
    const locationMap = new Map();
    
    allClasses.forEach(cls => {
        if (!cls.location) return;
        const trimmed = cls.location.trim();
        if (trimmed === '') return;
        const lower = trimmed.toLowerCase();
        if (!locationMap.has(lower)) {
            locationMap.set(lower, trimmed);
        }
    });

    const locations = Array.from(locationMap.values()).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

    locationFilter.innerHTML = '<option value="All">All Locations</option>';
    locations.forEach(loc => {
        const option = document.createElement('option');
        option.value = loc;
        option.textContent = loc;
        locationFilter.appendChild(option);
    });

    if (locations.includes(currentSelection)) {
        locationFilter.value = currentSelection;
    }
}

function applyFilters() {
    const locationFilter = document.getElementById('locationFilter').value;

    const filtered = allClasses.filter(cls => {
        if (locationFilter === 'All') return true;
        return (cls.location || '').trim().toLowerCase() === locationFilter.toLowerCase();
    });

    renderTimetable(filtered);
}

if (document.getElementById('locationFilter')) {
    document.getElementById('locationFilter').addEventListener('change', applyFilters);
}

if (document.getElementById('viewToggleCheckbox')) {
    document.getElementById('viewToggleCheckbox').addEventListener('change', (e) => {
        currentViewMode = e.target.checked ? 'grid' : 'list';
        applyFilters();
    });
}

if (document.getElementById('weekDatePicker')) {
    document.getElementById('weekDatePicker').addEventListener('change', (e) => {
        if (e.target.value) {
            // Parse as local date (avoid UTC offset shifting the day)
            const [y, m, d] = e.target.value.split('-').map(Number);
            selectedWeekDate = new Date(y, m - 1, d);
            syncDatePicker(); // normalize to Monday of that week
            applyFilters();
        }
    });
}

// Initialize: load holidays first, then fetch classes
loadHolidays().then(() => {
    syncDatePicker(); // set picker to current week's Monday
    fetchClasses();
});

// Window Exports for inline handlers
window.navigateWeek = navigateWeek;
window.syncDatePicker = syncDatePicker;
window.applyFilters = applyFilters;
window.selectedWeekDate = selectedWeekDate;

window.setViewMode = function(mode) {
    currentViewMode = mode;
    document.getElementById('btnListView').classList.toggle('active', mode === 'list');
    document.getElementById('btnGridView').classList.toggle('active', mode === 'grid');
    applyFilters();
};

window.toggleAccordion = function(dayId) {
    const content = document.getElementById('day-content-' + dayId);
    const icon = document.getElementById('day-icon-' + dayId);
    if (content.style.display === 'none') {
        content.style.display = 'flex';
        icon.style.transform = 'rotate(0deg)';
    } else {
        content.style.display = 'none';
        icon.style.transform = 'rotate(180deg)';
    }
};

