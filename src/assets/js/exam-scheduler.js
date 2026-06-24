// ============================================
// Exam Scheduler — exam-scheduler.js
// Stores exams in localStorage per teacher ID
// ============================================

// Ensure window.api.env is available (fallback for module loading order)
window.api = window.api || {};
window.api.env = window.api.env || {
    API_URL: 'https://api.edurix.imatap.com/students',
    BASE_API_URL: 'https://api.edurix.imatap.com',
    X_API_KEY: '996de2d470a0f1e9794b7778e216c193258aac001b36813f9ad1d3f957cc7ee7',
    APP_VERSION: '1.0.0'
};

const API_URL_BASE = window.api.env.API_URL.replace('/students', '');
const CLASSES_API  = `${API_URL_BASE}/classes`;
const STUDENTS_API = `${API_URL_BASE}/students`;
const CLASS_STUDENTS_API = `${API_URL_BASE}/class_students`;
const EXAMS_API    = `${API_URL_BASE}/exams`;
const X_API_KEY    = '996de2d470a0f1e9794b7778e216c193258aac001b36813f9ad1d3f957cc7ee7';

// Cloudinary Configuration removed in favor of Google Drive API


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

function formatDate(dateStr) {
    if (!dateStr) return '—';
    const datePart = dateStr.split(' ')[0];
    const [y, m, d] = datePart.split('-').map(Number);
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
    if (!dateStr) return 'upcoming';
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const datePart = dateStr.split(' ')[0];
    const [y, m, d] = datePart.split('-').map(Number);
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
    await fetchExams();
}

