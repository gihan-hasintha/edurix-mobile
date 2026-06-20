// Core Attendance JavaScript - Edurix
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, addDoc, updateDoc, doc, getDocs, query, where, limit, orderBy, serverTimestamp, onSnapshot, setDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDxKcVG-j6nzzw_M4oWeQMmsWX_8f_qm60",
  authDomain: "student-registerform.firebaseapp.com",
  projectId: "student-registerform",
  storageBucket: "student-registerform.firebasestorage.app",
  messagingSenderId: "77346572955",
  appId: "1:77346572955:web:7a135d918d149e5d10943e",
  measurementId: "G-764NRWXGG7"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const API_URL_BASE = window.api?.env?.API_URL ? window.api.env.API_URL.replace('/students', '') : 'https://api.edurix.imatap.com';
const STUDENTS_API = window.api?.env?.API_URL || `${API_URL_BASE}/students`;
const CLASSES_API = `${API_URL_BASE}/classes`;
const CLASS_STUDENTS_API = `${API_URL_BASE}/class_students`;
const PAYMENTS_API = `${API_URL_BASE}/payments`;
const X_API_KEY = '996de2d470a0f1e9794b7778e216c193258aac001b36813f9ad1d3f957cc7ee7';

// Helper to determine the correct Firestore attendance collection based on teacher region
function getAttendanceCollectionName() {
    const activatedData = localStorage.getItem('Activated_Teacher') || localStorage.getItem('Activated_Institution');
    if (activatedData) {
        try {
            const stored = JSON.parse(activatedData);
            const region = stored.region || stored.province_region || stored.province || 'WP';
            return `attendance_${region.toLowerCase()}`;
        } catch (e) {
            console.error('Error parsing teacher data for region, defaulting to WP');
        }
    }
    return 'attendance_wp';
}

let allClasses = [];
let allStudents = [];
let allEnrollments = [];
let activeClass = null;
let enrolledStudents = [];
let todayAttendance = [];
let todayPayments = [];
let activeClassMode = 'manual'; // 'manual' or 'autostarted'
let rosterSearchTerm = ''; // Track current search term
let rosterFilterStatus = 'All'; // Track current status filter
let rosterFilterPaymentStatus = 'All'; // Track current payment filter
let classTimerInterval = null; // Track countdown interval
let paymentSyncInterval = null; // Track payment sync interval
let hasPromptedClassEnd = false; // Flag to ensure we only prompt once per class
let manuallyEndedClassId = sessionStorage.getItem('manuallyEndedClassId') || null; // Track manually ended class across reloads
let teacherSettings = null;

function toggleViewNextClassesBtn(disabled) {
    const btn = document.getElementById('viewNextClassesBtn');
    if (!btn) return;
    btn.disabled = disabled;
    btn.style.opacity = disabled ? '0.5' : '1';
    btn.style.cursor = disabled ? 'not-allowed' : 'pointer';
}

// Send Attendance SMS via text.lk
async function sendAttendanceSMS(student, type, timeStr) {
    if (!teacherSettings || !teacherSettings.sms_service || !teacherSettings.sms_api || !teacherSettings.sms_senderid) return;

    if (type === 'check-in' && !teacherSettings.in_sms) return;
    if (type === 'check-out' && !teacherSettings.out_sms) return;

    const recipient = student.parent_phone_number;
    if (!recipient) return;

    let formattedRecipient = recipient.replace(/[^0-9+]/g, '');
    if (formattedRecipient.startsWith('0')) {
        formattedRecipient = '94' + formattedRecipient.substring(1);
    } else if (formattedRecipient.startsWith('+94')) {
        formattedRecipient = formattedRecipient.substring(1);
    }

    let message = '';
    const senderName = teacherSettings.name || 'Institute';
    if (type === 'check-in') {
        message = `Dear Parent, ${student.student_name} has arrived at the class at ${timeStr}. - ${senderName}`;
    } else {
        message = `Dear Parent, ${student.student_name} has left the class at ${timeStr}. - ${senderName}`;
    }

    try {
        const response = await fetch('https://app.text.lk/api/v3/sms/send', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${teacherSettings.sms_api}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({
                recipient: formattedRecipient,
                sender_id: teacherSettings.sms_senderid,
                type: 'plain',
                message: message
            })
        });

        if (response.ok) {
            console.log(`SMS sent successfully to ${recipient} for ${type}`);
        } else {
            console.error('Failed to send SMS:', await response.text());
        }
    } catch (err) {
        console.error('SMS sending error:', err);
    }
}

// Sound Synthesis using Web Audio API (No files required, premium chimes)
function playSound(type) {
    try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        const ctx = new AudioContext();
        
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);

        if (type === 'success') {
            // High-pitched pleasant double chime (C5 -> E5)
            osc.type = 'sine';
            osc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
            osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.08); // E5
            gain.gain.setValueAtTime(0.12, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.005, ctx.currentTime + 0.3);
            osc.start();
            osc.stop(ctx.currentTime + 0.3);
        } else if (type === 'warning') {
            // Low-pitched double alert (E4 -> C4)
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(329.63, ctx.currentTime); // E4
            osc.frequency.setValueAtTime(261.63, ctx.currentTime + 0.12); // C4
            gain.gain.setValueAtTime(0.18, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.005, ctx.currentTime + 0.35);
            osc.start();
            osc.stop(ctx.currentTime + 0.35);
        } else if (type === 'error') {
            // Harsh buzz decay
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(150, ctx.currentTime);
            osc.frequency.setValueAtTime(90, ctx.currentTime + 0.15);
            gain.gain.setValueAtTime(0.2, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.005, ctx.currentTime + 0.4);
            osc.start();
            osc.stop(ctx.currentTime + 0.4);
        }
    } catch (err) {
        console.error('Audio synthesizer error:', err);
    }
}

