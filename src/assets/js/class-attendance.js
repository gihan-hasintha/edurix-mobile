const API_URL_BASE = window.api.env.API_URL.replace('/students', '');
const STUDENTS_API = window.api.env.API_URL;
const CLASSES_API = `${API_URL_BASE}/classes`;
const CLASS_STUDENTS_API = `${API_URL_BASE}/class_students`;
const X_API_KEY = '996de2d470a0f1e9794b7778e216c193258aac001b36813f9ad1d3f957cc7ee7';

const urlParams = new URLSearchParams(window.location.search);
const classId = urlParams.get('class_id');

let allStudents = [];
let enrolledStudentIds = new Set();
let enrollmentRecords = []; // Stores {id, student_id, class_id}

// ── Request Queue ──────────────────────────────────────────────────
// Guarantees every enroll/remove is saved to the DB in order,
// even when the user clicks very rapidly.
let _saveQueue = [];   // Array of async task functions
let _queueRunning = false;

function enqueueTask(taskFn) {
    _saveQueue.push(taskFn);
    updateSaveBadge();
    if (!_queueRunning) {
        _queueRunning = true;
        runQueue();
    }
}

async function runQueue() {
    while (_saveQueue.length > 0) {
        const task = _saveQueue.shift();
        try {
            await task();
        } catch (e) {
            console.error('Queue task failed:', e);
        }
        updateSaveBadge();
    }
    _queueRunning = false;
    updateSaveBadge();
}

function updateSaveBadge() {
    let badge = document.getElementById('save-pending-badge');
    if (!badge) {
        badge = document.createElement('div');
        badge.id = 'save-pending-badge';
        badge.style.cssText = `
            position: fixed; bottom: 20px; right: 20px; z-index: 9999;
            color: white; border-radius: 20px;
            padding: 10px 18px; font-size: 13px; font-weight: 600;
            display: flex; align-items: center; gap: 10px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.2);
            transition: opacity 0.4s, background 0.3s;
            opacity: 0; pointer-events: none;
        `;
        badge.innerHTML = `
            <div id="save-badge-spinner" style="width:14px;height:14px;border:2px solid rgba(255,255,255,0.3);border-top-color:#fff;border-radius:50%;animation:spin-queue 0.8s linear infinite;"></div>
            <span id="save-badge-text"></span>
            <style>@keyframes spin-queue{to{transform:rotate(360deg)}}</style>
        `;
        document.body.appendChild(badge);
    }
    const pending = _saveQueue.length + (_queueRunning ? 1 : 0);
    const spinner = document.getElementById('save-badge-spinner');
    const badgeText = document.getElementById('save-badge-text');
    if (pending > 0) {
        badge.style.opacity = '1';
        badge.style.pointerEvents = 'none';
        badge.style.background = '#dc2626';
        if (spinner) spinner.style.display = 'block';
        if (badgeText) badgeText.textContent = `Saving ${pending} change${pending > 1 ? 's' : ''}\u2026 Do not refresh!`;
    } else {
        badge.style.background = '#16a34a';
        if (spinner) spinner.style.display = 'none';
        if (badgeText) badgeText.textContent = 'All changes saved \u2713';
        badge.style.opacity = '1';
        badge.style.pointerEvents = 'none';
        setTimeout(() => { badge.style.opacity = '0'; }, 2000);
    }
}

// ── Block page reload/close while saves are still in flight ──
window.addEventListener('beforeunload', (e) => {
    const pending = _saveQueue.length + (_queueRunning ? 1 : 0);
    if (pending > 0) {
        e.preventDefault();
        e.returnValue = `${pending} enrollment change(s) are still saving. If you leave now, this data will be lost.`;
        return e.returnValue;
    }
});
// ────────────────────────────────────────────────────────────────────

async function init() {
    if (!classId) {
        alert('Invalid Class ID');
        window.location.href = 'classes.html';
        return;
    }

    await fetchClassDetails();
    await fetchAllStudents();
    await fetchEnrolledStudents();
}