// ---- Fetch Exams from API ----
async function fetchExams() {
    const currentId = getActivatedId();
    if (!currentId) return;

    // Show loader
    const loader = document.getElementById('examLoader');
    const grid   = document.getElementById('examGrid');
    const empty  = document.getElementById('examEmpty');
    if (loader) loader.classList.remove('hidden');
    if (grid)   grid.innerHTML = '';
    if (empty)  empty.classList.add('hidden');

    try {
        const res = await fetch(`${EXAMS_API}?teacher_id=${currentId}`, { headers: { 'x-api-key': X_API_KEY } });
        if (!res.ok) throw new Error('Failed to fetch exams');
        const data = await res.json();
        const all = Array.isArray(data) ? data : (data.items || []);
        // Filter by teacher_id client-side (API may return all records)
        allExams = all.filter(e => String(e.teacher_id) === String(currentId));
    } catch (e) {
        console.warn('Could not load exams from DB:', e);
        allExams = [];
        if (loader) loader.classList.add('hidden');
        if (empty) {
            empty.classList.remove('hidden');
            const emptyH3 = empty.querySelector('h3');
            const emptyP  = empty.querySelector('p');
            if (emptyH3) emptyH3.textContent = 'Could not load exams';
            if (emptyP)  emptyP.innerHTML = 'Check your internet connection and <a href="" onclick="location.reload();return false;">try again</a>.';
        }
        return;
    }

    if (loader) loader.classList.add('hidden');
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

    let exams = [...allExams].sort((a, b) => (a.exam_date || '').localeCompare(b.exam_date || ''));

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
    const badgeLabel = status === 'today' 
        ? '<svg style="width:14px;height:14px;margin-right:4px;vertical-align:middle;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg> Today' 
        : status === 'completed' 
        ? '<svg style="width:14px;height:14px;margin-right:4px;vertical-align:middle;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg> Completed' 
        : '<svg style="width:14px;height:14px;margin-right:4px;vertical-align:middle;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg> Upcoming';

    const notesHtml = exam.notes
        ? `<div class="exam-card-notes">${exam.notes}</div>` : '';
    const marksHtml = exam.max_marks
        ? `<div class="exam-card-marks"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="6"></circle><path d="M15.477 12.89L17 22l-5-3-5 3 1.523-9.11"></path></svg> ${exam.max_marks} Marks</div>` : '';

    const completeBtn = status !== 'completed'
        ? `<button class="exam-action-btn complete-btn" onclick="markCompleted('${exam.id}')">
               <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
               Mark Done
           </button>` : '';

    let optimizedPaperUrl = exam.paper_url;
    if (optimizedPaperUrl && optimizedPaperUrl.includes('drive.google.com') && optimizedPaperUrl.includes('/view')) {
        optimizedPaperUrl = optimizedPaperUrl.replace(/\/view.*$/, '/preview');
    }

    const viewPaperBtn = optimizedPaperUrl 
        ? `<a href="pdf-viewer.html?url=${encodeURIComponent(optimizedPaperUrl)}" target="_blank" class="exam-action-btn" style="color: #805ad5; background: #faf5ff; text-decoration: none; box-sizing: border-box;" title="View Paper">
               <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
               View Paper
           </a>` 
        : '';

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
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2-2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                    Edit
                </button>
                ${completeBtn}
                ${viewPaperBtn}
                <button class="exam-action-btn" style="color: #3182ce; background: #ebf8ff;" onclick="openUploadPaperModal('${exam.id}')" title="Upload New Paper">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
                    Upload
                </button>
                <button class="exam-action-btn" style="color: #38a169; background: #f0fff4;" onclick="openMarkResultsModal('${exam.id}', '${exam.class_id}')">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 11 12 14 22 4"></polyline><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path></svg>
                    Results
                </button>
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
    
    document.getElementById('examPaperUrl').value = '';
    document.getElementById('examPaperUploadStatus').textContent = '';
    document.getElementById('examPaperLinkContainerMain').style.display = 'none';
    document.getElementById('mainDriveProgressWrap').style.display = 'none';

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
    
    document.getElementById('examPaperUrl').value   = exam.paper_url   || '';
    document.getElementById('examPaperUploadStatus').textContent = '';
    document.getElementById('mainDriveProgressWrap').style.display = 'none';
    const fileInput = document.getElementById('examPaperFileMain');
    if(fileInput) fileInput.value = '';
    
    const linkContainer = document.getElementById('examPaperLinkContainerMain');
    const linkObj = document.getElementById('examPaperLinkMain');
    if (exam.paper_url && linkContainer && linkObj) {
        linkContainer.style.display = 'block';
        linkObj.href = exam.paper_url;
    } else if (linkContainer) {
        linkContainer.style.display = 'none';
    }

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

async function saveExam(e) {
    e.preventDefault();

    const saveBtn = document.getElementById('examSaveBtn');
    saveBtn.disabled = true;
    
    const fileInput = document.getElementById('examPaperFileMain');
    const statusDiv = document.getElementById('examPaperUploadStatus');
    let paperUrl = document.getElementById('examPaperUrl').value;

    if (fileInput && fileInput.files.length > 0) {
        if (!window.DriveAuth || !window.DriveAuth.currentUser) {
            statusDiv.textContent = 'Please sign in with Google to upload.';
            statusDiv.style.color = 'red';
            saveBtn.disabled = false;
            return;
        }

        statusDiv.textContent = 'Uploading paper to Google Drive...';
        statusDiv.style.color = '#3182ce';
        const file = fileInput.files[0];
        const progressWrap = document.getElementById('mainDriveProgressWrap');
        const progressFill = document.getElementById('mainDriveProgressFill');
        const progressLabel = document.getElementById('mainDriveProgressLabel');
        const progressPct = document.getElementById('mainDriveProgressPct');
        
        progressWrap.style.display = 'block';

        try {
            await window.DriveAuth.ensureAccessToken();
            const fileId = await window.DriveAuth.uploadFile(file, (pct, msg) => {
                progressFill.style.width = pct + '%';
                progressLabel.textContent = msg;
                progressPct.textContent = pct + '%';
            });
            
            progressLabel.textContent = 'Making file accessible...';
            progressFill.style.width = '80%';
            progressPct.textContent = '80%';
            
            await window.DriveAuth.setPermission(fileId);
            
            progressLabel.textContent = 'Done!';
            progressFill.style.width = '100%';
            progressPct.textContent = '100%';

            paperUrl = `https://drive.google.com/file/d/${fileId}/view?usp=sharing`;
            statusDiv.textContent = 'Upload successful!';
            statusDiv.style.color = 'green';
            setTimeout(() => { progressWrap.style.display = 'none'; }, 1500);
        } catch (err) {
            console.error('Drive upload error:', err);
            statusDiv.textContent = 'Upload failed: ' + err.message;
            statusDiv.style.color = 'red';
            progressWrap.style.display = 'none';
            saveBtn.disabled = false;
            return; // Stop saving if upload fails
        }
    }

    const currentId = getActivatedId();
    const now = new Date().toISOString();
    
    const examDate = document.getElementById('examDate').value;
    const startTime = document.getElementById('examStartTime').value;
    const endTime = document.getElementById('examEndTime').value;
    const location = document.getElementById('examLocation').value.trim();
    const maxMarks = document.getElementById('examMaxMarks').value;
    const notes = document.getElementById('examNotes').value.trim();

    const examPayload = {
        title:      document.getElementById('examTitle').value.trim(),
        class_id:   document.getElementById('examClass').value,
        teacher_id: currentId,
        updated:    now
    };

    if (examDate) examPayload.exam_date = examDate + ' 00:00:00.000Z'; // Ensure it is a valid PocketBase datetime if needed
    if (startTime) examPayload.start_time = startTime;
    if (endTime) examPayload.end_time = endTime;
    if (location) examPayload.location = location;
    if (maxMarks) examPayload.max_marks = Number(maxMarks);
    if (notes) examPayload.notes = notes;
    if (paperUrl) examPayload.paper_url = paperUrl;

    if (!editingExamId) {
        examPayload.created = now;
    } else {
        const exam = allExams.find(e => e.id === editingExamId);
        if (exam && exam.created) {
            examPayload.created = exam.created;
        }
    }

    try {
        const url = editingExamId ? `${EXAMS_API}/${editingExamId}` : EXAMS_API;
        const method = editingExamId ? 'PUT' : 'POST';

        const response = await fetch(url, {
            method: method,
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': X_API_KEY
            },
            body: JSON.stringify(examPayload)
        });

        if (!response.ok) throw new Error('Failed to save exam');

        closeExamModal();
        await fetchExams();
    } catch (error) {
        console.error('Error saving exam:', error);
        alert('Failed to save exam. Please try again.');
    } finally {
        saveBtn.disabled = false;
    }
}