// Toast alerts helper
function showToast(type, title, message) {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast-alert toast-${type}`;
    
    let icon = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="16" x2="12" y2="12"></line>
            <line x1="12" y1="8" x2="12.01" y2="8"></line>
        </svg>
    `;
    if (type === 'success') {
        icon = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                <polyline points="22 4 12 14.01 9 11.01"></polyline>
            </svg>
        `;
    } else if (type === 'warning') {
        icon = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                <line x1="12" y1="9" x2="12" y2="13"></line>
                <line x1="12" y1="17" x2="12.01" y2="17"></line>
            </svg>
        `;
    } else if (type === 'danger') {
        icon = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="15" y1="9" x2="9" y2="15"></line>
                <line x1="9" y1="9" x2="15" y2="15"></line>
            </svg>
        `;
    }

    toast.innerHTML = `
        <div class="toast-icon">${icon}</div>
        <div class="toast-content">
            <div class="toast-title">${title}</div>
            <div class="toast-msg">${message}</div>
        </div>
    `;

    container.appendChild(toast);

    // Auto-remove toast after 4s (with slide-out transition)
    setTimeout(() => {
        toast.classList.add('fade-out');
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

// Focus the NFC input field
function focusNfcField() {
    const input = document.getElementById('nfc-number');
    if (input) {
        input.focus();
    }
}

// Format Date YYYY-MM-DD
function getLocalDateString() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

// Format Time HH:MM:SS
function getLocalTimeString() {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
}

// Initialized Function
window.pageloadimasoft = async function() {
    focusNfcField();
    
    // Auto re-focus input on clicks to catch all card taps, ignoring interactive elements
    document.addEventListener('click', (e) => {
        const interactive = e.target.closest('select, input:not(#nfc-number), button, a');
        if (interactive) {
            return;
        }
        focusNfcField();
    });
    
    const nfcInput = document.getElementById('nfc-number');
    if (nfcInput) {
        nfcInput.addEventListener('blur', () => {
            // Check if focus moved to an interactive element before stealing focus back
            setTimeout(() => {
                const active = document.activeElement;
                const isInteractive = active && active.closest('select, input:not(#nfc-number), button, a');
                if (!isInteractive) {
                    focusNfcField();
                }
            }, 150);
        });

        nfcInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const cardNo = nfcInput.value.trim();
                nfcInput.value = '';
                if (cardNo) {
                    handleCardScanned(cardNo);
                }
            }
        });
    }

    await initData();
};

// Fetch Initial Data
async function initData() {
    const activatedData = localStorage.getItem('Activated_Teacher') || localStorage.getItem('Activated_Institution');
    if (!activatedData) {
        document.getElementById('loading-window').style.display = 'none';
        showToast('danger', 'Activation Required', 'Please activate your account first.');
        return;
    }

    const stored = JSON.parse(activatedData);
    const teacherId = stored.teacher_id || stored.institution_id;

    try {
        document.getElementById('loading-window').style.display = 'block';
        toggleViewNextClassesBtn(true);

        // Fetch classes, students, and enrollments in parallel
        // Optimization: added ?teacher_id= parameter to significantly reduce network payload
        const [classesRes, studentsRes, teacherRes] = await Promise.all([
            fetch(`${CLASSES_API}?teacher_id=${teacherId}`, { headers: { 'x-api-key': X_API_KEY } }),
            fetch(`${STUDENTS_API}?teacher_id=${teacherId}`, { headers: { 'x-api-key': X_API_KEY } }),
            fetch(`${API_URL_BASE}/teachers`, { headers: { 'x-api-key': X_API_KEY } })
        ]);

        if (!classesRes.ok || !studentsRes.ok || !teacherRes.ok) {
            throw new Error('Failed to fetch initial database data.');
        }

        const classesData = await classesRes.json();
        const studentsData = await studentsRes.json();
        const teacherData = await teacherRes.json();

        const teachersItems = Array.isArray(teacherData) ? teacherData : (teacherData.items || []);
        teacherSettings = teachersItems.find(t => t.teacher_id === teacherId) || null;

        const classesItems = Array.isArray(classesData) ? classesData : (classesData.items || []);
        allClasses = classesItems.filter(c => c.teacher_id === teacherId);

        const studentsItems = Array.isArray(studentsData) ? studentsData : (studentsData.items || []);
        allStudents = studentsItems.filter(s => s.teacher_id === teacherId);

        const manualClassId = sessionStorage.getItem('manualClassId');
        if (manualClassId && allClasses.find(c => String(c.id) === String(manualClassId))) {
            await handleClassChange(manualClassId, 'manual');
        } else {
            await autoStartClassCheck();
        }
        setInterval(autoStartClassCheck, 2000);

        // Listen for remote manual class starts across devices
        if (teacherId) {
            onSnapshot(doc(db, 'teacher_active_classes', String(teacherId)), (docSnap) => {
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    if (data.class_id && (!activeClass || String(activeClass.id) !== String(data.class_id))) {
                        // A new class was manually started on another device
                        const remoteClass = allClasses.find(c => String(c.id) === String(data.class_id));
                        if (remoteClass) {
                            sessionStorage.setItem('manualClassId', data.class_id);
                            handleClassChange(data.class_id, 'manual');
                        }
                    }
                }
            });
        }

    } catch (err) {
        console.error('Initialization error:', err);
        showToast('danger', 'Database Error', 'Failed to retrieve records.');
    } finally {
        document.getElementById('loading-window').style.display = 'none';
    }
}

// Populate the classes select dropdown
function populateClassesDropdown() {
    const select = document.getElementById('classSelect');
    if (!select) return;

    select.innerHTML = '<option value="" disabled selected>-- Select Class Session --</option>';

    if (allClasses.length === 0) {
        select.innerHTML = '<option value="" disabled>No classes registered</option>';
        return;
    }

    allClasses.forEach(cls => {
        const option = document.createElement('option');
        option.value = cls.id;
        option.textContent = `${cls.name} (${cls.classdate} ${cls.classtime} - ${cls.class_endtime})`;
        select.appendChild(option);
    });
}

// Auto-Start class matching weekday and time range
async function autoStartClassCheck() {
    const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const todayWeekday = weekdays[new Date().getDay()];

    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const currentTime = `${hh}:${mm}`;

    // Try to find matching active class
    const matchingClass = allClasses.find(cls => {
        if (manuallyEndedClassId && String(cls.id) === String(manuallyEndedClassId)) return false;
        
        if (!cls.classdate || !cls.classtime || !cls.class_endtime) return false;
        
        const isToday = cls.classdate.trim().toLowerCase() === todayWeekday.toLowerCase();
        // String time comparison (HH:MM vs HH:MM)
        const inTimeRange = currentTime >= cls.classtime && currentTime <= cls.class_endtime;
        
        return isToday && inTimeRange;
    });

    if (matchingClass) {
        if (activeClass && String(activeClass.id) === String(matchingClass.id)) {
            // Already running the correct auto-started class, do nothing
            return;
        }
        console.log('Auto-started class:', matchingClass.name);
        await handleClassChange(matchingClass.id, 'autostarted');
        showToast('success', 'Class Session Auto-Started', `${matchingClass.name} matches current schedule.`);
    } else {
        // Prevent auto-closing if a class was manually started
        if (activeClassMode === 'manual' && activeClass !== null) {
            return;
        }

        if (activeClass !== null || document.getElementById('activeClassName')?.textContent !== 'No Class Scheduled Now') {
            activeClass = null;
            updateClassWidgetsEmpty();
        }
    }
}

// Handle Class selection change dynamically
window.handleClassChange = async function(classId, mode = 'autostarted') {
    if (!classId) return;

    try {
        document.getElementById('loading-window').style.display = 'block';
        toggleViewNextClassesBtn(true);
        
        const cls = allClasses.find(c => String(c.id) === String(classId));
        if (!cls) return;

        activeClass = cls;
        activeClassMode = mode;
        hasPromptedClassEnd = false;

        // Display Class Details widget
        const detailsContainer = document.getElementById('activeClassDetails');
        const badge = document.getElementById('activeClassStatusBadge');
        const name = document.getElementById('activeClassName');
        const location = document.getElementById('activeClassLocation');
        const schedule = document.getElementById('activeClassSchedule');

        if (detailsContainer) detailsContainer.style.display = 'flex';
        if (name) name.textContent = cls.name || 'Unknown Class';
        if (location) location.textContent = `Location: ${cls.location || 'N/A'}`;
        
        if (schedule) {
            schedule.innerHTML = `
                <span class="badge-day">${cls.classdate || ''}</span>
                <span class="badge-time start-time">${cls.classtime || ''}</span>
                <span class="badge-separator">-</span>
                <span class="badge-time end-time">${cls.class_endtime || ''}</span>
            `;
        }

        if (badge) {
            badge.className = `active-class-status ${mode === 'autostarted' ? 'status-autostarted' : 'status-manual'}`;
            badge.textContent = mode === 'autostarted' ? 'Auto-Started' : 'Active';
        }

        if (classTimerInterval) clearInterval(classTimerInterval);
        if (paymentSyncInterval) clearInterval(paymentSyncInterval);
        updateClassTimers();
        classTimerInterval = setInterval(updateClassTimers, 1000);
        paymentSyncInterval = setInterval(window.syncPayments, 1000);

        // Fetch attendance check-ins for this class today from Firebase
        const collectionName = getAttendanceCollectionName();
        const todayDateStr = getLocalDateString();
        
        const q = query(
            collection(db, collectionName),
            where('class_id', '==', String(classId)),
            where('attendance_date', '==', todayDateStr),
            limit(500)
        );
        
        // Unsubscribe from previous attendance listener
        if (window.attendanceUnsubscribe) {
            window.attendanceUnsubscribe();
        }

        // Fetch attendance check-ins, payments, and class enrollments in parallel for faster load times
        const [_, payRes, enrollmentsRes] = await Promise.all([
            new Promise(resolve => {
                let initial = true;
                window.attendanceUnsubscribe = onSnapshot(q, (snapshot) => {
                    let allAttRecords = [];
                    snapshot.forEach((docSnap) => {
                        allAttRecords.push({ id: docSnap.id, ...docSnap.data() });
                    });
                    todayAttendance = allAttRecords;
                    if (initial) {
                        initial = false;
                        resolve();
                    } else {
                        renderRoster();
                    }
                });
            }),
            fetch(`${PAYMENTS_API}?class_id=${classId}&payment_date=${todayDateStr}`, { headers: { 'x-api-key': X_API_KEY } }).catch(e => {
                console.error('Failed to fetch today payments', e);
                return { ok: false };
            }),
            fetch(`${CLASS_STUDENTS_API}?class_id=${classId}`, { headers: { 'x-api-key': X_API_KEY } }).catch(e => {
                console.error('Failed to fetch enrollments', e);
                return { ok: false };
            })
        ]);

        if (payRes && payRes.ok) {
            try {
                const payData = await payRes.json();
                todayPayments = Array.isArray(payData) ? payData : (payData.items || []);
            } catch (e) {
                todayPayments = [];
            }
        } else {
            todayPayments = [];
        }

        if (enrollmentsRes && enrollmentsRes.ok) {
            try {
                const enrollData = await enrollmentsRes.json();
                const enrollItems = Array.isArray(enrollData) ? enrollData : (enrollData.items || []);
                // Keep the global allEnrollments updated with the latest fetched (useful for reference if needed)
                allEnrollments = enrollItems;
                const enrolledStudentIds = new Set(enrollItems.map(r => r.student_id));
                enrolledStudents = allStudents.filter(s => enrolledStudentIds.has(s.id));
            } catch (e) {
                enrolledStudents = [];
            }
        } else {
            enrolledStudents = [];
        }

        renderRoster();
        focusNfcField();
        toggleViewNextClassesBtn(false);

    } catch (err) {
        console.error('Error switching classes:', err);
        showToast('danger', 'Failed to load class', 'Roster fetch error.');
    } finally {
        document.getElementById('loading-window').style.display = 'none';
    }
};

// Render student roster
function renderRoster() {
    const grid = document.getElementById('studentsGrid');
    if (!grid) return;

    grid.innerHTML = '';

    const filtered = enrolledStudents.filter(s => {
        // 1. Text Search
        let matchesSearch = true;
        if (rosterSearchTerm) {
            const nameMatch = s.student_name && s.student_name.toLowerCase().includes(rosterSearchTerm.toLowerCase());
            const idMatch = s.student_id && s.student_id.toLowerCase().includes(rosterSearchTerm.toLowerCase());
            matchesSearch = nameMatch || idMatch;
        }

        // 2. Status Filter
        let matchesStatus = true;
        if (rosterFilterStatus !== 'All') {
            const checkIn = todayAttendance.find(att => String(att.student_id) === String(s.id));
            const isPresent = !!checkIn;
            if (rosterFilterStatus === 'Present') {
                matchesStatus = isPresent;
            } else if (rosterFilterStatus === 'Absent') {
                matchesStatus = !isPresent;
            }
        }

        // 3. Payment Filter
        let matchesPayment = true;
        if (rosterFilterPaymentStatus !== 'All') {
            const checkIn = todayAttendance.find(att => String(att.student_id) === String(s.id));
            let hasPaid = false;
            if (checkIn && checkIn.id) {
                const payRecord = todayPayments.find(p => String(p.attendance_id) === String(checkIn.id) && p.status === 'Paid');
                if (payRecord) hasPaid = true;
            }
            if (!hasPaid) {
                // Fallback for older records without attendance_id
                const payRecord = todayPayments.find(p => String(p.student_id) === String(s.id) && p.status === 'Paid');
                if (payRecord) hasPaid = true;
            }

            if (rosterFilterPaymentStatus === 'Paid') {
                matchesPayment = hasPaid;
            } else if (rosterFilterPaymentStatus === 'Unpaid') {
                matchesPayment = !hasPaid;
            }
        }

        return matchesSearch && matchesStatus && matchesPayment;
    });

    if (filtered.length === 0) {
        grid.innerHTML = `
            <div class="empty-state">
                <img src="./assets/img/1515125.png" alt="">
                <div class="empty-state-title">No Students Found</div>
                <div>${rosterSearchTerm ? 'No students match your search criteria.' : 'No students are enrolled in this class session.'}</div>
            </div>
        `;
        updateStats(0, 0);
        return;
    }

    grid.innerHTML = `
        <div class="table-responsive">
            <table class="students-table">
                <thead>
                    <tr>
                        <th>Student Name</th>
                        <th>Student ID</th>
                        <th>Parent Phone</th>
                        <th>Status</th>
                        <th>Payment</th>
                        <th>Check-in Time</th>
                        <th>Check-out Time</th>
                    </tr>
                </thead>
                <tbody id="studentsTableBody">
                </tbody>
            </table>
        </div>
    `;

    const tbody = document.getElementById('studentsTableBody');

    filtered.forEach(s => {
        const checkIn = todayAttendance.find(att => String(att.student_id) === String(s.id));
        const isPresent = !!checkIn;
        
        let hasPaid = false;
        if (isPresent && checkIn.id) {
            const payRecord = todayPayments.find(p => String(p.attendance_id) === String(checkIn.id) && p.status === 'Paid');
            if (payRecord) hasPaid = true;
        }
        if (!hasPaid) {
            // Fallback for older records
            const payRecord = todayPayments.find(p => String(p.student_id) === String(s.id) && p.status === 'Paid');
            if (payRecord) hasPaid = true;
        }

        const row = document.createElement('tr');
        row.className = `student-row-item ${isPresent ? 'present-row' : ''}`;
        row.id = `student-card-${s.id}`;

        const photo = s.student_photo || './assets/img/student-blank-image.jpg';
        const name = s.student_name || 'Name Unknown';
        const studentId = s.student_id || 'ID N/A';
        const parentPhone = s.parent_phone_number || 'N/A';
        
        row.innerHTML = `
            <td>
                <div class="student-info-cell">
                    <div class="student-photo-small" style="background-image: url('${photo}'), url('./assets/img/student.png');"></div>
                    <span class="student-name-text">${name}</span>
                </div>
            </td>
            <td>${studentId}</td>
            <td>${parentPhone}</td>
            <td>
                <div class="student-status-badge ${isPresent ? 'badge-present' : 'badge-absent'}">
                    ${isPresent ? 'Present' : 'Absent'}
                </div>
            </td>
            <td>
                <div class="student-status-badge" style="background-color: ${hasPaid ? '#ecfdf5' : '#f1f5f9'}; color: ${hasPaid ? '#10b981' : '#64748b'};">
                    ${hasPaid ? 'Paid' : 'Unpaid'}
                </div>
            </td>
            <td>
                <span class="time-text">${isPresent ? checkIn.check_in_time : '-'}</span>
            </td>
            <td>
                <span class="time-text">${isPresent && checkIn.check_out_time ? checkIn.check_out_time : '-'}</span>
            </td>
        `;

        tbody.appendChild(row);
    });

    const presentCount = todayAttendance.length;
    const enrolledCount = enrolledStudents.length;
    updateStats(enrolledCount, presentCount);
    renderUnpaidCheckedOut();
}

// Update statistics panels
function updateStats(enrolledCount, presentCount) {
    const enrolledElem = document.getElementById('statsEnrolled');
    const presentElem = document.getElementById('statsPresent');
    const absentElem = document.getElementById('statsAbsent');
    const rateElem = document.getElementById('statsRate');

    const absentCount = Math.max(0, enrolledCount - presentCount);

    if (enrolledElem) enrolledElem.textContent = enrolledCount;
    if (presentElem) presentElem.textContent = presentCount;
    if (absentElem) absentElem.textContent = absentCount;
    
    if (rateElem) {
        const rate = enrolledCount > 0 ? Math.round((presentCount / enrolledCount) * 100) : 0;
        rateElem.textContent = `${rate}%`;
    }
}

// Render the Unpaid & Checked-Out sidebar panel
function renderUnpaidCheckedOut() {
    const btn = document.getElementById('unpaidCheckedOutBtn');
    const list = document.getElementById('unpaidCheckedOutList');
    const countBadge = document.getElementById('unpaidCheckedOutCount');
    if (!btn || !list) return;

    // Find students: checked IN and checked OUT today, but NOT paid
    const unpaidOut = [];
    todayAttendance.forEach(att => {
        if (!att.check_out_time) return; // still inside, not checked out

        // Check payment
        let hasPaid = false;
        if (att.id) {
            const payRecord = todayPayments.find(p => String(p.attendance_id) === String(att.id) && p.status === 'Paid');
            if (payRecord) hasPaid = true;
        }
        if (!hasPaid) {
            const payRecord = todayPayments.find(p => String(p.student_id) === String(att.student_id) && String(p.class_id) === String(att.class_id) && p.status === 'Paid');
            if (payRecord) hasPaid = true;
        }
        if (!hasPaid) {
            const student = allStudents.find(s => String(s.id) === String(att.student_id));
            unpaidOut.push({ att, student });
        }
    });

    if (unpaidOut.length === 0) {
        btn.style.display = 'none';
        return;
    }

    btn.style.display = 'flex';
    if (countBadge) countBadge.textContent = unpaidOut.length;

    list.innerHTML = unpaidOut.map(({ att, student }) => {
        const name = student ? student.student_name : `Student #${att.student_id}`;
        const photo = student ? (student.student_photo || './assets/img/student-blank-image.jpg') : './assets/img/student-blank-image.jpg';
        const sid = student ? student.id : att.student_id;
        return `
            <div style="display:flex;align-items:center;gap:10px;background:#fff7f7;border:1px solid #fecaca;border-radius:8px;padding:10px 12px;">
                <div style="width:36px;height:36px;border-radius:50%;background-image:url('${photo}');background-size:cover;background-position:center;flex-shrink:0;"></div>
                <div style="flex:1;min-width:0;">
                    <div style="font-size:13px;font-weight:600;color:#1e293b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${name}</div>
                    <div style="font-size:11px;color:#64748b;">Out: ${att.check_out_time}</div>
                </div>
                <button onclick="window.open('outstanding-payments.html?student_id=${sid}&class_id=${att.class_id}','_blank','width=1200,height=800')"
                    style="background:#dc2626;color:white;border:none;border-radius:6px;padding:6px 12px;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap;flex-shrink:0;">
                    Pay
                </button>
            </div>
        `;
    }).join('');
}

