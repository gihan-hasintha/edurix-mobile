import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, getDocs, query, where, limit, orderBy } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

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
const PAYMENTS_API = `${API_URL_BASE}/payments`;
const CLASS_STUDENTS_API = `${API_URL_BASE}/class_students`;
const X_API_KEY = '996de2d470a0f1e9794b7778e216c193258aac001b36813f9ad1d3f957cc7ee7';

let allStudents = [];
let allClasses = [];
let studentAttendanceRecords = [];
let studentPaymentRecords = [];

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

function showToast(type, title, message) {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast-alert toast-${type}`;
    
    // Inline simple styling for the toast
    toast.style.background = '#fff';
    toast.style.borderLeft = `4px solid ${type === 'success' ? '#10b981' : type === 'danger' ? '#ef4444' : '#f59e0b'}`;
    toast.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1)';
    toast.style.padding = '12px 16px';
    toast.style.borderRadius = '8px';
    toast.style.display = 'flex';
    toast.style.flexDirection = 'column';
    toast.style.minWidth = '250px';

    toast.innerHTML = `
        <strong style="font-size: 14px; margin-bottom: 4px;">${title}</strong>
        <span style="font-size: 13px; color: #6b7280;">${message}</span>
    `;

    container.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
}

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
            osc.type = 'sine';
            osc.frequency.setValueAtTime(523.25, ctx.currentTime); 
            osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.08); 
            gain.gain.setValueAtTime(0.12, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.005, ctx.currentTime + 0.3);
            osc.start();
            osc.stop(ctx.currentTime + 0.3);
        } else if (type === 'error') {
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(150, ctx.currentTime);
            osc.frequency.setValueAtTime(90, ctx.currentTime + 0.15);
            gain.gain.setValueAtTime(0.2, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.005, ctx.currentTime + 0.4);
            osc.start();
            osc.stop(ctx.currentTime + 0.4);
        }
    } catch (err) {}
}

function focusNfcField() {
    const input = document.getElementById('nfc-number');
    if (input) input.focus();
}

window.initStudentProfile = async function() {
    focusNfcField();
    
    // Auto re-focus input on clicks to catch all card taps
    document.addEventListener('click', (e) => {
        const interactive = e.target.closest('button, a, input:not(#nfc-number), select, option');
        if (!interactive) {
            focusNfcField();
        }
    });
    
    const nfcInput = document.getElementById('nfc-number');
    if (nfcInput) {
        nfcInput.addEventListener('blur', () => {
            setTimeout(() => {
                const active = document.activeElement;
                const isInteractive = active && active.closest('button, a, input:not(#nfc-number), select, option');
                if (!isInteractive) focusNfcField();
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

    const searchInput = document.getElementById('attendanceSearch');
    const dateInput = document.getElementById('attendanceDate');
    const dayInput = document.getElementById('attendanceDay');
    const clearBtn = document.getElementById('clearAttendanceFilter');
    
    if (searchInput) searchInput.addEventListener('input', renderAttendanceTable);
    if (dateInput) dateInput.addEventListener('change', renderAttendanceTable);
    if (dayInput) dayInput.addEventListener('change', renderAttendanceTable);
    if (clearBtn) clearBtn.addEventListener('click', () => {
        if (searchInput) searchInput.value = '';
        if (dateInput) dateInput.value = '';
        if (dayInput) dayInput.value = '';
        renderAttendanceTable();
    });

    const paymentSearchInput = document.getElementById('paymentSearch');
    const paymentDateInput = document.getElementById('paymentDate');
    const paymentDayInput = document.getElementById('paymentDay');
    const clearPaymentBtn = document.getElementById('clearPaymentFilter');
    
    if (paymentSearchInput) paymentSearchInput.addEventListener('input', renderPaymentTable);
    if (paymentDateInput) paymentDateInput.addEventListener('change', renderPaymentTable);
    if (paymentDayInput) paymentDayInput.addEventListener('change', renderPaymentTable);
    if (clearPaymentBtn) clearPaymentBtn.addEventListener('click', () => {
        if (paymentSearchInput) paymentSearchInput.value = '';
        if (paymentDateInput) paymentDateInput.value = '';
        if (paymentDayInput) paymentDayInput.value = '';
        renderPaymentTable();
    });

    await loadInitialData();
};

async function loadInitialData() {
    const activatedData = localStorage.getItem('Activated_Teacher') || localStorage.getItem('Activated_Institution');
    if (!activatedData) {
        showToast('danger', 'Activation Required', 'Please activate your account first.');
        return;
    }

    const stored = JSON.parse(activatedData);
    const teacherId = stored.teacher_id || stored.institution_id;

    try {
        const [classesRes, studentsRes] = await Promise.all([
            fetch(`${CLASSES_API}?teacher_id=${teacherId}`, { headers: { 'x-api-key': X_API_KEY } }),
            fetch(`${STUDENTS_API}?teacher_id=${teacherId}`, { headers: { 'x-api-key': X_API_KEY } })
        ]);

        if (!classesRes.ok || !studentsRes.ok) {
            throw new Error('Failed to fetch initial database data.');
        }

        const classesData = await classesRes.json();
        const studentsData = await studentsRes.json();

        allClasses = Array.isArray(classesData) ? classesData : (classesData.items || []);
        allStudents = Array.isArray(studentsData) ? studentsData : (studentsData.items || []);

    } catch (err) {
        console.error('Initialization error:', err);
        showToast('danger', 'Database Error', 'Failed to retrieve records.');
    } finally {
    }
}

async function handleCardScanned(nfcCardNumber) {
    const student = allStudents.find(s => s.nfc_number && s.nfc_number.trim() === nfcCardNumber);

    if (!student) {
        playSound('error');
        showToast('danger', 'Card Unrecognized', `NFC Card is not registered to any student.`);
        return;
    }

    playSound('success');
    window.activeStudentId = student.id;
    window.currentStudent = student;
    
    // Switch Views
    document.getElementById('waiting-state').style.display = 'none';
    const mainArea = document.getElementById('profile-main-area');
    mainArea.style.display = 'flex';
    // Remove the inline display flex from style to allow css to handle it properly, but here we enforce flex gap
    mainArea.style.cssText = 'display: flex; flex-direction: column; gap: 20px; width: 100%;';

    // Populate Left Panel (Profile)
    const photo = student.student_photo || './assets/img/depositphotos_679927214-stock-illustration-default-avatar-profile-placeholder-abstract.jpg';
    document.getElementById('studentPhoto').style.backgroundImage = `url('${photo}')`;
    document.getElementById('studentName').textContent = student.student_name || 'Name Unknown';
    document.getElementById('studentIdCode').textContent = student.student_id || 'ID N/A';
    document.getElementById('studentPhone').textContent = student.phone_number || 'N/A';
    
    let bdayFormatted = 'N/A';
    if (student.birthday) {
        const b = new Date(student.birthday);
        if (!isNaN(b)) {
            bdayFormatted = b.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
        } else {
            bdayFormatted = student.birthday;
        }
    }
    document.getElementById('studentBirthday').textContent = bdayFormatted;
    document.getElementById('studentAddress').textContent = student.address || 'N/A';
    document.getElementById('parentName').textContent = student.parent_name || 'N/A';
    document.getElementById('parentPhone').textContent = student.parent_phone_number || 'N/A';

    // Fetch History & Stats
    const attendanceTableBody = document.getElementById('attendanceTableBody');
    if (attendanceTableBody) {
        attendanceTableBody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--text-muted); padding: 20px;">Loading attendance records...</td></tr>';
    }
    
    const paymentsTableBody = document.getElementById('paymentsTableBody');
    if (paymentsTableBody) {
        paymentsTableBody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--text-muted); padding: 20px;">Loading payment records...</td></tr>';
    }

    fetchAttendance(student.id);
    fetchPayments(student.id);
    fetchStats(student.id);
}

async function fetchStats(studentId) {
    try {
        const response = await fetch(`${CLASS_STUDENTS_API}?student_id=${studentId}`, { headers: { 'x-api-key': X_API_KEY } });
        if (response.ok) {
            const data = await response.json();
            const enrollments = Array.isArray(data) ? data : (data.items || []);
            document.getElementById('statCoursesVal').textContent = enrollments.length;
        }
    } catch (e) {
        console.error('Error fetching enrollments:', e);
    }
}

function getClassName(classId) {
    const cls = allClasses.find(c => String(c.id) === String(classId));
    return cls ? cls.name : 'Unknown Class';
}

async function fetchAttendance(studentId) {
    const listEl = document.getElementById('attendanceList');
    try {
        const collectionName = getAttendanceCollectionName();
        // Since we want all history, we only filter by student_id
        const q = query(
            collection(db, collectionName),
            where('student_id', '==', String(studentId)),
            // Firestore requires compound index if combining where with orderBy, so we might sort client-side
            limit(50)
        );
        
        const querySnapshot = await getDocs(q);
        const records = [];
        querySnapshot.forEach((docSnap) => {
            records.push({ id: docSnap.id, ...docSnap.data() });
        });

        // Sort descending by date (client-side to avoid index requirement errors)
        records.sort((a, b) => {
            const dateA = new Date(a.attendance_date + ' ' + (a.check_in_time || '00:00'));
            const dateB = new Date(b.attendance_date + ' ' + (b.check_in_time || '00:00'));
            return dateB - dateA;
        });

        studentAttendanceRecords = records;
        renderAttendanceTable();

        // Update attendance rate stat globally for the student
        let presentCount = 0;
        records.forEach(rec => {
            if (rec.status === 'Present') presentCount++;
        });
        const rate = records.length > 0 ? Math.round((presentCount / records.length) * 100) : 0;
        document.getElementById('statAttendanceVal').textContent = `${rate}%`;
        document.getElementById('statAttendanceSub').textContent = rate >= 80 ? 'Excellent' : (rate >= 50 ? 'Average' : 'Needs Attention');
        document.getElementById('statAttendanceSub').style.color = rate >= 80 ? '#10b981' : (rate >= 50 ? '#f59e0b' : '#ef4444');

        if (typeof calculateOutstandingFees === 'function') calculateOutstandingFees();


    } catch (err) {
        console.error('Error fetching attendance:', err);
        const tbody = document.getElementById('attendanceTableBody');
        if (tbody) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--danger-text); padding: 20px;">Failed to load attendance records.</td></tr>';
        }
    }
}

function renderAttendanceTable() {
    const tbody = document.getElementById('attendanceTableBody');
    if (!tbody) return;

    const searchTerm = (document.getElementById('attendanceSearch')?.value || '').toLowerCase();
    const filterDate = document.getElementById('attendanceDate')?.value || '';
    const filterDay = document.getElementById('attendanceDay')?.value || '';

    const filtered = studentAttendanceRecords.filter(rec => {
        const className = getClassName(rec.class_id).toLowerCase();
        const matchesSearch = className.includes(searchTerm);
        const matchesDate = filterDate ? rec.attendance_date === filterDate : true;
        
        let matchesDay = true;
        if (filterDay && rec.attendance_date) {
            const dateObj = new Date(rec.attendance_date);
            if (!isNaN(dateObj)) {
                const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'long' });
                matchesDay = (dayName === filterDay);
            }
        }
        
        return matchesSearch && matchesDate && matchesDay;
    });

    tbody.innerHTML = '';
    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--text-muted); padding: 20px;">No attendance records found matching criteria.</td></tr>';
        return;
    }

    filtered.forEach(rec => {
        const className = getClassName(rec.class_id);
        const isPresent = rec.status === 'Present';
        
        // Format dates for UI
        const dateObj = new Date(rec.attendance_date);
        const formattedDate = isNaN(dateObj) ? rec.attendance_date : dateObj.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
        const formattedTime = rec.check_in_time || 'N/A';
        const cls = allClasses.find(c => String(c.id) === String(rec.class_id));
        const checkOutStr = rec.check_out_time ? ` - ${rec.check_out_time}` : (cls && cls.class_endtime ? ` - ${cls.class_endtime}` : '');
        
        let paymentBadgeHtml = '';
        let actionHtml = '';
        
        const payRecord = studentPaymentRecords.find(p => 
            (String(p.attendance_id) === String(rec.id) || (String(p.class_id) === String(rec.class_id) && p.payment_date === rec.attendance_date)) 
            && p.status === 'Paid'
        );
        if (!payRecord) {
            paymentBadgeHtml = `<div class="status-badge" style="background-color: #fee2e2; color: #ef4444; margin-top: 4px;">Unpaid</div>`;
            const studentId = window.activeStudentId || (window.currentStudent ? window.currentStudent.id : '');
            actionHtml = `<button onclick="window.open('outstanding-payments.html?student_id=${studentId}', '_blank', 'width=870,height=600')" style="background: #3b82f6; color: white; border: none; padding: 4px 12px; border-radius: 4px; font-size: 12px; cursor: pointer; font-weight: 600;">Pay</button>`;
        } else {
            paymentBadgeHtml = `<div class="status-badge" style="background-color: #ecfdf5; color: #10b981; margin-top: 4px;">Paid</div>`;
            actionHtml = `<span style="color: #cbd5e1; font-size: 12px;">-</span>`;
        }

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="class-name-cell">${className}</td>
            <td class="date-cell">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                ${formattedDate}
            </td>
            <td class="time-cell">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                ${formattedTime}${checkOutStr}
            </td>
            <td class="status-cell">
                <div class="status-badge ${isPresent ? 'status-present' : 'status-absent'}">${isPresent ? 'Present' : 'Absent'}</div>
                ${paymentBadgeHtml}
            </td>
            <td class="action-cell" style="text-align: right;">
                ${actionHtml}
            </td>
        `;
        tbody.appendChild(tr);
    });
}