async function fetchClassDetails() {
    try {
        const response = await fetch(`${CLASSES_API}/${classId}`, {
            headers: { 'x-api-key': X_API_KEY }
        });
        if (!response.ok) throw new Error('Failed to fetch class');
        const cls = await response.json();
        
        const classNameEl = document.getElementById('className');
        if (classNameEl) classNameEl.textContent = cls.name || 'Unknown Class';
        
        document.getElementById('classSchedule').innerHTML = `${cls.classdate || 'N/A'}<br><span style="font-size: 11px; font-weight: 500; color: #1a1a1a;">${cls.classtime || 'N/A'} - ${cls.class_endtime || 'N/A'}</span>`;
        const locElement = document.getElementById('classLocation');
        if(locElement) locElement.textContent = cls.location || 'N/A';
        document.getElementById('classFee').innerHTML = `${cls.fee_amount ? parseFloat(cls.fee_amount).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2}) : '0.00'}<br><span style="font-size: 11px; font-weight: 500; color: #666;">(${cls.payment_type || 'N/A'})</span>`;
    } catch (error) {
        console.error('Error fetching class details:', error);
        const classNameEl = document.getElementById('className');
        if (classNameEl) classNameEl.textContent = 'Error loading class';
        
        document.getElementById('classSchedule').textContent = 'N/A';
        const locElement = document.getElementById('classLocation');
        if(locElement) locElement.textContent = 'N/A';
        document.getElementById('classFee').textContent = 'N/A';
    }
}

async function fetchAllStudents() {
    try {
        const response = await fetch(STUDENTS_API, {
            headers: { 'x-api-key': X_API_KEY }
        });
        if (!response.ok) throw new Error('Failed to fetch students');
        const data = await response.json();
        allStudents = Array.isArray(data) ? data : (data.items || []);
        
        // Filter by current teacher/institution
        const activatedData = localStorage.getItem('Activated_Teacher') || localStorage.getItem('Activated_Institution');
        if (activatedData) {
            const stored = JSON.parse(activatedData);
            const currentId = stored.teacher_id || stored.institution_id;
            allStudents = allStudents.filter(s => s.teacher_id === currentId);
        }
        
        // Show all students by default
        renderSearchResults(allStudents);
    } catch (error) {
        console.error('Error fetching students:', error);
    }
}

async function fetchEnrolledStudents() {
    const loader = document.getElementById('enrollmentLoader');
    try {
        // Fetch all and filter in frontend to ensure compatibility with PostgreSQL
        const response = await fetch(CLASS_STUDENTS_API, {
            headers: { 'x-api-key': X_API_KEY }
        });
        if (!response.ok) throw new Error('Failed to fetch enrollment');
        
        const data = await response.json();
        const items = Array.isArray(data) ? data : (data.items || []);
        
        // Filter records for THIS class only
        // Convert both to strings for safe comparison
        enrollmentRecords = items.filter(r => String(r.class_id) === String(classId));
        
        enrolledStudentIds = new Set(enrollmentRecords.map(r => r.student_id));
        
        renderEnrolledList();
        
        // Also refresh search results to update "ENROLLED" status
        filterSearch();
        
        document.getElementById('studentTotalHeader').textContent = `${enrolledStudentIds.size}`;
        if(document.getElementById('enrolledBadgeCount')) document.getElementById('enrolledBadgeCount').textContent = `${enrolledStudentIds.size} Students`;
        if(document.getElementById('enrolledTabBadge')) document.getElementById('enrolledTabBadge').textContent = `${enrolledStudentIds.size}`;
    } catch (error) {
        console.error('Error fetching enrollment:', error);
    } finally {
        if (loader) loader.style.display = 'none';
    }
}