window.openUnpaidCheckedOutModal = function() {
    const modal = document.getElementById('unpaidCheckedOutModal');
    if (modal) {
        modal.style.display = 'flex';
    }
};

window.closeUnpaidCheckedOutModal = function() {
    const modal = document.getElementById('unpaidCheckedOutModal');
    if (modal) {
        modal.style.display = 'none';
    }
};


// Roster empty state helpers
function updateClassWidgetsEmpty() {
    const detailsContainer = document.getElementById('activeClassDetails');
    const badge = document.getElementById('activeClassStatusBadge');
    const name = document.getElementById('activeClassName');
    const location = document.getElementById('activeClassLocation');
    const schedule = document.getElementById('activeClassSchedule');

    toggleViewNextClassesBtn(true);

    if (detailsContainer) detailsContainer.style.display = 'flex';
    if (name) name.textContent = 'No Class Scheduled Now';
    if (location) location.textContent = 'Waiting for scheduled class session';
    
    if (schedule) {
        const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
        const todayWeekday = weekdays[new Date().getDay()];
        const now = new Date();
        const hh = String(now.getHours()).padStart(2, '0');
        const mm = String(now.getMinutes()).padStart(2, '0');
        const currentTime = `${hh}:${mm}`;
        
        const todayClasses = allClasses.filter(cls => {
            return cls.classdate && cls.classdate.trim().toLowerCase() === todayWeekday.toLowerCase();
        });
        const upcomingClasses = todayClasses.filter(cls => cls.classtime && cls.classtime > currentTime);
        upcomingClasses.sort((a, b) => a.classtime.localeCompare(b.classtime));

        if (upcomingClasses.length > 0) {
            const nextClass = upcomingClasses[0];
            schedule.innerHTML = `
                <span class="badge-day">${todayWeekday}</span>
                <span class="badge-time start-time" style="background-color: #eff6ff; color: #3b82f6; border: 1px solid #bfdbfe;">Next at ${nextClass.classtime}</span>
            `;
            if (location) location.textContent = `Next up: ${nextClass.name} (${nextClass.location || 'N/A'})`;
        } else {
            schedule.innerHTML = `
                <span class="badge-day">${todayWeekday}</span>
                <span class="badge-time start-time" style="background-color: transparent; color: var(--text-muted); border: 1px solid var(--border-color);">No more classes today</span>
            `;
            if (location) location.textContent = 'Waiting for scheduled class session';
        }
    }

    if (badge) {
        badge.className = 'active-class-status status-inactive';
        badge.textContent = 'Monitoring';
    }

    if (classTimerInterval) clearInterval(classTimerInterval);
    if (paymentSyncInterval) clearInterval(paymentSyncInterval);
    const durContainer = document.getElementById('activeClassDurationContainer');
    if (durContainer) durContainer.style.display = 'none';
    const countContainer = document.getElementById('activeClassCountdownContainer');
    if (countContainer) countContainer.style.display = 'none';
    const endBtnContainer = document.getElementById('endClassBtnContainer');
    if (endBtnContainer) endBtnContainer.style.display = 'none';

    const grid = document.getElementById('studentsGrid');
    if (grid) {
        grid.innerHTML = `
            <div class="empty-state">
                <img src="./assets/img/student-list.png" alt="">
                <h4 class="empty-state-title">No Class Session Scheduled Now</h4>
                <p>The system is monitoring the schedule and will automatically load the roster when a class session starts.</p>
            </div>
        `;
    }
    updateStats(0, 0);
}