async function fetchPayments(studentId) {
    const tbody = document.getElementById('paymentsTableBody');
    try {
        const response = await fetch(`${PAYMENTS_API}?student_id=${studentId}`, { headers: { 'x-api-key': X_API_KEY } });
        if (!response.ok) throw new Error('API fetch failed');
        
        const data = await response.json();
        const records = Array.isArray(data) ? data : (data.items || []);

        // Sort descending by date
        records.sort((a, b) => new Date(b.payment_date) - new Date(a.payment_date));

        studentPaymentRecords = records;
        
        if (typeof calculateOutstandingFees === 'function') calculateOutstandingFees();


        renderPaymentTable();

    } catch (err) {
        console.error('Error fetching payments:', err);
        if (tbody) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--danger-text); padding: 20px;">Failed to load payment records.</td></tr>';
        }
    }
}

function renderPaymentTable() {
    const tbody = document.getElementById('paymentsTableBody');
    if (!tbody) return;

    const searchTerm = (document.getElementById('paymentSearch')?.value || '').toLowerCase();
    const filterDate = document.getElementById('paymentDate')?.value || '';
    const filterDay = document.getElementById('paymentDay')?.value || '';

    const filtered = studentPaymentRecords.filter(rec => {
        const className = getClassName(rec.class_id).toLowerCase();
        const matchesSearch = className.includes(searchTerm);
        const matchesDate = filterDate ? rec.payment_date === filterDate : true;
        
        let matchesDay = true;
        if (filterDay && rec.payment_date) {
            const dateObj = new Date(rec.payment_date);
            if (!isNaN(dateObj)) {
                const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'long' });
                matchesDay = (dayName === filterDay);
            }
        }
        
        return matchesSearch && matchesDate && matchesDay;
    });

    tbody.innerHTML = '';
    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--text-muted); padding: 20px;">No payment records found matching criteria.</td></tr>';
        return;
    }

    filtered.forEach(rec => {
        const className = getClassName(rec.class_id);
        const isPaid = rec.status === 'Paid';
        const amount = parseFloat(rec.amount || 0);
        
        const dateObj = new Date(rec.payment_date);
        const formattedDate = isNaN(dateObj) ? rec.payment_date : dateObj.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
        
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="class-name-cell">${className}</td>
            <td class="date-cell">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                ${formattedDate}
            </td>
            <td class="time-cell">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="5" width="20" height="14" rx="2" ry="2"></rect><line x1="2" y1="10" x2="22" y2="10"></line></svg>
                <span style="font-weight: 600; color: var(--text-main); margin-right: 8px;">${amount.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})} LKR</span>
                <span style="font-size: 12px;">(Type: ${rec.payment_type || 'Cash'})</span>
            </td>
            <td class="status-cell">
                <div class="status-badge ${isPaid ? 'status-paid' : 'status-unpaid'}" style="background-color: ${isPaid ? '#ecfdf5' : '#f1f5f9'}; color: ${isPaid ? '#10b981' : '#64748b'};">${isPaid ? 'Paid' : 'Unpaid'}</div>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// Global functions for HTML
