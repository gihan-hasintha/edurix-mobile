// ============================================
// Exam Scheduler — exam-scheduler.js
// Stores exams in localStorage per teacher ID
// ============================================

const API_URL_BASE = window.api.env.API_URL.replace('/students', '');
const CLASSES_API  = `${API_URL_BASE}/classes`;
const X_API_KEY    = '996de2d470a0f1e9794b7778e216c193258aac001b36813f9ad1d3f957cc7ee7';

let allClasses = [];
let allExams   = [];
let editingExamId = null;

// ---- Helpers ----

function getActivatedId() {
    const data = localStorage.getItem('Activated_Teacher') || localStorage.getItem('Activated_Institution');
    if (!data) return null;
    const stored = JSON.parse(data);
    return stored.teacher_id || stored.institution_id;
}

function getStorageKey() {
    return `edurix_exams_${getActivatedId()}`;
}

function loadExamsFromStorage() {
    const raw = localStorage.getItem(getStorageKey());
    return raw ? JSON.parse(raw) : [];
}

function saveExamsToStorage(exams) {
    localStorage.setItem(getStorageKey(), JSON.stringify(exams));
}

function generateId() {
    return 'exam_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
}

function formatDate(dateStr) {
    if (!dateStr) return '—';
    const [y, m, d] = dateStr.split('-').map(Number);
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${d} ${months[m - 1]} ${y}`;
}

function formatTime(timeStr) {
    if (!timeStr) return '';
    const [h, min] = timeStr.split(':').map(Number);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const hr = h % 12 || 12;
    return `${hr}:${String(min).padStart(2,'0')} ${ampm}`;
}

function getExamStatus(dateStr) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const [y, m, d] = dateStr.split('-').map(Number);
    const examDate = new Date(y, m - 1, d);
    if (examDate < today)  return 'completed';
    if (examDate.getTime() === today.getTime()) return 'today';
    return 'upcoming';
}

function getClassNameById(classId) {
    const cls = allClasses.find(c => String(c.id) === String(classId));
    return cls ? cls.name : 'Unknown Class';
}

// ---- Fetch Classes from API ----

async function fetchClasses() {
    const currentId = getActivatedId();
    if (!currentId) {
        document.getElementById('main-application').innerHTML = `
            <div style="padding:60px; text-align:center;">
                <h2>Activation Required</h2>
                <p>Please activate your account to use the Exam Scheduler.</p>
            </div>`;
        return;
    }

    try {
        const res = await fetch(CLASSES_API, { headers: { 'x-api-key': X_API_KEY } });
        if (!res.ok) throw new Error('Failed to fetch classes');
        const data = await res.json();
        const items = Array.isArray(data) ? data : (data.items || []);
        allClasses = items.filter(c => c.teacher_id === currentId);
    } catch (e) {
        console.warn('Could not load classes:', e);
        allClasses = [];
    }

    populateClassDropdowns();
    allExams = loadExamsFromStorage();
    renderExams();
}

// ---- Populate Class Dropdowns ----

function populateClassDropdowns() {
    const examClassSelect  = document.getElementById('examClass');
    const filterClassSelect = document.getElementById('filterClass');

    const examOptions = allClasses.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
    examClassSelect.innerHTML = `<option value="">Select Class</option>${examOptions}`;

    const filterOptions = allClasses.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
    filterClassSelect.innerHTML = `<option value="All">All Classes</option>${filterOptions}`;
}

// ---- Render Exams ----

function renderExams() {
    const filterClass  = document.getElementById('filterClass').value;
    const filterStatus = document.getElementById('filterStatus').value;

    let exams = [...allExams].sort((a, b) => a.exam_date.localeCompare(b.exam_date));

    if (filterClass !== 'All') {
        exams = exams.filter(e => String(e.class_id) === String(filterClass));
    }
    if (filterStatus !== 'All') {
        exams = exams.filter(e => {
            const s = getExamStatus(e.exam_date);
            if (filterStatus === 'Upcoming') return s === 'upcoming' || s === 'today';
            if (filterStatus === 'Completed') return s === 'completed';
            return true;
        });
    }

    const grid  = document.getElementById('examGrid');
    const empty = document.getElementById('examEmpty');

    updateStats();

    if (exams.length === 0) {
        grid.innerHTML = '';
        empty.classList.remove('hidden');
        return;
    }

    empty.classList.add('hidden');
    grid.innerHTML = exams.map(exam => buildExamCard(exam)).join('');
}

function buildExamCard(exam) {
    const status    = getExamStatus(exam.exam_date);
    const className = getClassNameById(exam.class_id);
    const timeRange = exam.start_time ? `${formatTime(exam.start_time)} – ${formatTime(exam.end_time)}` : '—';

    const badgeClass = status === 'today' ? 'badge-today' : status === 'completed' ? 'badge-completed' : 'badge-upcoming';
    const badgeLabel = status === 'today' ? '📌 Today' : status === 'completed' ? '✓ Completed' : '⏳ Upcoming';

    const notesHtml = exam.notes
        ? `<div class="exam-card-notes">${exam.notes}</div>` : '';
    const marksHtml = exam.max_marks
        ? `<div class="exam-card-marks"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="6"></circle><path d="M15.477 12.89L17 22l-5-3-5 3 1.523-9.11"></path></svg> ${exam.max_marks} Marks</div>` : '';

    const completeBtn = status !== 'completed'
        ? `<button class="exam-action-btn complete-btn" onclick="markCompleted('${exam.id}')">
               <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
               Mark Done
           </button>` : '';

    return `
        <div class="exam-card ${status}" id="card_${exam.id}">
            <div class="exam-card-accent"></div>
            <div class="exam-card-body">
                <div class="exam-card-top">
                    <div>
                        <div class="exam-card-title">${exam.title}</div>
                        <div class="exam-card-class">${className}</div>
                    </div>
                    <span class="exam-status-badge ${badgeClass}">${badgeLabel}</span>
                </div>
                <div class="exam-card-meta">
                    <div class="exam-meta-row">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                        ${formatDate(exam.exam_date)}
                    </div>
                    <div class="exam-meta-row">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                        ${timeRange}
                    </div>
                    ${exam.location ? `<div class="exam-meta-row">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
                        ${exam.location}
                    </div>` : ''}
                </div>
                ${marksHtml}
                ${notesHtml}
            </div>
            <div class="exam-card-actions">
                <button class="exam-action-btn edit-btn" onclick="openEditExam('${exam.id}')">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                    Edit
                </button>
                ${completeBtn}
                <button class="exam-action-btn delete-btn" onclick="deleteExam('${exam.id}')">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6M14 11v6"></path></svg>
                    Delete
                </button>
            </div>
        </div>
    `;
}

// ---- Stats ----

function updateStats() {
    const total     = allExams.length;
    const upcoming  = allExams.filter(e => { const s = getExamStatus(e.exam_date); return s === 'upcoming' || s === 'today'; }).length;
    const completed = allExams.filter(e => getExamStatus(e.exam_date) === 'completed').length;

    document.getElementById('statTotalNum').textContent    = total;
    document.getElementById('statUpcomingNum').textContent = upcoming;
    document.getElementById('statCompletedNum').textContent= completed;

    // Next upcoming exam date
    const nextExam = allExams
        .filter(e => getExamStatus(e.exam_date) === 'upcoming')
        .sort((a, b) => a.exam_date.localeCompare(b.exam_date))[0];
    document.getElementById('statNextDate').textContent = nextExam ? formatDate(nextExam.exam_date) : '—';
}

// ---- Modal ----

function openExamModal() {
    editingExamId = null;
    document.getElementById('examForm').reset();
    document.getElementById('examModalTitle').textContent = 'Schedule New Exam';
    document.getElementById('examSaveBtn').textContent    = 'Save Exam';

    // Default exam date to today
    const today = new Date();
    const iso = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
    document.getElementById('examDate').value = iso;

    document.getElementById('examModal').classList.add('open');
}

function openEditExam(examId) {
    const exam = allExams.find(e => e.id === examId);
    if (!exam) return;

    editingExamId = examId;
    document.getElementById('examTitle').value      = exam.title       || '';
    document.getElementById('examClass').value      = exam.class_id    || '';
    document.getElementById('examDate').value       = exam.exam_date   || '';
    document.getElementById('examStartTime').value  = exam.start_time  || '';
    document.getElementById('examEndTime').value    = exam.end_time    || '';
    document.getElementById('examLocation').value   = exam.location    || '';
    document.getElementById('examMaxMarks').value   = exam.max_marks   || '';
    document.getElementById('examNotes').value      = exam.notes       || '';

    document.getElementById('examModalTitle').textContent = 'Edit Exam';
    document.getElementById('examSaveBtn').textContent    = 'Update Exam';
    document.getElementById('examModal').classList.add('open');
}

function closeExamModal() {
    document.getElementById('examModal').classList.remove('open');
    document.getElementById('examForm').reset();
    editingExamId = null;
}

function closeModalOnOverlay(e) {
    if (e.target === document.getElementById('examModal')) {
        closeExamModal();
    }
}

// ---- Save Exam ----

function saveExam(e) {
    e.preventDefault();

    const saveBtn = document.getElementById('examSaveBtn');
    saveBtn.disabled = true;

    const exam = {
        id:         editingExamId || generateId(),
        title:      document.getElementById('examTitle').value.trim(),
        class_id:   document.getElementById('examClass').value,
        exam_date:  document.getElementById('examDate').value,
        start_time: document.getElementById('examStartTime').value,
        end_time:   document.getElementById('examEndTime').value,
        location:   document.getElementById('examLocation').value.trim(),
        max_marks:  document.getElementById('examMaxMarks').value ? Number(document.getElementById('examMaxMarks').value) : null,
        notes:      document.getElementById('examNotes').value.trim(),
        created:    editingExamId ? (allExams.find(e => e.id === editingExamId)?.created || new Date().toISOString()) : new Date().toISOString(),
        updated:    new Date().toISOString()
    };

    if (editingExamId) {
        const idx = allExams.findIndex(e => e.id === editingExamId);
        if (idx !== -1) allExams[idx] = exam;
    } else {
        allExams.push(exam);
    }

    saveExamsToStorage(allExams);
    closeExamModal();
    renderExams();

    saveBtn.disabled = false;
}

// ---- Delete Exam ----

async function deleteExam(examId) {
    if (!(await window.customConfirm?.('Delete this exam? This cannot be undone.') ?? confirm('Delete this exam? This cannot be undone.'))) return;
    allExams = allExams.filter(e => e.id !== examId);
    saveExamsToStorage(allExams);
    renderExams();
}

// ---- Mark Completed (manually moves exam date to yesterday if needed) ----

function markCompleted(examId) {
    const exam = allExams.find(e => e.id === examId);
    if (!exam) return;
    // Mark as completed by shifting date to yesterday if still upcoming
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const iso = `${yesterday.getFullYear()}-${String(yesterday.getMonth()+1).padStart(2,'0')}-${String(yesterday.getDate()).padStart(2,'0')}`;
    exam.exam_date = iso;
    exam.updated   = new Date().toISOString();
    saveExamsToStorage(allExams);
    renderExams();
}

// ---- Filters ----

document.getElementById('filterClass').addEventListener('change', renderExams);
document.getElementById('filterStatus').addEventListener('change', renderExams);

// ---- Init ----

fetchClasses();
