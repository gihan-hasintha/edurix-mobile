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
    const dateObj = new Date(y, m - 1, d);
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${days[dateObj.getDay()]}, ${d} ${months[m - 1]} ${y}`;
}

function formatTime(timeStr) {
    if (!timeStr) return '';
    const [h, min] = timeStr.split(':').map(Number);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const hr = h % 12 || 12;
    return `${hr}:${String(min).padStart(2,'0')} ${ampm}`;
}

function getDuration(start, end) {
    if (!start || !end) return '';
    const [h1, m1] = start.split(':').map(Number);
    const [h2, m2] = end.split(':').map(Number);
    let diffMinutes = (h2 * 60 + m2) - (h1 * 60 + m1);
    if (diffMinutes < 0) diffMinutes += 24 * 60; // handle overnight
    const hours = Math.floor(diffMinutes / 60);
    const mins = diffMinutes % 60;
    
    let parts = [];
    if (hours > 0) parts.push(hours + (hours === 1 ? ' Hr' : ' Hrs'));
    if (mins > 0) parts.push(mins + ' Mins');
    return parts.join(' ');
}

function getDaysLeft(dateStr) {
    if (!dateStr) return '';
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const datePart = dateStr.split(' ')[0];
    const [y, m, d] = datePart.split('-').map(Number);
    const examDate = new Date(y, m - 1, d);
    const diffTime = examDate - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) return '';
    if (diffDays === 0) return '(Today)';
    if (diffDays === 1) return '(Tomorrow)';
    return `(${diffDays} days left)`;
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
        
        // Populate results from correct_answers._results
        allExams.forEach(exam => {
            let correctAnswers = exam.correct_answers || {};
            if (typeof correctAnswers === 'string') {
                try { correctAnswers = JSON.parse(correctAnswers); } catch(e) { correctAnswers = {}; }
            }
            exam.results = correctAnswers._results || {};
        });
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
    const timeRange = exam.start_time ? `${formatTime(exam.start_time)} – ${formatTime(exam.end_time)} (${getDuration(exam.start_time, exam.end_time)})` : '—';

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
    const questionsHtml = exam.question_count
        ? `<div class="exam-card-marks" style="margin-left: 8px;"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><line x1="12" y1="17" x2="12.01" y2="17"></line></svg> ${exam.question_count} Questions</div>` : '';
    const answersHtml = exam.question_answer_count
        ? `<div class="exam-card-marks" style="margin-left: 8px;"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg> ${exam.question_answer_count} Answers</div>` : '';

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

    const startLiveBtn = (exam.excelusive_exam === true || exam.excelusive_exam === "true" || exam.excelusive_exam === "True") 
        ? `<button class="exam-action-btn" style="color: #fff; background: #e53e3e;" onclick="startLiveExam('${exam.id}', '${exam.class_id}')" title="Start Live Exam">
               <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;margin-right:4px;"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
               Live Start
           </button>`
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
                        ${formatDate(exam.exam_date)} <span style="margin-left: 4px; font-weight: 500; color: #ed8936; font-size: 12px;">${getDaysLeft(exam.exam_date)}</span>
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
                <div style="display: flex; flex-wrap: wrap;">
                    ${marksHtml}
                    ${questionsHtml}
                    ${answersHtml}
                </div>
                ${notesHtml}
            </div>
            <div class="exam-card-actions">
                ${startLiveBtn}
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

window.startLiveExam = async function(examId, classId, autoStart = false) {
    if (!autoStart && !confirm('Are you sure you want to start this live exam now? Students will be notified immediately.')) return;
    try {
        const { initializeApp } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js');
        const { getDatabase, ref, set } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js');
        
        if (!window.examRtdbApp) {
            window.examRtdbApp = initializeApp({
                apiKey: "AIzaSyDwgvxdTl6XFie74RPB4ho1hYMHXRnw9rg",
                authDomain: "edurix-exam.firebaseapp.com",
                databaseURL: "https://edurix-exam-default-rtdb.asia-southeast1.firebasedatabase.app",
                projectId: "edurix-exam",
                storageBucket: "edurix-exam.firebasestorage.app",
                messagingSenderId: "91106548249",
                appId: "1:91106548249:web:7745fb607bc0cc653ae888"
            }, "ExamTeacherApp");
        }
        
        const db = getDatabase(window.examRtdbApp);
        const liveExamRef = ref(db, 'live_exams/' + classId);
        
        const exam = allExams.find(e => e.id === examId);
        
        let totalSeconds = 3600; // default 1 hr
        if (exam.start_time && exam.end_time) {
            const [h1, m1] = exam.start_time.split(':').map(Number);
            const [h2, m2] = exam.end_time.split(':').map(Number);
            let diffMins = (h2 * 60 + m2) - (h1 * 60 + m1);
            if (diffMins < 0) diffMins += 24 * 60;
            totalSeconds = diffMins * 60;
        }
        const startedAt = Date.now();
        const endAt = startedAt + (totalSeconds * 1000);

        await set(liveExamRef, {
            examId: examId,
            examData: JSON.stringify(exam),
            status: 'started',
            startedAt: startedAt,
            endAt: endAt
        });
        
        try {
            await fetch(`${EXAMS_API}/${exam.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'x-api-key': X_API_KEY },
                body: JSON.stringify({ exam_status: 'started' })
            });
            exam.exam_status = 'started';
            renderExams();
        } catch(e) { console.error('Failed to update status to started in db', e); }
        
        if (!autoStart) {
            if(window.customConfirm) {
                window.customAlert?.('Success', 'Live exam started successfully!', 'success');
            } else {
                alert('Live exam started successfully! Students in this class can now see the exam popup.');
            }
        }
        
        // Show timer in Teacher portal
        showLiveExamTimer(exam, liveExamRef, totalSeconds, endAt);
    } catch (e) {
        console.error('Error starting live exam:', e);
        if (!autoStart) alert('Failed to start live exam.');
    }
};