// Roster search filter
window.handleSearch = function(value) {
    rosterSearchTerm = value;
    renderRoster();
};

// Roster status filter
window.handleStatusFilter = function(value) {
    rosterFilterStatus = value;
    renderRoster();
};

// Roster payment filter
window.handlePaymentFilter = function(value) {
    rosterFilterPaymentStatus = value;
    renderRoster();
};

function updateClassTimers() {
    if (!activeClass || !activeClass.classtime || !activeClass.class_endtime) return;

    const startStr = activeClass.classtime;
    const endStr = activeClass.class_endtime;

    const [startH, startM] = startStr.split(':').map(Number);
    const [endH, endM] = endStr.split(':').map(Number);

    const now = new Date();
    const currentH = now.getHours();
    const currentM = now.getMinutes();

    // Calculate duration
    let durationMins = (endH * 60 + endM) - (startH * 60 + startM);
    if (durationMins < 0) durationMins += 24 * 60; // handle overnight

    const durH = Math.floor(durationMins / 60);
    const durM = durationMins % 60;
    
    let durationText = '';
    if (durH > 0) durationText += `${durH} hr${durH > 1 ? 's' : ''} `;
    if (durM > 0) durationText += `${durM} min`;
    
    const durContainer = document.getElementById('activeClassDurationContainer');
    const durSpan = document.getElementById('activeClassDuration');
    if (durContainer && durSpan) {
        durContainer.style.display = 'flex';
        durSpan.textContent = durationText.trim() + ' duration';
    }

    // Calculate countdown
    const endTime = new Date(now);
    endTime.setHours(endH, endM, 0, 0);
    
    let remainingMs = endTime.getTime() - now.getTime();
    
    // Check if class date is today
    const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const todayWeekday = weekdays[now.getDay()];
    const isToday = activeClass.classdate && activeClass.classdate.trim().toLowerCase() === todayWeekday.toLowerCase();

    const countContainer = document.getElementById('activeClassCountdownContainer');
    const countSpan = document.getElementById('activeClassCountdown');
    const endBtnContainer = document.getElementById('endClassBtnContainer');
    
    if (countContainer && countSpan) {
        if (!isToday || remainingMs < 0) {
            countContainer.style.display = 'flex';
            countSpan.textContent = 'Class ended';
            countSpan.style.color = 'var(--text-muted)';
            if (endBtnContainer) endBtnContainer.style.display = 'block';
            
            if (isToday && remainingMs < 0 && !hasPromptedClassEnd) {
                hasPromptedClassEnd = true;
                const modal = document.getElementById('classEndedModal');
                if (modal) modal.style.display = 'flex';
            }
        } else if (remainingMs === 0) {
            countContainer.style.display = 'flex';
            countSpan.textContent = 'Ending now...';
            countSpan.style.color = '#e11d48';
            if (endBtnContainer) endBtnContainer.style.display = 'block';
            
            if (isToday && !hasPromptedClassEnd) {
                hasPromptedClassEnd = true;
                const modal = document.getElementById('classEndedModal');
                if (modal) modal.style.display = 'flex';
            }
        } else {
            countContainer.style.display = 'flex';
            const totalSecs = Math.floor(remainingMs / 1000);
            const remH = Math.floor(totalSecs / 3600);
            const remM = Math.floor((totalSecs % 3600) / 60);
            
            let remText = '';
            if (remH > 0) remText += `${remH} hr${remH > 1 ? 's' : ''} `;
            if (remM > 0 || remH === 0) remText += `${remM} min${remM !== 1 ? 's' : ''}`;
            
            countSpan.textContent = remText.trim() + ' to end';
            countSpan.style.color = '#e11d48';
            if (endBtnContainer) endBtnContainer.style.display = 'none';
        }
    }
}