function renderSearchResults(students) {
    const resultsBox = document.getElementById('searchResults');
    resultsBox.innerHTML = '';
    
    if (document.getElementById('searchCountText')) {
        document.getElementById('searchCountText').textContent = `Showing ${students.length} of ${allStudents.length} students`;
    }
    
    if (students.length === 0) {
        resultsBox.innerHTML = '<p style="text-align: center; color: #999; margin-top: 20px;">No students found.</p>';
        return;
    }

    students.forEach(s => {
        const isEnrolled = enrolledStudentIds.has(s.id);
        const div = document.createElement('div');
        div.className = 'student-item';
        
        let typeColor = s.class_type === 'Online' ? '#3b82f6' : (s.class_type === 'Both' ? '#8b5cf6' : '#10b981');
        let classTypeHtml = s.class_type ? `<span style="background: ${typeColor}20; color: ${typeColor}; padding: 1px 4px; border-radius: 4px; font-size: 10px; font-weight: bold; margin-left: 6px; vertical-align: middle;">${s.class_type.toUpperCase()}</span>` : '';
        
        div.innerHTML = `
            <div class="student-info">
                <div class="student-img" style="background-image: url('${s.student_photo || './assets/img/student-blank-image.jpg'}'), url('./assets/img/student-blank-image.jpg');"></div>
                <div class="student-details">
                    <strong>${s.student_name} ${classTypeHtml}</strong>
                    <small>${s.student_id || ''}</small>
                </div>
            </div>
            ${isEnrolled ? `
            <div class="status-enrolled">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                ENROLLED
            </div>` : 
            `<button class="btn-enroll" onclick="addStudent('${s.id}')">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="8.5" cy="7" r="4"></circle><line x1="20" y1="8" x2="20" y2="14"></line><line x1="23" y1="11" x2="17" y2="11"></line></svg>
                Enroll
            </button>`}
        `;
        resultsBox.appendChild(div);
    });
}

function filterSearch() {
    const term = document.getElementById('studentSearchInput') ? document.getElementById('studentSearchInput').value.toLowerCase() : '';
    const status = document.getElementById('statusFilter') ? document.getElementById('statusFilter').value : 'all';
    const classType = document.getElementById('classTypeFilter') ? document.getElementById('classTypeFilter').value : 'all';
    
    let filtered = allStudents;

    if (term) {
        filtered = filtered.filter(s => 
            (s.student_name && s.student_name.toLowerCase().includes(term)) ||
            (s.student_id && s.student_id.toLowerCase().includes(term)) ||
            (s.nfc_number && s.nfc_number.toLowerCase().includes(term))
        );
    }

    if (classType !== 'all') {
        filtered = filtered.filter(s => {
            const type = s.class_type || 'Physical';
            return type === classType;
        });
    }

    if (status === 'enrolled') {
        filtered = filtered.filter(s => enrolledStudentIds.has(s.id));
    } else if (status === 'not_enrolled') {
        filtered = filtered.filter(s => !enrolledStudentIds.has(s.id));
    }

    renderSearchResults(filtered);
}

// Search functionality
document.getElementById('studentSearchInput').addEventListener('input', filterSearch);

// Status filter functionality
const statusFilter = document.getElementById('statusFilter');
if (statusFilter) {
    statusFilter.addEventListener('change', filterSearch);
}

// Class type filter functionality
const classTypeFilter = document.getElementById('classTypeFilter');
if (classTypeFilter) {
    classTypeFilter.addEventListener('change', filterSearch);
}

function renderEnrolledList() {
    const list = document.getElementById('enrolledList');
    list.innerHTML = '';

    const enrolledStudents = allStudents.filter(s => enrolledStudentIds.has(s.id));

    if (document.getElementById('enrolledCountText')) {
        document.getElementById('enrolledCountText').textContent = `Showing ${enrolledStudents.length} of ${enrolledStudentIds.size} enrolled students`;
    }

    if (enrolledStudents.length === 0) {
        list.innerHTML = '<p style="text-align: center; color: #999; margin-top: 20px;">No students enrolled yet.</p>';
        return;
    }

    enrolledStudents.forEach(s => {
        const record = enrollmentRecords.find(r => r.student_id === s.id);
        const div = document.createElement('div');
        div.className = 'student-item';
        
        let typeColor = s.class_type === 'Online' ? '#3b82f6' : (s.class_type === 'Both' ? '#8b5cf6' : '#10b981');
        let classTypeHtml = s.class_type ? `<span style="background: ${typeColor}20; color: ${typeColor}; padding: 1px 4px; border-radius: 4px; font-size: 10px; font-weight: bold; margin-left: 6px; vertical-align: middle;">${s.class_type.toUpperCase()}</span>` : '';
        
        div.innerHTML = `
            <div class="student-info">
                <div class="student-img" style="background-image: url('${s.student_photo || './assets/img/student-blank-image.jpg'}'), url('./assets/img/student-blank-image.jpg');"></div>
                <div class="student-details">
                    <strong>${s.student_name} ${classTypeHtml}</strong>
                    <small>${s.student_id || ''}</small>
                </div>
            </div>
            <button class="btn-remove" onclick="removeStudent('${record.id}')">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                Remove
            </button>
        `;
        list.appendChild(div);
    });
}