// ---- Live Exam Timer ----
window.showLiveExamTimer = function(exam, liveExamRef, totalSeconds, endAt) {
    // Create UI
    const existing = document.getElementById('teacherLiveTimer');
    if (existing) existing.remove();
    
    const ui = document.createElement('div');
    ui.id = 'teacherLiveTimer';
    ui.style.cssText = 'position:fixed;bottom:24px;right:24px;background:#fff;border-radius:12px;padding:20px;box-shadow:0 10px 25px rgba(0,0,0,0.1);z-index:9999;width:320px;max-width:calc(100% - 48px);box-sizing:border-box;border:1px solid #e2e8f0;';
    
    ui.innerHTML = `
        <style>@keyframes pulseDot { 0% { opacity: 1; transform: scale(1); } 50% { opacity: 0.5; transform: scale(1.2); } 100% { opacity: 1; transform: scale(1); } }</style>
        <div style="font-size: 14px; font-weight: 600; color: #0f172a; margin-bottom: 4px; display: flex; justify-content: space-between;">
            <span style="display: flex; align-items: center;"><div style="width:8px;height:8px;background:#ef4444;border-radius:50%;margin-right:6px;animation:pulseDot 1.5s infinite;"></div>Live: ${exam.title}</span>
            <button onclick="this.parentElement.parentElement.remove()" style="background:none;border:none;cursor:pointer;color:#94a3b8;"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>
        </div>
        
        <div id="t-cd-title" style="text-align: center; font-size: 14px; font-weight: 600; color: #475569; margin: 12px 0 8px;">Time Remaining</div>
        <div style="display: flex; gap: 12px; justify-content: center; margin-bottom: 16px;">
            <div style="text-align: center;">
                <div id="t-cd-hours" style="font-size: 32px; font-weight: 700; color: #16a34a; line-height: 1;">00</div>
                <div style="font-size: 11px; color: #64748b; margin-top: 2px;">Hours</div>
            </div>
            <div class="t-cd-colon" style="font-size: 32px; font-weight: 700; color: #16a34a; line-height: 0.9;">:</div>
            <div style="text-align: center;">
                <div id="t-cd-minutes" style="font-size: 32px; font-weight: 700; color: #16a34a; line-height: 1;">00</div>
                <div style="font-size: 11px; color: #64748b; margin-top: 2px;">Minutes</div>
            </div>
            <div class="t-cd-colon" style="font-size: 32px; font-weight: 700; color: #16a34a; line-height: 0.9;">:</div>
            <div style="text-align: center;">
                <div id="t-cd-seconds" style="font-size: 32px; font-weight: 700; color: #16a34a; line-height: 1;">00</div>
                <div style="font-size: 11px; color: #64748b; margin-top: 2px;">Seconds</div>
            </div>
        </div>
        <div style="width: 100%; height: 6px; background: #e2e8f0; border-radius: 3px; overflow: hidden; margin-bottom: 12px;">
            <div id="t-cd-progress" style="height: 100%; width: 100%; background: #16a34a; transition: width 1s linear;"></div>
        </div>
        <button id="endLiveBtn" style="width: 100%; padding: 8px; background: #fee2e2; color: #ef4444; border: 1px solid #fca5a5; border-radius: 6px; font-weight: 600; cursor: pointer; transition: 0.2s;">Force End Exam</button>
    `;
    
    document.body.appendChild(ui);
    
    let timerInterval = setInterval(async () => {
        let remainingSeconds = Math.floor((endAt - Date.now()) / 1000);
        if (remainingSeconds <= 0) {
            remainingSeconds = 0;
            clearInterval(timerInterval);
            
            document.getElementById('t-cd-title').innerHTML = 'Time is Over';
            document.getElementById('t-cd-title').style.color = '#ef4444';
            ['t-cd-hours', 't-cd-minutes', 't-cd-seconds'].forEach(id => {
                const el = document.getElementById(id);
                if(el) el.style.color = '#ef4444';
            });
            document.querySelectorAll('.t-cd-colon').forEach(el => el.style.color = '#ef4444');
            const progEl = document.getElementById('t-cd-progress');
            if(progEl) progEl.style.background = '#ef4444';
            
            setTimeout(() => {
                ui.remove();
            }, 3000);
            
            try {
                const { update } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js');
                await update(liveExamRef, { status: 'ended' });
                
                await fetch(`${EXAMS_API}/${exam.id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json', 'x-api-key': X_API_KEY },
                    body: JSON.stringify({ exam_status: 'ended' })
                });
                exam.exam_status = 'ended';
                renderExams();
                
                alert('Time is up! Live Exam has automatically ended.');
            } catch(e) {}
        }
        
        const h = Math.floor(remainingSeconds / 3600).toString().padStart(2, '0');
        const m = Math.floor((remainingSeconds % 3600) / 60).toString().padStart(2, '0');
        const s = (remainingSeconds % 60).toString().padStart(2, '0');
        
        const cdHours = document.getElementById('t-cd-hours');
        if (cdHours) {
            cdHours.textContent = h;
            document.getElementById('t-cd-minutes').textContent = m;
            document.getElementById('t-cd-seconds').textContent = s;
            const pct = (remainingSeconds / totalSeconds) * 100;
            document.getElementById('t-cd-progress').style.width = pct + '%';
        }
    }, 1000);
    
    document.getElementById('endLiveBtn').onclick = async () => {
        clearInterval(timerInterval);
        try {
            const { update } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js');
            await update(liveExamRef, { status: 'ended' });
            
            await fetch(`${EXAMS_API}/${exam.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'x-api-key': X_API_KEY },
                body: JSON.stringify({ exam_status: 'ended' })
            });
            exam.exam_status = 'ended';
            renderExams();
            
            alert('Live Exam forced to end.');
            ui.remove();
        } catch(e) {
            console.error('Failed to end exam manually', e);
        }
    };
};

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

// ---- Marks Config Range Builder UI Helpers ----
function toggleMarksMode() {
    const mode = document.getElementById('examMarksMode').value;
    if (mode === 'flat') {
        document.getElementById('flatMarksContainer').style.display = 'block';
        document.getElementById('rangeMarksContainer').style.display = 'none';
    } else {
        document.getElementById('flatMarksContainer').style.display = 'none';
        document.getElementById('rangeMarksContainer').style.display = 'block';
        if (document.getElementById('marksRangesList').children.length === 0) {
            addNewMarksRangeRow();
        }
    }
    compileMarksConfig();
}

function addNewMarksRangeRow(startQ = '', endQ = '', marks = '') {
    const container = document.getElementById('marksRangesList');
    
    // Auto-calculate smart defaults based on the last row's end if not explicitly provided
    let nextMinStart = 1;
    const rows = container.querySelectorAll('.marks-range-row');
    if (rows.length > 0) {
        const lastRow = rows[rows.length - 1];
        const lastEnd = parseInt(lastRow.querySelector('.range-end-q').value, 10);
        if (!isNaN(lastEnd)) {
            nextMinStart = lastEnd + 1;
        }
    }
    
    const maxQ = parseInt(document.getElementById('examQuestionCount').value, 10) || 9999;
    if (nextMinStart > maxQ && startQ === '') {
        return; // Already allocated all questions! Do not add a new row
    }
    
    if (startQ === '') {
        startQ = nextMinStart;
        endQ = nextMinStart;
    }
    
    if (startQ !== '' && startQ > maxQ) {
        startQ = '';
        endQ = '';
    }
    
    const row = document.createElement('div');
    row.className = 'marks-range-row';
    row.style.display = 'flex';
    row.style.gap = '8px';
    row.style.alignItems = 'center';
    row.style.marginBottom = '6px';
    
    row.innerHTML = `
        <div style="flex: 1; display: flex; align-items: center; gap: 4px;">
            <span style="font-size: 12px; color: #718096;">Q</span>
            <input type="number" class="range-start-q" placeholder="From" value="${startQ}" min="1" max="${maxQ}" oninput="compileMarksConfig()" style="width: 100%; padding: 6px; border: 1px solid #cbd5e0; border-radius: 6px; font-size: 13px; box-sizing: border-box;">
        </div>
        <div style="flex: 1; display: flex; align-items: center; gap: 4px;">
            <span style="font-size: 12px; color: #718096;">to</span>
            <input type="number" class="range-end-q" placeholder="To" value="${endQ}" min="1" max="${maxQ}" oninput="compileMarksConfig()" style="width: 100%; padding: 6px; border: 1px solid #cbd5e0; border-radius: 6px; font-size: 13px; box-sizing: border-box;">
        </div>
        <div style="flex: 1; display: flex; align-items: center; gap: 4px;">
            <span style="font-size: 12px; color: #718096;">=</span>
            <input type="number" class="range-marks" placeholder="Marks" value="${marks}" min="0.1" step="any" oninput="compileMarksConfig()" style="width: 100%; padding: 6px; border: 1px solid #cbd5e0; border-radius: 6px; font-size: 13px; box-sizing: border-box;">
        </div>
        <button type="button" class="remove-range-btn" style="background: #fed7d7; color: #c53030; border: none; padding: 6px 10px; border-radius: 6px; font-size: 13px; cursor: pointer; font-weight: 600; transition: 0.2s;">
            ✕
        </button>
    `;
    
    row.querySelector('.remove-range-btn').addEventListener('click', () => {
        row.remove();
        compileMarksConfig();
    });
    
    container.appendChild(row);
    compileMarksConfig();
}

function validateRangeInputs() {
    const rows = document.querySelectorAll('#marksRangesList .marks-range-row');
    const maxQ = parseInt(document.getElementById('examQuestionCount').value, 10) || 9999;
    
    let nextMinStart = 1;
    
    rows.forEach((row, index) => {
        const startInput = row.querySelector('.range-start-q');
        const endInput = row.querySelector('.range-end-q');
        
        if (nextMinStart > maxQ) {
            startInput.value = '';
            endInput.value = '';
            return;
        }
        
        // Ensure start is at least nextMinStart
        startInput.min = nextMinStart;
        let startVal = parseInt(startInput.value, 10);
        if (isNaN(startVal) || startVal < nextMinStart) {
            if (startInput.value !== '' || index === 0) {
                startInput.value = nextMinStart;
                startVal = nextMinStart;
            }
        }
        
        // Ensure start does not exceed maxQ
        if (startVal > maxQ) {
            startInput.value = maxQ;
            startVal = maxQ;
        }
        
        // Ensure end is at least startVal and does not exceed maxQ
        endInput.min = startVal;
        endInput.max = maxQ;
        let endVal = parseInt(endInput.value, 10);
        if (isNaN(endVal) || endVal < startVal) {
            if (endInput.value !== '') {
                endInput.value = startVal;
                endVal = startVal;
            }
        }
        
        if (endVal > maxQ) {
            endInput.value = maxQ;
            endVal = maxQ;
        }
        
        if (!isNaN(endVal)) {
            nextMinStart = endVal + 1;
        }
    });
    
    // Enable/disable the "Add New Range" button dynamically
    const addBtn = document.getElementById('addRangeBtn');
    if (addBtn) {
        if (nextMinStart > maxQ) {
            addBtn.disabled = true;
            addBtn.style.opacity = '0.5';
            addBtn.style.cursor = 'not-allowed';
        } else {
            addBtn.disabled = false;
            addBtn.style.opacity = '1';
            addBtn.style.cursor = 'pointer';
        }
    }
}

function compileMarksConfig() {
    validateRangeInputs();
    
    const mode = document.getElementById('examMarksMode').value;
    const targetInput = document.getElementById('examMarksPerQuestion');
    
    if (mode === 'flat') {
        targetInput.value = document.getElementById('examMarksPerQuestionFlat').value.trim();
    } else {
        const rows = document.querySelectorAll('#marksRangesList .marks-range-row');
        const parts = [];
        rows.forEach(row => {
            const start = row.querySelector('.range-start-q').value.trim();
            const end = row.querySelector('.range-end-q').value.trim();
            const val = row.querySelector('.range-marks').value.trim();
            
            if (start && end && val) {
                if (start === end) {
                    parts.push(`${start}:${val}`);
                } else {
                    parts.push(`${start}-${end}:${val}`);
                }
            }
        });
        targetInput.value = parts.join(', ');
    }
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
    if(document.getElementById('examShowPaper')) document.getElementById('examShowPaper').checked = false;
    if(document.getElementById('examExclusive')) document.getElementById('examExclusive').checked = false;
    if(document.getElementById('examMcqExam')) document.getElementById('examMcqExam').checked = false;
    
    // Reset marks configuration inputs
    if(document.getElementById('examMarksMode')) document.getElementById('examMarksMode').value = 'flat';
    if(document.getElementById('flatMarksContainer')) document.getElementById('flatMarksContainer').style.display = 'block';
    if(document.getElementById('rangeMarksContainer')) document.getElementById('rangeMarksContainer').style.display = 'none';
    if(document.getElementById('examMarksPerQuestionFlat')) document.getElementById('examMarksPerQuestionFlat').value = '';
    if(document.getElementById('marksRangesList')) document.getElementById('marksRangesList').innerHTML = '';
    if(document.getElementById('examMarksPerQuestion')) document.getElementById('examMarksPerQuestion').value = '';
    
    if(document.getElementById('mcqCorrectAnswersSection')) document.getElementById('mcqCorrectAnswersSection').style.display = 'none';
    if(document.getElementById('mcqCorrectAnswersGrid')) document.getElementById('mcqCorrectAnswersGrid').innerHTML = '';
    window._mcqCorrectAnswers = {};

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
    document.getElementById('examQuestionCount').value = exam.question_count || '';
    document.getElementById('examQuestionAnswerCount').value = exam.question_answer_count || '';
    window._mcqCorrectAnswers = exam.correct_answers || {};
    if (typeof window._mcqCorrectAnswers === 'string') {
        try { window._mcqCorrectAnswers = JSON.parse(window._mcqCorrectAnswers); } catch(e) { window._mcqCorrectAnswers = {}; }
    }
    let marksConfig = '';
    if (window._mcqCorrectAnswers && window._mcqCorrectAnswers._marks_config) {
        marksConfig = window._mcqCorrectAnswers._marks_config;
    }
    let marksVal = exam.marks_per_question;
    if (marksVal === null || marksVal === undefined || String(marksVal) === 'NaN') {
        marksVal = '';
    }
    
    const finalMarksConfig = marksConfig || marksVal || '';
    if (document.getElementById('examMarksPerQuestion')) {
        document.getElementById('examMarksPerQuestion').value = finalMarksConfig;
    }
    if (document.getElementById('marksRangesList')) {
        document.getElementById('marksRangesList').innerHTML = '';
    }
    
    if (finalMarksConfig.includes('-') || finalMarksConfig.includes(':')) {
        if (document.getElementById('examMarksMode')) document.getElementById('examMarksMode').value = 'range';
        if (document.getElementById('flatMarksContainer')) document.getElementById('flatMarksContainer').style.display = 'none';
        if (document.getElementById('rangeMarksContainer')) document.getElementById('rangeMarksContainer').style.display = 'block';
        if (document.getElementById('examMarksPerQuestionFlat')) document.getElementById('examMarksPerQuestionFlat').value = '';
        
        // Parse range string and build rows
        const parts = finalMarksConfig.split(/[,;]/);
        parts.forEach(part => {
            const rangeMatch = part.trim().match(/(\d+)\s*-\s*(\d+)\s*:\s*(\d+(\.\d+)?)/);
            if (rangeMatch) {
                addNewMarksRangeRow(rangeMatch[1], rangeMatch[2], rangeMatch[3]);
            } else {
                const singleMatch = part.trim().match(/(\d+)\s*:\s*(\d+(\.\d+)?)/);
                if (singleMatch) {
                    addNewMarksRangeRow(singleMatch[1], singleMatch[1], singleMatch[2]);
                }
            }
        });
    } else {
        if (document.getElementById('examMarksMode')) document.getElementById('examMarksMode').value = 'flat';
        if (document.getElementById('flatMarksContainer')) document.getElementById('flatMarksContainer').style.display = 'block';
        if (document.getElementById('rangeMarksContainer')) document.getElementById('rangeMarksContainer').style.display = 'none';
        if (document.getElementById('examMarksPerQuestionFlat')) document.getElementById('examMarksPerQuestionFlat').value = finalMarksConfig;
    }
    document.getElementById('examNotes').value      = exam.notes       || '';
    if(document.getElementById('examShowPaper')) document.getElementById('examShowPaper').checked = !!exam.show_paper_to_student;
    if(document.getElementById('examExclusive')) document.getElementById('examExclusive').checked = (exam.excelusive_exam === true || exam.excelusive_exam === "true" || exam.excelusive_exam === "True");
    
    const isMcq = (exam.mcq_exam === true || exam.mcq_exam === "true" || exam.mcq_exam === "True");
    if(document.getElementById('examMcqExam')) document.getElementById('examMcqExam').checked = isMcq;
    if (isMcq) {
        renderMcqCorrectAnswersGrid();
        if(document.getElementById('mcqCorrectAnswersSection')) document.getElementById('mcqCorrectAnswersSection').style.display = 'block';
    } else {
        if(document.getElementById('mcqCorrectAnswersSection')) document.getElementById('mcqCorrectAnswersSection').style.display = 'none';
        if(document.getElementById('mcqCorrectAnswersGrid')) document.getElementById('mcqCorrectAnswersGrid').innerHTML = '';
    }
    
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
    const questionCount = document.getElementById('examQuestionCount').value;
    const questionAnswerCount = document.getElementById('examQuestionAnswerCount').value;
    const marksPerQuestion = document.getElementById('examMarksPerQuestion') ? document.getElementById('examMarksPerQuestion').value : '';
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
    if (questionCount) examPayload.question_count = Number(questionCount);
    if (questionAnswerCount) examPayload.question_answer_count = Number(questionAnswerCount);
    if (marksPerQuestion) {
        const numVal = Number(marksPerQuestion);
        if (!isNaN(numVal)) {
            examPayload.marks_per_question = numVal;
        } else {
            examPayload.marks_per_question = 1; // Default fallback for DB Number field
        }
    } else {
        examPayload.marks_per_question = 1; // Explicit clean up fallback
    }
    if (notes) examPayload.notes = notes;
    if (paperUrl) examPayload.paper_url = paperUrl;
    if(document.getElementById('examShowPaper')) examPayload.show_paper_to_student = document.getElementById('examShowPaper').checked;
    if(document.getElementById('examExclusive')) examPayload.excelusive_exam = document.getElementById('examExclusive').checked;
    if(document.getElementById('examMcqExam')) examPayload.mcq_exam = document.getElementById('examMcqExam').checked;
    if (window._mcqCorrectAnswers || marksPerQuestion) {
        const correctAnswersObj = { ...window._mcqCorrectAnswers };
        if (marksPerQuestion) {
            correctAnswersObj._marks_config = marksPerQuestion;
        } else {
            delete correctAnswersObj._marks_config;
        }
        examPayload.correct_answers = JSON.stringify(correctAnswersObj);
    } else {
        examPayload.correct_answers = '{}';
    }

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

// ---- MCQ Correct Answers Grid ----

window._mcqCorrectAnswers = {};

function renderMcqCorrectAnswersGrid() {
    const grid = document.getElementById('mcqCorrectAnswersGrid');
    const section = document.getElementById('mcqCorrectAnswersSection');
    if (!grid || !section) return;
    
    const isMcq = document.getElementById('examMcqExam') ? document.getElementById('examMcqExam').checked : false;
    if (!isMcq) {
        section.style.display = 'none';
        grid.innerHTML = '';
        return;
    }
    
    const qCount = parseInt(document.getElementById('examQuestionCount').value || '0', 10);
    const aCount = parseInt(document.getElementById('examQuestionAnswerCount').value || '0', 10);
    
    if (!qCount || !aCount) {
        section.style.display = 'block';
        grid.innerHTML = '<p style="color: #92400e; font-size: 13px; margin: 0;">Please set Question Count and Answers per Question first.</p>';
        return;
    }
    
    section.style.display = 'block';
    const letters = ['A', 'B', 'C', 'D'].slice(0, aCount);
    let html = '';
    
    for (let i = 1; i <= qCount; i++) {
        let optHtml = '';
        letters.forEach(letter => {
            const isSelected = (window._mcqCorrectAnswers[String(i)] === letter);
            optHtml += `<div class="mcq-correct-opt" data-q="${i}" data-opt="${letter}" style="width: 30px; height: 30px; border-radius: 50%; border: 2px solid ${isSelected ? '#16a34a' : '#cbd5e1'}; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 600; color: ${isSelected ? '#fff' : '#475569'}; cursor: pointer; background: ${isSelected ? '#16a34a' : '#fff'}; user-select: none; transition: all 0.2s;">${letter}</div>`;
        });
        
        html += `<div style="display: flex; align-items: center; gap: 10px;">
            <div style="width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; font-weight: 700; color: #92400e; background: #fef3c7; border-radius: 6px; font-size: 12px; flex-shrink: 0;">${i}</div>
            <div style="display: flex; gap: 8px;">${optHtml}</div>
        </div>`;
    }
    
    grid.innerHTML = html;
    
    grid.querySelectorAll('.mcq-correct-opt').forEach(opt => {
        opt.onclick = function() {
            const q = this.getAttribute('data-q');
            const letter = this.getAttribute('data-opt');
            grid.querySelectorAll(`.mcq-correct-opt[data-q="${q}"]`).forEach(o => {
                o.style.background = '#fff';
                o.style.color = '#475569';
                o.style.borderColor = '#cbd5e1';
            });
            this.style.background = '#16a34a';
            this.style.color = '#fff';
            this.style.borderColor = '#16a34a';
            window._mcqCorrectAnswers[q] = letter;
        };
    });
}

if(document.getElementById('examMcqExam')) {
    document.getElementById('examMcqExam').addEventListener('change', renderMcqCorrectAnswersGrid);
}
if(document.getElementById('examQuestionCount')) {
    document.getElementById('examQuestionCount').addEventListener('input', function() {
        if (document.getElementById('examMcqExam') && document.getElementById('examMcqExam').checked) renderMcqCorrectAnswersGrid();
    });
}
if(document.getElementById('examQuestionAnswerCount')) {
    document.getElementById('examQuestionAnswerCount').addEventListener('change', function() {
        if (document.getElementById('examMcqExam') && document.getElementById('examMcqExam').checked) renderMcqCorrectAnswersGrid();
    });
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

// Helper to get Firestore instance dynamically
async function getExamFirestore() {
    if (window._examFirestore) return window._examFirestore;
    const { initializeApp, getApps } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js');
    const { getFirestore } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
    
    let app;
    const apps = getApps();
    const existing = apps.find(a => a.name === "ExamTeacherApp");
    if (existing) {
        app = existing;
    } else {
        app = initializeApp({
            apiKey: "AIzaSyDwgvxdTl6XFie74RPB4ho1hYMHXRnw9rg",
            authDomain: "edurix-exam.firebaseapp.com",
            databaseURL: "https://edurix-exam-default-rtdb.asia-southeast1.firebasedatabase.app",
            projectId: "edurix-exam",
            storageBucket: "edurix-exam.firebasestorage.app",
            messagingSenderId: "91106548249",
            appId: "1:91106548249:web:7745fb607bc0cc653ae888"
        }, "ExamTeacherApp");
    }
    window._examFirestore = getFirestore(app);
    return window._examFirestore;
}

window.viewStudentAnswers = function(studentId, studentName) {
    const exam = allExams.find(e => e.id === resultsExamId);
    if (!exam) return;
    
    const studentSub = window._currentSubmissions ? window._currentSubmissions[studentId] : null;
    if (!studentSub) {
        alert("No submission found for this student.");
        return;
    }
    
    document.getElementById('studentAnswersTitle').textContent = `${studentName}'s Answers Review`;
    document.getElementById('studentAnswersSubtitle').textContent = `Exam: ${exam.title}`;
    
    let paperUrl = exam.paper_url || '';
    if (paperUrl.includes('drive.google.com') && paperUrl.includes('/view')) {
        paperUrl = paperUrl.replace(/\/view.*$/, '/preview');
    }
    const iframe = document.getElementById('studentAnswersIframe');
    if (paperUrl) {
        iframe.src = paperUrl;
        iframe.parentNode.style.display = 'block';
    } else {
        iframe.src = '';
        iframe.parentNode.style.display = 'none';
    }
    
    let correctAnswers = exam.correct_answers || {};
    if (typeof correctAnswers === 'string') {
        try { correctAnswers = JSON.parse(correctAnswers); } catch(e) { correctAnswers = {}; }
    }
    
    const studentAnswers = studentSub.answers || {};
    let correctCount = 0;
    let totalCount = parseInt(exam.question_count || '0', 10) || Object.keys(correctAnswers).filter(k => !k.startsWith('_')).length || 0;
    
    const marksConfig = correctAnswers._marks_config || exam.marks_per_question || '1';
    const marksMap = getQuestionMarksMap(marksConfig, totalCount);

    let weightedCorrect = 0;
    let weightedTotal = 0;

    Object.keys(correctAnswers).forEach(qNum => {
        if (qNum.startsWith('_')) return;
        const weight = marksMap[qNum] || 1;
        weightedTotal += weight;
        if (studentAnswers[qNum] === correctAnswers[qNum]) {
            correctCount++;
            weightedCorrect += weight;
        }
    });
    
    document.getElementById('studentAnswersScoreBadge').textContent = `Score: ${correctCount}/${totalCount} (${weightedCorrect}/${weightedTotal} Marks)`;
    
    const listContainer = document.getElementById('studentAnswersList');
    let listHtml = '';
    
    for (let i = 1; i <= totalCount; i++) {
        const qKey = String(i);
        const stuAns = studentAnswers[qKey] || '—';
        const corAns = correctAnswers[qKey] || '—';
        const isCorrect = stuAns === corAns;
        
        let statusBadge = '';
        if (stuAns === '—') {
            statusBadge = '<span style="background: #edf2f7; color: #718096; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600;">Unanswered</span>';
        } else if (isCorrect) {
            statusBadge = '<span style="background: #d1fae5; color: #065f46; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600;">✓ Correct</span>';
        } else {
            statusBadge = '<span style="background: #fee2e2; color: #991b1b; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600;">✗ Incorrect</span>';
        }
        
        listHtml += `
            <div style="display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; border: 1px solid #e2e8f0; border-radius: 6px; background: ${isCorrect ? '#f0fdf4' : stuAns === '—' ? '#fff' : '#fff5f5'};">
                <div style="display: flex; align-items: center; gap: 12px;">
                    <span style="font-weight: 700; color: #475569; width: 30px;">Q${i}</span>
                    <span style="font-size: 13px;">Student: <strong style="color: ${isCorrect ? '#16a34a' : '#ef4444'}; font-size: 14px;">${stuAns}</strong></span>
                    <span style="font-size: 13px; color: #64748b;">Correct: <strong style="color: #16a34a;">${corAns}</strong></span>
                </div>
                <div>
                    ${statusBadge}
                </div>
            </div>
        `;
    }
    
    listContainer.innerHTML = listHtml;
    document.getElementById('studentAnswersModal').style.display = 'flex';
};

// ---- Helper function to parse custom marks per question ranges ----
function getQuestionMarksMap(marksPerQuestionStr, totalQuestions) {
    const marksMap = {};
    for (let i = 1; i <= totalQuestions; i++) {
        marksMap[i] = 1;
    }
    if (!marksPerQuestionStr) return marksMap;

    const str = String(marksPerQuestionStr).trim();
    if (/^\d+(\.\d+)?$/.test(str)) {
        const val = parseFloat(str);
        for (let i = 1; i <= totalQuestions; i++) {
            marksMap[i] = val;
        }
        return marksMap;
    }

    const parts = str.split(/[,;]/);
    parts.forEach(part => {
        const rangeMatch = part.match(/(\d+)\s*-\s*(\d+)\s*:\s*(\d+(\.\d+)?)/);
        if (rangeMatch) {
            const start = parseInt(rangeMatch[1], 10);
            const end = parseInt(rangeMatch[2], 10);
            const val = parseFloat(rangeMatch[3]);
            for (let i = start; i <= end; i++) {
                if (i <= totalQuestions) {
                    marksMap[i] = val;
                }
            }
        } else {
            const singleMatch = part.match(/(\d+)\s*:\s*(\d+(\.\d+)?)/);
            if (singleMatch) {
                const qNum = parseInt(singleMatch[1], 10);
                const val = parseFloat(singleMatch[2]);
                if (qNum <= totalQuestions) {
                    marksMap[qNum] = val;
                }
            }
        }
    });
    return marksMap;
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
        
        // Fetch submissions from Firestore
        let submissions = {};
        try {
            const db = await getExamFirestore();
            const { collection, getDocs, query, where } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
            const q = query(collection(db, "exam_submissions"), where("examId", "==", examId));
            const snap = await getDocs(q);
            snap.forEach(doc => {
                const data = doc.data();
                submissions[data.studentId] = data;
            });
        } catch(e) {
            console.error("Failed to fetch exam submissions:", e);
        }
        window._currentSubmissions = submissions;

        let correctAnswers = exam.correct_answers || {};
        if (typeof correctAnswers === 'string') {
            try { correctAnswers = JSON.parse(correctAnswers); } catch(e) { correctAnswers = {}; }
        }
        
        const marksConfig = correctAnswers._marks_config || exam.marks_per_question || '1';
        const tbody = document.getElementById('markResultsTableBody');
        if (currentExamStudents.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px;">No students enrolled in this class.</td></tr>';
        } else {
            tbody.innerHTML = currentExamStudents.map(student => {
                const result = savedResults[student.id] || { marks: '', remarks: '' };
                const studentSub = submissions[student.id];
                
                let mcqColHtml = '<span style="color: #a0aec0; font-size: 13px;">—</span>';
                if (studentSub) {
                    const studentAnswers = studentSub.answers || {};
                    let totalCount = parseInt(exam.question_count || '0', 10) || Object.keys(correctAnswers).filter(k => !k.startsWith('_')).length || 0;
                    const marksMap = getQuestionMarksMap(marksConfig, totalCount);

                    let correctCount = 0;
                    let calculatedTotal = 0;
                    
                    Object.keys(correctAnswers).forEach(qNum => {
                        if (qNum.startsWith('_')) return;
                        
                        const weight = marksMap[qNum] || 1;
                        calculatedTotal += weight;
                        if (studentAnswers[qNum] === correctAnswers[qNum]) {
                            correctCount += weight;
                        }
                    });
                    
                    mcqColHtml = `
                        <div style="display: flex; flex-direction: column; gap: 4px;">
                            <span style="font-size: 13px; font-weight: 600; color: #2b6cb0;">Score: ${correctCount}/${calculatedTotal}</span>
                            <div style="display: flex; gap: 6px;">
                                <button type="button" onclick="document.getElementById('marks_${student.id}').value = ${correctCount}; triggerAutoSave();" style="border: 1px solid #38a169; background: #f0fff4; color: #38a169; padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: 600; cursor: pointer; transition: 0.2s;">Apply</button>
                                <button type="button" onclick="viewStudentAnswers('${student.id}', '${student.student_name.replace(/'/g, "\\'")}')" style="border: 1px solid #3182ce; background: #ebf8ff; color: #3182ce; padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: 600; cursor: pointer; transition: 0.2s;">View Answers</button>
                            </div>
                        </div>
                    `;
                } else if (exam.mcq_exam) {
                    mcqColHtml = '<span style="background: #edf2f7; color: #718096; padding: 2px 8px; border-radius: 4px; font-size: 12px;">Not Submitted</span>';
                }
                
                return `
                    <tr style="border-bottom: 1px solid #edf2f7;">
                        <td style="padding: 10px;">${student.student_name || 'N/A'}</td>
                        <td style="padding: 10px;">${student.student_id || 'N/A'}</td>
                        <td style="padding: 10px;">${mcqColHtml}</td>
                        <td style="padding: 10px;">
                            <input type="number" id="marks_${student.id}" value="${result.marks}" oninput="triggerAutoSave()" style="width: 80px; padding: 5px; border: 1px solid #cbd5e0; border-radius: 4px;" placeholder="Marks">
                        </td>
                        <td style="padding: 10px;">
                            <input type="text" id="remarks_${student.id}" value="${result.remarks}" oninput="triggerAutoSave()" style="width: 100%; padding: 5px; border: 1px solid #cbd5e0; border-radius: 4px;" placeholder="Remarks">
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

let autoSaveTimeout = null;
function triggerAutoSave() {
    if (autoSaveTimeout) clearTimeout(autoSaveTimeout);
    autoSaveTimeout = setTimeout(() => {
        autoSaveAllResults();
    }, 500);
}

async function autoSaveAllResults() {
    if (!resultsExamId) return;
    const exam = allExams.find(e => e.id === resultsExamId);
    if (!exam) return;
    
    const subtitle = document.getElementById('markResultsSubtitle');
    if (subtitle) {
        subtitle.innerHTML = 'Saving <span style="color: #3182ce; font-weight: 600;">results...</span>';
    }
    
    const results = exam.results || {};
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
    
    // Parse existing correct answers to preserve correct answers and marks config
    let correctAnswersObj = exam.correct_answers || {};
    if (typeof correctAnswersObj === 'string') {
        try { correctAnswersObj = JSON.parse(correctAnswersObj); } catch(e) { correctAnswersObj = {}; }
    }
    
    // Store results inside the correct_answers JSON
    correctAnswersObj._results = results;
    const correctAnswersStr = JSON.stringify(correctAnswersObj);
    
    try {
        const response = await fetch(`${EXAMS_API}/${resultsExamId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'x-api-key': X_API_KEY },
            body: JSON.stringify({ correct_answers: correctAnswersStr })
        });
        if (!response.ok) throw new Error('DB Error');
        exam.results = results; // Update cache
        exam.correct_answers = correctAnswersObj; // Update cache correct_answers
        if (subtitle) {
            subtitle.innerHTML = 'All changes <span style="color: #38a169; font-weight: 600;">auto-saved</span>.';
        }
    } catch (err) {
        console.error('Failed to auto-save results:', err);
        if (subtitle) {
            subtitle.innerHTML = 'Failed to auto-save results: <span style="color: #e53e3e; font-weight: 600;">Database Error</span>';
        }
    }
}

function saveExamResults() {
    autoSaveAllResults();
}

window.applyAllMarks = function() {
    if (!resultsExamId) return;
    const exam = allExams.find(e => e.id === resultsExamId);
    if (!exam) return;
    
    let correctAnswers = exam.correct_answers || {};
    if (typeof correctAnswers === 'string') {
        try { correctAnswers = JSON.parse(correctAnswers); } catch(e) { correctAnswers = {}; }
    }
    
    const marksConfig = correctAnswers._marks_config || exam.marks_per_question || '1';
    let totalCount = parseInt(exam.question_count || '0', 10) || Object.keys(correctAnswers).filter(k => !k.startsWith('_')).length || 0;
    const marksMap = getQuestionMarksMap(marksConfig, totalCount);
    
    let changed = false;
    currentExamStudents.forEach(student => {
        const studentSub = window._currentSubmissions ? window._currentSubmissions[student.id] : null;
        if (studentSub) {
            const studentAnswers = studentSub.answers || {};
            let correctCount = 0;
            
            Object.keys(correctAnswers).forEach(qNum => {
                if (qNum.startsWith('_')) return;
                const weight = marksMap[qNum] || 1;
                if (studentAnswers[qNum] === correctAnswers[qNum]) {
                    correctCount += weight;
                }
            });
            
            const marksInput = document.getElementById(`marks_${student.id}`);
            if (marksInput) {
                marksInput.value = correctCount;
                changed = true;
            }
        }
    });
    
    if (changed) {
        triggerAutoSave();
        if (window.customAlert) {
            window.customAlert('Applied Marks', 'Successfully applied all auto-calculated MCQ marks.', 'success');
        } else {
            alert('Applied all MCQ marks successfully.');
        }
    } else {
        if (window.customAlert) {
            window.customAlert('No Submissions', 'No MCQ submissions found to apply.', 'info');
        } else {
            alert('No MCQ submissions found to apply.');
        }
    }
};

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

fetchClasses();

if (document.getElementById('examQuestionCount')) {
    document.getElementById('examQuestionCount').addEventListener('input', () => {
        const maxQ = parseInt(document.getElementById('examQuestionCount').value, 10) || 0;
        if (maxQ > 0) {
            const starts = document.querySelectorAll('#marksRangesList .range-start-q');
            const ends = document.querySelectorAll('#marksRangesList .range-end-q');
            
            starts.forEach(input => {
                input.max = maxQ;
                if (input.value && parseInt(input.value, 10) > maxQ) {
                    input.value = maxQ;
                }
            });
            
            ends.forEach(input => {
                input.max = maxQ;
                if (input.value && parseInt(input.value, 10) > maxQ) {
                    input.value = maxQ;
                }
            });
            compileMarksConfig();
        }
    });
}

// ---- Exam Alerts Scheduler ----
const alertedExams2Min = new Set();
const alertedExamsStart = new Set();
window._startedLiveExams = new Set();

setInterval(() => {
    if (!allExams || allExams.length === 0) return;
    
    const now = new Date();
    
    allExams.forEach(exam => {
        // Only alert for exams scheduled today that are not completed
        if(getExamStatus(exam.exam_date) === 'today' && exam.start_time) {
            const [h, m] = exam.start_time.split(':').map(Number);
            const examTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m);
            const diffMs = examTime.getTime() - now.getTime();
            
            // 2 minutes before (anytime between 0 and 2 minutes before start)
            if (diffMs > 0 && diffMs <= 120000 && !alertedExams2Min.has(exam.id)) {
                alertedExams2Min.add(exam.id);
                if (window.customAlert) {
                    window.customAlert('Upcoming Exam', `Exam "${exam.title}" will start in less than 2 minutes.`, 'info');
                } else {
                    alert(`Exam "${exam.title}" will start in less than 2 minutes.`);
                }
            }
            
            // At start time (anytime between exact start time and 1 minute after)
            if (diffMs <= 0 && diffMs > -60000 && !alertedExamsStart.has(exam.id)) {
                alertedExamsStart.add(exam.id);
                
                // Auto-start the live exam!
                if(window.startLiveExam && !window._startedLiveExams.has(exam.id)) {
                    window._startedLiveExams.add(exam.id);
                    window.startLiveExam(exam.id, exam.class_id, true);
                }
                
                if (window.customAlert) {
                    window.customAlert('Exam Auto-Started', `It is time! The exam "${exam.title}" has automatically started.`, 'success');
                } else {
                    alert(`It is time! The exam "${exam.title}" has automatically started.`);
                }
            }
        }
    });
}, 10000); // Check every 10 seconds to be very responsive