// Handle keypressed card scan
async function handleCardScanned(nfcCardNumber) {
    console.log('NFC Card Scanned:', nfcCardNumber);

    if (!activeClass) {
        playSound('error');
        showToast('danger', 'No Active Class', 'No class session is currently scheduled or active.');
        return;
    }

    // 1. Look up student in full database by NFC number
    const student = allStudents.find(s => s.nfc_number && s.nfc_number.trim() === nfcCardNumber);

    if (!student) {
        // Unknown NFC Card
        playSound('error');
        showToast('danger', 'Card Unrecognized', `NFC Card #${nfcCardNumber} is not registered to any student.`);
        return;
    }

    // 2. Check if student is enrolled in active class
    const isEnrolled = enrolledStudents.some(s => String(s.id) === String(student.id));

    if (!isEnrolled) {
        // Registered but not enrolled in this class
        playSound('warning');
        showToast('warning', 'Not Enrolled', `${student.student_name} (ID: ${student.student_id}) is not enrolled in this class.`);
        return;
    }

    // 3. Check check-in/check-out states
    const existingRecord = todayAttendance.find(att => String(att.student_id) === String(student.id));

    if (existingRecord) {
        if (!existingRecord.check_out_time) {
            // Check 2-minute cooldown
            if (existingRecord.check_in_time) {
                const now = new Date();
                const [inH, inM, inS] = existingRecord.check_in_time.split(':').map(Number);
                const checkInDate = new Date(now);
                checkInDate.setHours(inH, inM, inS, 0);
                
                const diffMs = now.getTime() - checkInDate.getTime();
                if (diffMs >= 0 && diffMs < 120000) { // 2 minutes
                    playSound('warning');
                    showToast('warning', 'Too Soon to Check-Out', `Please wait at least 2 minutes after check-in to check out.`);
                    return;
                }
            }

            // Mark Check-Out
            const checkoutTimeStr = getLocalTimeString();
            const nowISO = new Date().toISOString();

            const payload = {
                class_id: existingRecord.class_id,
                student_id: existingRecord.student_id,
                attendance_date: existingRecord.attendance_date,
                status: existingRecord.status,
                check_in_time: existingRecord.check_in_time,
                check_out_time: checkoutTimeStr,
                created: existingRecord.created,
                updated: nowISO
            };

            const collectionName = getAttendanceCollectionName();

            // Optimistic UI Update
            const updatedRecord = { ...existingRecord, check_out_time: checkoutTimeStr };
            const idx = todayAttendance.findIndex(r => r.id === existingRecord.id);
            if (idx !== -1) {
                todayAttendance[idx] = updatedRecord;
            }

            renderRoster();
            
            const card = document.getElementById(`student-card-${student.id}`);
            if (card) {
                card.scrollIntoView({ behavior: 'smooth', block: 'center' });
                card.classList.add('present-highlight');
                setTimeout(() => {
                    card.classList.remove('present-highlight');
                }, 2000);
            }

            playSound('success');
            showToast('success', 'Checked Out', `${student.student_name} checked out at ${checkoutTimeStr}.`);
            sendAttendanceSMS(student, 'check-out', checkoutTimeStr);

            // Check if paid
            let hasPaid = false;
            if (existingRecord.id) {
                const payRecord = todayPayments.find(p => String(p.attendance_id) === String(existingRecord.id) && p.status === 'Paid');
                if (payRecord) hasPaid = true;
            }
            if (!hasPaid) {
                const payRecord = todayPayments.find(p => String(p.student_id) === String(student.id) && String(p.class_id) === String(activeClass.id) && p.status === 'Paid');
                if (payRecord) hasPaid = true;
            }

            if (!hasPaid) {
                window.showUnpaidAlertModal(student);
            } else {
                showScanSuccessModal(student, 'checkout');
            }

            // Async Database Update
            try {
                // Wait if it's still being saved
                if (String(existingRecord.id).startsWith('temp_') && existingRecord.savePromise) {
                    existingRecord.savePromise.then(docId => {
                        const docRef = doc(db, collectionName, docId);
                        updateDoc(docRef, {
                            check_out_time: checkoutTimeStr,
                            updated: serverTimestamp()
                        }).catch(err => {
                            console.error('Error saving check-out:', err);
                            showToast('danger', 'Sync Error', 'Failed to sync check-out record to cloud.');
                        });
                    });
                } else {
                    const docRef = doc(db, collectionName, existingRecord.id);
                    updateDoc(docRef, {
                        check_out_time: checkoutTimeStr,
                        updated: serverTimestamp()
                    }).catch(err => {
                        console.error('Error saving check-out:', err);
                        showToast('danger', 'Sync Error', 'Failed to sync check-out record to cloud.');
                    });
                }
                return;
            } catch (err) {
                console.error('Error initiating check-out:', err);
                return;
            }
        } else {
            // Already checked out
            playSound('warning');
            showToast('warning', 'Already Checked Out', `${student.student_name} is already checked out today.`);
            return;
        }
    }

    // 4. Record new check-in attendance in database
    const todayStr = getLocalDateString();
    const checkInTimeStr = getLocalTimeString();
    const nowISO = new Date().toISOString();

    // Get current region for saving
    let teacherRegion = 'WP';
    const activatedData = localStorage.getItem('Activated_Teacher') || localStorage.getItem('Activated_Institution');
    if (activatedData) {
        try {
            const stored = JSON.parse(activatedData);
            teacherRegion = stored.region || stored.province_region || stored.province || 'WP';
        } catch (e) {}
    }

    const payload = {
        class_id: String(activeClass.id),
        student_id: String(student.id),
        attendance_date: todayStr,
        status: 'Present',
        check_in_time: checkInTimeStr,
        check_out_time: '',
        province_region: teacherRegion,
        created: serverTimestamp(),
        updated: serverTimestamp()
    };

    const collectionName = getAttendanceCollectionName();
    
    // Optimistic UI Update
    const tempId = 'temp_' + Date.now();
    const newRecord = { id: tempId, ...payload, created: nowISO, updated: nowISO };
    
    todayAttendance.push(newRecord);
    renderRoster();
    
    const card = document.getElementById(`student-card-${student.id}`);
    if (card) {
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        card.classList.add('present-highlight');
        setTimeout(() => {
            card.classList.remove('present-highlight');
        }, 2000);
    }

    playSound('success');
    showToast('success', 'Attendance Marked', `${student.student_name} is Present.`);
    showScanSuccessModal(student, 'checkin');
    sendAttendanceSMS(student, 'check-in', checkInTimeStr);

    // Async Database Update
    newRecord.savePromise = addDoc(collection(db, collectionName), payload).then(docRef => {
        // Update temporary ID with actual DB ID
        const idx = todayAttendance.findIndex(r => r.id === tempId);
        if (idx !== -1) {
            todayAttendance[idx].id = docRef.id;
        }
        return docRef.id;
    }).catch(err => {
        console.error('Error saving check-in:', err);
        showToast('danger', 'Sync Error', 'Failed to sync check-in record to cloud.');
    });
}