// ---- Delete Exam ----

async function deleteExam(examId) {
    if (!(await window.customConfirm?.('Delete this exam? This cannot be undone.') ?? confirm('Delete this exam? This cannot be undone.'))) return;
    try {
        const response = await fetch(`${EXAMS_API}/${examId}`, {
            method: 'DELETE',
            headers: { 'x-api-key': X_API_KEY }
        });
        if (!response.ok) throw new Error('Failed to delete exam');
        await fetchExams();
    } catch (error) {
        console.error('Error deleting exam:', error);
        alert('Failed to delete exam.');
    }
}

// ---- Mark Completed (manually moves exam date to yesterday if needed) ----

async function markCompleted(examId) {
    const exam = allExams.find(e => e.id === examId);
    if (!exam) return;
    
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const iso = `${yesterday.getFullYear()}-${String(yesterday.getMonth()+1).padStart(2,'0')}-${String(yesterday.getDate()).padStart(2,'0')} 00:00:00.000Z`;
    
    try {
        const response = await fetch(`${EXAMS_API}/${examId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': X_API_KEY
            },
            body: JSON.stringify({ exam_date: iso })
        });
        if (!response.ok) throw new Error('Failed to update status');
        await fetchExams();
    } catch (error) {
        console.error('Error marking as completed:', error);
        alert('Failed to mark exam as completed.');
    }
}

// ---- Filters ----

document.getElementById('filterClass').addEventListener('change', renderExams);
document.getElementById('filterStatus').addEventListener('change', renderExams);

// ---- Upload Paper Modal & Cloudinary ----
let paperExamId = null;

function openUploadPaperModal(examId) {
    paperExamId = examId;
    const exam = allExams.find(e => e.id === examId);
    
    document.getElementById('examPaperFile').value = '';
    document.getElementById('uploadPaperStatus').textContent = '';
    document.getElementById('uploadDriveProgressWrap').style.display = 'none';
    
    const linkContainer = document.getElementById('examPaperLinkContainer');
    const linkObj = document.getElementById('examPaperLink');
    if (exam && exam.paper_url) {
        linkContainer.style.display = 'block';
        linkObj.href = exam.paper_url;
    } else {
        linkContainer.style.display = 'none';
    }

    document.getElementById('uploadPaperModal').classList.add('open');
}

function closeUploadPaperModal() {
    document.getElementById('uploadPaperModal').classList.remove('open');
    paperExamId = null;
}

function closeUploadPaperModalOverlay(e) {
    if (e.target === document.getElementById('uploadPaperModal')) {
        closeUploadPaperModal();
    }
}

async function uploadPaperToDrive() {
    const fileInput = document.getElementById('examPaperFile');
    const statusDiv = document.getElementById('uploadPaperStatus');
    const file = fileInput.files[0];
    
    if (!file) {
        statusDiv.textContent = 'Please select a PDF file first.';
        statusDiv.style.color = 'red';
        return;
    }
    
    if (!window.DriveAuth || !window.DriveAuth.currentUser) {
        statusDiv.textContent = 'Please sign in with Google to upload.';
        statusDiv.style.color = 'red';
        return;
    }

    statusDiv.textContent = 'Uploading to Google Drive...';
    statusDiv.style.color = '#3182ce';
    
    const progressWrap = document.getElementById('uploadDriveProgressWrap');
    const progressFill = document.getElementById('uploadDriveProgressFill');
    const progressLabel = document.getElementById('uploadDriveProgressLabel');
    const progressPct = document.getElementById('uploadDriveProgressPct');
    
    progressWrap.style.display = 'block';

    try {
        await window.DriveAuth.ensureAccessToken();
        
        const fileId = await window.DriveAuth.uploadFile(file, (pct, msg) => {
            progressFill.style.width = pct + '%';
            progressLabel.textContent = msg;
            progressPct.textContent = pct + '%';
        });
        
        progressLabel.textContent = 'Making file accessible...';
        progressFill.style.width = '80%';
        progressPct.textContent = '80%';
        
        await window.DriveAuth.setPermission(fileId);
        
        progressLabel.textContent = 'Done!';
        progressFill.style.width = '100%';
        progressPct.textContent = '100%';

        const paperUrl = `https://drive.google.com/file/d/${fileId}/view?usp=sharing`;
        
        statusDiv.textContent = 'Upload successful!';
        statusDiv.style.color = 'green';
        
        console.log('✅ Paper URL to save:', paperUrl);
        
        // Save to exam object in DB
        try {
            const dbRes = await fetch(`${EXAMS_API}/${paperExamId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'x-api-key': X_API_KEY },
                body: JSON.stringify({ paper_url: paperUrl })
            });
            
            if (!dbRes.ok) {
                const errText = await dbRes.text();
                console.error('DB save failed:', errText);
                statusDiv.textContent = 'Upload succeeded, but failed to save URL to database.';
                return;
            }

            console.log('✅ URL saved to DB successfully');
            setTimeout(() => {
                closeUploadPaperModal();
                fetchExams();
            }, 1500);
        } catch (err) {
            console.error('Error updating exam paper URL:', err);
            statusDiv.textContent = 'Upload succeeded, but failed to save to database.';
        }
    } catch (err) {
        console.error('Drive upload error:', err);
        statusDiv.textContent = 'Upload failed: ' + err.message;
        statusDiv.style.color = 'red';
        progressWrap.style.display = 'none';
    }
}

// ---- Mark Results Modal ----
let resultsExamId = null;
let currentExamStudents = [];

async function openMarkResultsModal(examId, classId) {
    resultsExamId = examId;
    document.getElementById('markResultsModal').classList.add('open');
    document.getElementById('markResultsLoading').style.display = 'block';
    document.getElementById('markResultsTable').style.display = 'none';
    document.getElementById('markResultsTableBody').innerHTML = '';
    
    try {
        // Fetch students for this class
        const currentTeacherId = getActivatedId();
        const enrollRes = await fetch(`${CLASS_STUDENTS_API}?class_id=${classId}`, { headers: { 'x-api-key': X_API_KEY } });
        const studentsRes = await fetch(`${STUDENTS_API}?teacher_id=${currentTeacherId}`, { headers: { 'x-api-key': X_API_KEY } });
        
        if (!enrollRes.ok || !studentsRes.ok) throw new Error('Failed to fetch students');
        
        const enrollData = await enrollRes.json();
        const studentsData = await studentsRes.json();
        
        const enrollItems = Array.isArray(enrollData) ? enrollData : (enrollData.items || []);
        const studentsItems = Array.isArray(studentsData) ? studentsData : (studentsData.items || []);
        
        const enrolledIds = new Set(enrollItems.map(r => r.student_id));
        currentExamStudents = studentsItems.filter(s => enrolledIds.has(s.id));
        
        const exam = allExams.find(e => e.id === examId);
        const savedResults = exam.results || {};
        
        const tbody = document.getElementById('markResultsTableBody');
        if (currentExamStudents.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:20px;">No students enrolled in this class.</td></tr>';
        } else {
            tbody.innerHTML = currentExamStudents.map(student => {
                const result = savedResults[student.id] || { marks: '', remarks: '' };
                return `
                    <tr style="border-bottom: 1px solid #edf2f7;">
                        <td style="padding: 10px;">${student.student_name || 'N/A'}</td>
                        <td style="padding: 10px;">${student.student_id || 'N/A'}</td>
                        <td style="padding: 10px;">
                            <input type="number" id="marks_${student.id}" value="${result.marks}" style="width: 80px; padding: 5px; border: 1px solid #cbd5e0; border-radius: 4px;" placeholder="Marks">
                        </td>
                        <td style="padding: 10px;">
                            <input type="text" id="remarks_${student.id}" value="${result.remarks}" style="width: 100%; padding: 5px; border: 1px solid #cbd5e0; border-radius: 4px;" placeholder="Remarks">
                        </td>
                    </tr>
                `;
            }).join('');
        }
        
        document.getElementById('markResultsLoading').style.display = 'none';
        document.getElementById('markResultsTable').style.display = 'table';
        
    } catch (err) {
        console.error(err);
        document.getElementById('markResultsLoading').textContent = 'Failed to load students.';
    }
}

function closeMarkResultsModal() {
    document.getElementById('markResultsModal').classList.remove('open');
    resultsExamId = null;
    currentExamStudents = [];
}

function closeMarkResultsModalOverlay(e) {
    if (e.target === document.getElementById('markResultsModal')) {
        closeMarkResultsModal();
    }
}

function saveExamResults() {
    if (!resultsExamId) return;
    
    const results = {};
    currentExamStudents.forEach(student => {
        const marksInput = document.getElementById(`marks_${student.id}`);
        const remarksInput = document.getElementById(`remarks_${student.id}`);
        if (marksInput && remarksInput) {
            results[student.id] = {
                marks: marksInput.value,
                remarks: remarksInput.value
            };
        }
    });
    
    // Attempt to update the DB with results. 
    // IMPORTANT: the user must create a `results` (JSON) field in PocketBase!
    fetch(`${EXAMS_API}/${resultsExamId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-api-key': X_API_KEY },
        body: JSON.stringify({ results: results })
    }).then(res => {
        if(!res.ok) throw new Error('DB Error');
        closeMarkResultsModal();
        fetchExams();
        if(window.customConfirm) {
            window.customAlert?.('Success', 'Exam results saved to Database!', 'success');
        } else {
            alert('Exam results saved to Database!');
        }
    }).catch(err => {
        console.error('Failed to save results:', err);
        alert('Error: Please make sure you have added a "results" field (type JSON) to your exams table in Pocketbase.');
    });
}

// ---- Expose functions to global scope (required for type="module") ----
window.openExamModal                  = openExamModal;
window.closeExamModal                 = closeExamModal;
window.closeModalOnOverlay            = closeModalOnOverlay;
window.saveExam                       = saveExam;
window.openEditExam                   = openEditExam;
window.deleteExam                     = deleteExam;
window.markCompleted                  = markCompleted;
window.openUploadPaperModal           = openUploadPaperModal;
window.closeUploadPaperModal          = closeUploadPaperModal;
window.closeUploadPaperModalOverlay   = closeUploadPaperModalOverlay;
window.uploadPaperToDrive             = uploadPaperToDrive;
window.openMarkResultsModal           = openMarkResultsModal;
window.closeMarkResultsModal          = closeMarkResultsModal;
window.closeMarkResultsModalOverlay   = closeMarkResultsModalOverlay;
window.saveExamResults                = saveExamResults;

// ---- Init ----

fetchClasses();