function addStudent(studentId) {
    const now = new Date().toISOString();
    const tempRecordId = 'temp_' + Date.now();

    // ── Instant optimistic UI update (runs immediately, before any network) ──
    enrolledStudentIds.add(studentId);
    enrollmentRecords.push({
        id: tempRecordId,
        student_id: studentId,
        class_id: classId,
        created: now,
        updated: now
    });
    renderEnrolledList();
    document.getElementById('studentTotalHeader').textContent = `${enrolledStudentIds.size}`;
    if(document.getElementById('enrolledBadgeCount')) document.getElementById('enrolledBadgeCount').textContent = `${enrolledStudentIds.size} Students`;
    if(document.getElementById('enrolledTabBadge')) document.getElementById('enrolledTabBadge').textContent = `${enrolledStudentIds.size}`;
    filterSearch();

    // ── Queue the DB save so it never races with other rapid clicks ──
    enqueueTask(async () => {
        try {
            const response = await fetch(CLASS_STUDENTS_API, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-api-key': X_API_KEY },
                body: JSON.stringify({ class_id: classId, student_id: studentId, created: now, updated: now })
            });

            if (response.ok) {
                const createdRecord = await response.json().catch(() => null);
                if (createdRecord && createdRecord.id) {
                    const rec = enrollmentRecords.find(r => r.id === tempRecordId);
                    if (rec) rec.id = createdRecord.id;
                    renderEnrolledList();
                } else {
                    fetchEnrolledStudents(); // fallback: refresh from DB
                }
            } else {
                // Revert on failure
                enrolledStudentIds.delete(studentId);
                enrollmentRecords = enrollmentRecords.filter(r => r.id !== tempRecordId);
                renderEnrolledList();
                document.getElementById('studentTotalHeader').textContent = `${enrolledStudentIds.size}`;
                if(document.getElementById('enrolledBadgeCount')) document.getElementById('enrolledBadgeCount').textContent = `${enrolledStudentIds.size} Students`;
                if(document.getElementById('enrolledTabBadge')) document.getElementById('enrolledTabBadge').textContent = `${enrolledStudentIds.size}`;
                filterSearch();
                console.error('Failed to enroll student – server returned error.');
            }
        } catch (error) {
            console.error('Error adding student:', error);
            enrolledStudentIds.delete(studentId);
            enrollmentRecords = enrollmentRecords.filter(r => r.id !== tempRecordId);
            renderEnrolledList();
            filterSearch();
        }
    });
}

async function removeStudent(recordId) {
    if (!(await window.customConfirm('Are you sure you want to remove this student from the class?'))) return;

    const record = enrollmentRecords.find(r => String(r.id) === String(recordId));
    if (!record) return;

    const studentId = record.student_id;

    // ── Instant optimistic UI update ──
    enrolledStudentIds.delete(studentId);
    enrollmentRecords = enrollmentRecords.filter(r => String(r.id) !== String(recordId));
    renderEnrolledList();
    document.getElementById('studentTotalHeader').textContent = `${enrolledStudentIds.size}`;
    if(document.getElementById('enrolledBadgeCount')) document.getElementById('enrolledBadgeCount').textContent = `${enrolledStudentIds.size} Students`;
    if(document.getElementById('enrolledTabBadge')) document.getElementById('enrolledTabBadge').textContent = `${enrolledStudentIds.size}`;
    filterSearch();

    // ── Queue the DB delete ──
    enqueueTask(async () => {
        try {
            const response = await fetch(`${CLASS_STUDENTS_API}/${recordId}`, {
                method: 'DELETE',
                headers: { 'x-api-key': X_API_KEY }
            });
            if (!response.ok) {
                // Revert on failure
                enrolledStudentIds.add(studentId);
                enrollmentRecords.push(record);
                renderEnrolledList();
                document.getElementById('studentTotalHeader').textContent = `${enrolledStudentIds.size}`;
                if(document.getElementById('enrolledBadgeCount')) document.getElementById('enrolledBadgeCount').textContent = `${enrolledStudentIds.size} Students`;
                if(document.getElementById('enrolledTabBadge')) document.getElementById('enrolledTabBadge').textContent = `${enrolledStudentIds.size}`;
                filterSearch();
                console.error('Failed to remove student – server returned error.');
            }
        } catch (error) {
            console.error('Error removing student:', error);
            enrolledStudentIds.add(studentId);
            enrollmentRecords.push(record);
            renderEnrolledList();
            filterSearch();
        }
    });
}