// Open Next Classes Modal
window.openNextClassModal = function() {
    const modal = document.getElementById('nextClassModal');
    if (modal) {
        populateNextClassesList();
        modal.style.display = 'flex';
    }
};

window.closeNextClassModal = function() {
    const modal = document.getElementById('nextClassModal');
    if (modal) modal.style.display = 'none';
};

window.confirmEndClassSession = function() {
    const modal = document.getElementById('classEndedModal');
    if (modal) modal.style.display = 'none';
    
    if (activeClass) {
        manuallyEndedClassId = activeClass.id;
        sessionStorage.setItem('manuallyEndedClassId', activeClass.id);
    }
    
    sessionStorage.removeItem('manualClassId');
    activeClassMode = 'manual'; // ensure it won't instantly auto-restart the same class
    hasPromptedClassEnd = true;
    activeClass = null;
    updateClassWidgetsEmpty();
    showToast('info', 'Class Ended', 'The class session has been officially ended.');
    
    // Immediately check if there is a new class that should auto-start right now
    autoStartClassCheck();
};

window.showUnpaidAlertModal = function(student) {
    const modal = document.getElementById('unpaidAlertModal');
    if (modal) {
        modal.style.display = 'flex';
        const payBtn = document.getElementById('unpaidAlertPayBtn');
        if (payBtn) {
            payBtn.onclick = () => {
                modal.style.display = 'none';
                window.open(`payment.html?student_id=${student.id}`, '_blank', 'width=870,height=600');
            };
        }
    }
};