window.initStudentProfile = initStudentProfile;

function calculateOutstandingFees() {
    let unpaidTotal = 0;
    
    studentAttendanceRecords.forEach(att => {
        const payRecord = studentPaymentRecords.find(p => 
            (String(p.attendance_id) === String(att.id) || (String(p.class_id) === String(att.class_id) && p.payment_date === att.attendance_date)) 
            && p.status === 'Paid'
        );
        
        if (!payRecord) {
            const cls = allClasses.find(c => String(c.id) === String(att.class_id));
            if (cls && cls.fee_amount) {
                unpaidTotal += parseFloat(cls.fee_amount);
            }
        }
    });

    const valEl = document.getElementById('statOutstandingVal');
    const subEl = document.getElementById('statOutstandingSub');
    
    if (valEl) valEl.textContent = `LKR ${unpaidTotal.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
    
    if (subEl) {
        if (unpaidTotal > 0) {
            subEl.textContent = 'Needs Attention';
            subEl.style.color = '#ef4444'; // red
        } else {
            subEl.textContent = 'All Paid';
            subEl.style.color = '#10b981'; // green
        }
    }
    
    // Re-render attendance table to show payment badges correctly if they were already rendered
    renderAttendanceTable();
}

// Listen for real-time payment updates from other windows
window.addEventListener('storage', (e) => {
    if (e.key === 'payment_updated' && window.activeStudentId) {
        fetchPayments(window.activeStudentId);
    }
});