function editCurrentClass() {
    window.location.href = `classes.html?edit=${classId}`;
}

function viewAllStudents(e) {
    if (e) e.preventDefault();
    const searchInput = document.getElementById('studentSearchInput');
    if (searchInput) searchInput.value = '';
    const statusFilter = document.getElementById('statusFilter');
    if (statusFilter) statusFilter.value = 'all';
    const classTypeFilter = document.getElementById('classTypeFilter');
    if (classTypeFilter) classTypeFilter.value = 'all';
    filterSearch();
}

function exportEnrolledList(e) {
    if (e) e.preventDefault();
    const enrolledStudents = allStudents.filter(s => enrolledStudentIds.has(s.id));
    if (enrolledStudents.length === 0) {
        alert("No students to export.");
        return;
    }
    
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Student ID,Student Name\n";
    
    enrolledStudents.forEach(s => {
        const id = s.student_id ? String(s.student_id).replace(/,/g, '') : '';
        const name = s.student_name ? String(s.student_name).replace(/,/g, '') : '';
        csvContent += `${id},${name}\n`;
    });
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "enrolled_students.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

window.addStudent = addStudent;
window.removeStudent = removeStudent;
window.editCurrentClass = editCurrentClass;
window.viewAllStudents = viewAllStudents;
window.exportEnrolledList = exportEnrolledList;

init();

window.scancardfunbt = function() {
    const nfcWindow = document.getElementById('nfc-scanning-window');
    if (nfcWindow) {
        nfcWindow.style.display = 'block';
        nfcWindow.onclick = () => {
            const n = document.getElementById('nfc-number');
            if (n) n.focus();
        };
    }
    const nfcInput = document.getElementById('nfc-number');
    if (nfcInput) {
        nfcInput.value = '';
        setTimeout(() => { nfcInput.focus(); }, 50);
    }
};

window.closeNfcScanner = function() {
    const nfcWindow = document.getElementById('nfc-scanning-window');
    if (nfcWindow) {
        nfcWindow.style.display = 'none';
    }
};

const nfcInputObj = document.getElementById('nfc-number');
if (nfcInputObj) {
    nfcInputObj.addEventListener('input', function(e) {
        const val = e.target.value.trim();
        if (val.length >= 8) {
            closeNfcScanner();
            document.getElementById('studentSearchInput').value = val;
            filterSearch();
            e.target.value = '';
        }
    });
}

window.switchTab = function(tabId) {
    const enrollNewContent = document.getElementById('enrollNewContent');
    const enrolledContent = document.getElementById('enrolledStudentsContent');
    
    if (enrollNewContent) {
        enrollNewContent.classList.remove('active-tab-content');
        enrollNewContent.style.display = 'none';
    }
    if (enrolledContent) {
        enrolledContent.classList.remove('active-tab-content');
        enrolledContent.style.display = 'none';
    }
    
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    
    const targetContent = document.getElementById(tabId + 'Content');
    if (targetContent) {
        targetContent.classList.add('active-tab-content');
        targetContent.style.display = 'flex';
    }
    
    const buttons = document.querySelectorAll('.tab-btn');
    if (buttons.length >= 2) {
        if (tabId === 'enrollNew') {
            buttons[0].classList.add('active');
        } else {
            buttons[1].classList.add('active');
        }
    }
};