window.dismissUnpaidAlertModal = function() {
    const modal = document.getElementById('unpaidAlertModal');
    if (modal) modal.style.display = 'none';
};

window.dismissClassEndedModal = function() {
    const modal = document.getElementById('classEndedModal');
    if (modal) modal.style.display = 'none';
};

// Populate Today's Next Classes List
function populateNextClassesList() {
    const container = document.getElementById('nextClassesList');
    if (!container) return;

    container.innerHTML = '';

    const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const todayWeekday = weekdays[new Date().getDay()];

    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const currentTime = `${hh}:${mm}`;

    // Filter classes scheduled for today
    const todayClasses = allClasses.filter(cls => {
        if (!cls.classdate || !cls.classtime) return false;
        return cls.classdate.trim().toLowerCase() === todayWeekday.toLowerCase();
    });

    // Separate into upcoming and passed/active
    const upcomingClasses = todayClasses.filter(cls => cls.classtime > currentTime);
    
    // Sort upcoming classes by start time ascending
    upcomingClasses.sort((a, b) => a.classtime.localeCompare(b.classtime));

    if (upcomingClasses.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 32px 12px; color: var(--text-muted);">
                <h4 style="margin: 0 0 4px 0; color: var(--text-main); font-size: 13px; font-weight: 600;">No More Classes Today</h4>
                <p style="margin: 0; font-size: 11px; line-height: 1.4;">There are no upcoming classes scheduled for the rest of today.</p>
            </div>
        `;
        return;
    }

    upcomingClasses.forEach(cls => {
        const item = document.createElement('div');
        item.className = 'next-class-item';
        const isRunning = activeClass && String(activeClass.id) === String(cls.id);
        const anotherClassRunning = activeClass && !isRunning;
        
        let actionHtml = '';
        if (isRunning) {
            actionHtml = `<span style="padding: 6px 14px; background-color: #ecfdf5; color: #10b981; border: 1px solid #10b981; border-radius: 6px; font-size: 12px; font-weight: 600; display: inline-flex; align-items: center; gap: 4px;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg> Started</span>`;
        } else if (anotherClassRunning) {
            actionHtml = `<button disabled style="padding: 6px 14px; background-color: #f1f5f9; color: #94a3b8; border: 1px solid #e2e8f0; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: not-allowed;" title="Please end the active class first">Start</button>`;
        } else {
            actionHtml = `<button onclick="startUpcomingClass('${cls.id}')" style="padding: 6px 14px; background-color: #3b82f6; color: white; border: none; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; transition: background-color 0.2s;">Start</button>`;
        }

        item.innerHTML = `
            <div class="next-class-item-header">
                <span class="next-class-item-name">${cls.name}</span>
                <span class="badge-time start-time" style="background-color: var(--bg-light); color: var(--text-muted); border: 1px solid var(--border-color); padding: 2px 6px; border-radius: 2px; font-weight: 500; font-size: 11px;">
                    ${cls.classtime} - ${cls.class_endtime}
                </span>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 8px;">
                <div class="next-class-item-meta" style="margin-top: 0;">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0; color: var(--text-muted);">
                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                        <circle cx="12" cy="10" r="3"></circle>
                    </svg>
                    <span>Location: ${cls.location || 'N/A'}</span>
                </div>
                ${actionHtml}
            </div>
        `;
        container.appendChild(item);
    });
}

// Start upcoming class manually
window.startUpcomingClass = function(classId) {
    if (activeClass && String(activeClass.id) !== String(classId)) {
        showToast('warning', 'Action Denied', 'Please end the currently active class before starting a new one.');
        return;
    }

    const modal = document.getElementById('nextClassModal');
    if (modal) modal.style.display = 'none';
    
    sessionStorage.setItem('manualClassId', classId);
    handleClassChange(classId, 'manual');
    showToast('success', 'Class Started Manually', 'The selected class session has been started.');

    // Broadcast manual start to other devices
    const activatedData = localStorage.getItem('Activated_Teacher') || localStorage.getItem('Activated_Institution');
    if (activatedData) {
        try {
            const stored = JSON.parse(activatedData);
            const teacherId = stored.teacher_id || stored.institution_id;
            if (teacherId) {
                setDoc(doc(db, 'teacher_active_classes', String(teacherId)), {
                    class_id: classId,
                    updated_at: serverTimestamp()
                }).catch(e => console.error('Error broadcasting manual class start:', e));
            }
        } catch (e) {
            console.error('Error broadcasting manual class start:', e);
        }
    }
};

// Close modal on outside click
window.addEventListener('click', (e) => {
    const modal = document.getElementById('nextClassModal');
    if (modal && e.target === modal) {
        modal.style.display = 'none';
    }
});

// Show Scan Success Modal
window.showScanSuccessModal = function(student, type) {
    const modal = document.getElementById('scanSuccessModal');
    const photoEl = document.getElementById('scanSuccessPhoto');
    const nameEl = document.getElementById('scanSuccessName');
    const idEl = document.getElementById('scanSuccessId');
    const statusEl = document.getElementById('scanSuccessStatus');
    const subtextEl = document.getElementById('scanSuccessSubtext');

    if (!modal || !photoEl || !nameEl || !idEl || !statusEl) return;

    const photo = student.student_photo || './assets/img/student-blank-image.jpg';
    photoEl.style.backgroundImage = `url('${photo}'), url('./assets/img/student.png')`;
    nameEl.textContent = student.student_name || 'Name Unknown';
    idEl.textContent = `ID: ${student.student_id || 'N/A'}`;

    if (type === 'checkin') {
        statusEl.textContent = 'Check-In Successful';
        if (subtextEl) subtextEl.textContent = 'You have been checked in successfully.';
    } else if (type === 'checkout') {
        statusEl.textContent = 'Check-Out Successful';
        if (subtextEl) subtextEl.textContent = 'You have been checked out successfully.';
    }

    modal.style.display = 'flex';

    // Auto hide after 3 seconds
    if (window.scanSuccessTimeout) clearTimeout(window.scanSuccessTimeout);
    window.scanSuccessTimeout = setTimeout(() => {
        modal.style.display = 'none';
    }, 1500);
};

// Open Payment Window
window.openPaymentWindow = function() {
    if (!activeClass) {
        showToast('warning', 'No Active Class', 'Please start a class session before collecting payments.');
        return;
    }
    
    // Store active class ID so payment window can pick it up
    sessionStorage.setItem('paymentTargetClassId', activeClass.id);
    
    // Open payment window
    window.open('payment.html', '_blank', 'width=870,height=450');
};

window.syncPayments = async function() {
    if (!activeClass) return;
    const todayDateStr = getLocalDateString();
    try {
        const payRes = await fetch(`${PAYMENTS_API}?class_id=${activeClass.id}&payment_date=${todayDateStr}`, { headers: { 'x-api-key': X_API_KEY } });
        if (payRes.ok) {
            const payData = await payRes.json();
            const newPayments = Array.isArray(payData) ? payData : (payData.items || []);
            todayPayments = newPayments;
            
            enrolledStudents.forEach(s => {
                const row = document.getElementById(`student-card-${s.id}`);
                if (!row) return;

                const checkIn = todayAttendance.find(att => String(att.student_id) === String(s.id));
                let hasPaid = false;
                if (checkIn && checkIn.id) {
                    const payRecord = todayPayments.find(p => String(p.attendance_id) === String(checkIn.id) && p.status === 'Paid');
                    if (payRecord) hasPaid = true;
                }
                if (!hasPaid) {
                    const payRecord = todayPayments.find(p => String(p.student_id) === String(s.id) && p.status === 'Paid');
                    if (payRecord) hasPaid = true;
                }

                const cells = row.getElementsByTagName('td');
                if (cells.length > 4) {
                    const payCell = cells[4];
                    payCell.innerHTML = `
                        <div class="student-status-badge" style="background-color: ${hasPaid ? '#ecfdf5' : '#f1f5f9'}; color: ${hasPaid ? '#10b981' : '#64748b'};">
                            ${hasPaid ? 'Paid' : 'Unpaid'}
                        </div>
                    `;
                }
            });
            
            // Real-time update for Unpaid & Checked Out list/badge
            renderUnpaidCheckedOut();
        }
    } catch (e) {
        console.error('Failed to sync payments in real-time', e);
    }
};
