import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, getDocs, query, where } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

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

let allStudents = [];
let allClasses = [];
let allPayments = [];
let allEnrollments = [];
let allAttendances = [];

let currentStudent = null;
let outstandingList = [];
let upcomingList = [];
let teacherSettings = null;

// Send Payment SMS via text.lk
async function sendPaymentSMS(student, amount, dateStr) {
    if (!teacherSettings || !teacherSettings.sms_service || !teacherSettings.sms_api || !teacherSettings.sms_senderid) return;
    if (!teacherSettings.payment_sms) return;

    const recipient = student.parent_phone_number;
    if (!recipient) return;

    let formattedRecipient = recipient.replace(/[^0-9+]/g, '');
    if (formattedRecipient.startsWith('0')) {
        formattedRecipient = '94' + formattedRecipient.substring(1);
    } else if (formattedRecipient.startsWith('+94')) {
        formattedRecipient = formattedRecipient.substring(1);
    }

    const senderName = teacherSettings.name || 'Institute';
    const amountFormatted = parseFloat(amount).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
    const message = `Dear Parent, we have received a payment of LKR ${amountFormatted} for ${student.student_name} on ${dateStr}. Thank you. - ${senderName}`;

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

        if (!response.ok) {
            console.error('Failed to send Payment SMS:', await response.text());
        }
    } catch (err) {
        console.error('Payment SMS sending error:', err);
    }
}

function getAttendanceCollectionName() {
    const activatedData = localStorage.getItem('Activated_Teacher') || localStorage.getItem('Activated_Institution');
    if (activatedData) {
        try {
            const stored = JSON.parse(activatedData);
            const region = stored.region || stored.province_region || stored.province || 'WP';
            return `attendance_${region.toLowerCase()}`;
        } catch (e) {}
    }
    return 'attendance_wp';
}

function getActivatedId() {
    const activatedData = localStorage.getItem('Activated_Teacher') || localStorage.getItem('Activated_Institution');
    if (!activatedData) return null;
    const stored = JSON.parse(activatedData);
    return stored.teacher_id || stored.institution_id;
}

function showToast(type, title, message) {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast-alert toast-${type}`;
    
    let icon = '';
    if (type === 'success') {
        icon = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`;
    } else if (type === 'warning') {
        icon = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`;
    } else {
        icon = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`;
    }

    toast.innerHTML = `
        <div class="toast-icon">${icon}</div>
        <div class="toast-content">
            <div class="toast-title">${title}</div>
            <div class="toast-msg">${message}</div>
        </div>
    `;
    container.appendChild(toast);
    setTimeout(() => {
        toast.classList.add('fade-out');
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

function getLocalDateString() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

async function loadInitialData() {
    const teacherId = getActivatedId();
    if (!teacherId) return;

    try {
        const [classesRes, studentsRes, teacherRes] = await Promise.all([
            fetch(`${CLASSES_API}?teacher_id=${teacherId}`, { headers: { 'x-api-key': X_API_KEY } }),
            fetch(`${STUDENTS_API}?teacher_id=${teacherId}`, { headers: { 'x-api-key': X_API_KEY } }),
            fetch(`${API_URL_BASE}/teachers`, { headers: { 'x-api-key': X_API_KEY } })
        ]);

        if (classesRes.ok) {
            const data = await classesRes.json();
            allClasses = Array.isArray(data) ? data : (data.items || []);
        }
        
        if (studentsRes.ok) {
            const data = await studentsRes.json();
            allStudents = Array.isArray(data) ? data : (data.items || []);
        }

        if (teacherRes.ok) {
            const teacherData = await teacherRes.json();
            const teachersItems = Array.isArray(teacherData) ? teacherData : (teacherData.items || []);
            teacherSettings = teachersItems.find(t => String(t.teacher_id) === String(teacherId)) || null;
        }

        // Check if opened via URL params
        const urlParams = new URLSearchParams(window.location.search);
        const studentId = urlParams.get('student_id');
        const triggeredClassId = urlParams.get('class_id') || null; // optional: highlights today's class
        
        if (studentId) {
            const student = allStudents.find(s => String(s.id) === String(studentId));
            if (student) {
                await loadStudentProfile(student, triggeredClassId);
            } else {
                showToast('danger', 'Error', 'Student not found in database.');
            }
        }

    } catch (err) {
        console.error('Failed to load initial data', err);
    } finally {
        document.getElementById('loading-window').style.display = 'none';
        focusNfcField();
    }
}

let _triggeredClassId = null;

async function loadStudentProfile(student, triggeredClassId = null) {
    currentStudent = student;
    _triggeredClassId = triggeredClassId;
    document.getElementById('loading-window').style.display = 'flex';
    document.getElementById('view-waiting').style.display = 'none';
    
    try {
        // Fetch specific student's payments and enrollments
        const [payRes, enrollRes] = await Promise.all([
            fetch(`${PAYMENTS_API}?student_id=${student.id}`, { headers: { 'x-api-key': X_API_KEY } }),
            fetch(`${CLASS_STUDENTS_API}`, { headers: { 'x-api-key': X_API_KEY } })
        ]);

        if (payRes.ok) {
            const data = await payRes.json();
            allPayments = Array.isArray(data) ? data : (data.items || []);
        }
        
        if (enrollRes.ok) {
            const data = await enrollRes.json();
            const enrolls = Array.isArray(data) ? data : (data.items || []);
            allEnrollments = enrolls.filter(e => String(e.student_id) === String(student.id));
        }

        // Fetch attendance for student
        const collectionName = getAttendanceCollectionName();
        const q = query(
            collection(db, collectionName),
            where('student_id', '==', String(student.id))
        );
        const snapshot = await getDocs(q);
        allAttendances = [];
        snapshot.forEach(doc => {
            allAttendances.push({ id: doc.id, ...doc.data() });
        });

        processStudentData();
        renderPaymentUI();

    } catch (err) {
        console.error(err);
        showToast('danger', 'Error', 'Failed to load student payment details.');
    } finally {
        document.getElementById('loading-window').style.display = 'none';
    }
}

function processStudentData() {
    outstandingList = [];
    upcomingList = [];
    const today = getLocalDateString();
    
    // Process Outstanding
    allAttendances.forEach(att => {
        const payRecord = allPayments.find(p => 
            (String(p.attendance_id) === String(att.id) || (String(p.class_id) === String(att.class_id) && p.payment_date === att.attendance_date)) 
            && p.status === 'Paid'
        );
        
        if (!payRecord) {
            const cls = allClasses.find(c => String(c.id) === String(att.class_id));
            if (cls) {
                const isTriggered = _triggeredClassId && String(att.class_id) === String(_triggeredClassId) && att.attendance_date === today;
                outstandingList.push({
                    type: 'outstanding',
                    attendance: att,
                    cls: cls,
                    fee: parseFloat(cls.fee_amount || 0),
                    date: att.attendance_date,
                    isToday: isTriggered  // flag to highlight at top
                });
            }
        }
    });

    // Sort: today's triggered class first, then oldest first
    outstandingList.sort((a, b) => {
        if (a.isToday && !b.isToday) return -1;
        if (!a.isToday && b.isToday) return 1;
        return new Date(a.date) - new Date(b.date);
    });

    // Process Upcoming
    allEnrollments.forEach(enr => {
        const cls = allClasses.find(c => String(c.id) === String(enr.class_id));
        if (cls) {
            const hasAttendedToday = allAttendances.some(a => String(a.class_id) === String(cls.id) && a.attendance_date === today);
            if (!hasAttendedToday) {
                upcomingList.push({
                    type: 'upcoming',
                    cls: cls,
                    fee: parseFloat(cls.fee_amount || 0),
                    date: 'Upcoming / Scheduled'
                });
            }
        }
    });
}

function renderPaymentUI() {
    document.getElementById('view-payment').style.display = 'flex';
    
    const photo = currentStudent.student_photo || './assets/img/student-blank-image.jpg';
    document.getElementById('studentPhoto').style.backgroundImage = `url('${photo}')`;
    
    let typeColor = currentStudent.class_type === 'Online' ? '#3b82f6' : (currentStudent.class_type === 'Both' ? '#8b5cf6' : '#10b981');
    let classTypeHtml = currentStudent.class_type ? `<span style="background: ${typeColor}20; color: ${typeColor}; padding: 1px 4px; border-radius: 4px; font-size: 10px; font-weight: bold; margin-left: 6px; vertical-align: middle;">${currentStudent.class_type.toUpperCase()}</span>` : '';
    
    document.getElementById('studentName').innerHTML = (currentStudent.student_name || 'Unknown Name') + classTypeHtml;
    document.getElementById('studentIdCode').textContent = `ID: ${currentStudent.student_id || 'N/A'}`;
    
    const parentNameEl = document.getElementById('parentName');
    if (parentNameEl) parentNameEl.textContent = currentStudent.parent_name || 'N/A';
    
    const phoneEl = document.getElementById('studentPhone');
    if (phoneEl) phoneEl.textContent = currentStudent.parent_contact || currentStudent.student_contact || 'N/A';

    let totalDue = 0;

    // Render Outstanding
    const outContainer = document.getElementById('outstandingFeesList');
    outContainer.innerHTML = '';
    if (outstandingList.length === 0) {
        outContainer.innerHTML = `<div class="empty-state">No outstanding fees.</div>`;
    } else {
        outstandingList.forEach(item => {
            totalDue += item.fee;
            const todayBadge = item.isToday
                ? `<span style="display:inline-block;background:#dc2626;color:white;font-size:10px;font-weight:700;padding:2px 8px;border-radius:12px;margin-left:8px;letter-spacing:0.5px;">TODAY</span>`
                : '';
            const borderStyle = item.isToday ? 'border-color:#fca5a5;background:#fff1f2;' : '';
            outContainer.innerHTML += `
                <div class="outstanding-item" style="${borderStyle}">
                    <div class="out-top">
                        <h4>${item.cls.name}${todayBadge}</h4>
                        <div class="out-amount">LKR ${item.fee.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
                    </div>
                    <div class="out-dotted-divider"></div>
                    <div class="out-details">
                        <div class="out-detail-col">
                            <div>Date</div>
                            <div><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg> ${item.date}</div>
                        </div>
                        <div class="out-detail-col">
                            <div>Logged In</div>
                            <div><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg> ${item.attendance.check_in_time}</div>
                        </div>
                        <div class="out-detail-col">
                            <div>Logged Out</div>
                            <div><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg> ${item.attendance.check_out_time || 'N/A'}</div>
                        </div>
                    </div>
                </div>
            `;
        });
    }

    // Render Upcoming
    const upContainer = document.getElementById('upcomingClassesList');
    upContainer.innerHTML = '';
    if (upcomingList.length === 0) {
        upContainer.innerHTML = `<div class="empty-state">No upcoming class fees required right now.</div>`;
    } else {
        const teacherName = localStorage.getItem('Activated_Teacher') ? JSON.parse(localStorage.getItem('Activated_Teacher')).teacher_name : 'Unknown Teacher';
        
        upcomingList.forEach(item => {
            const timeStart = item.cls.classtime || '00:00';
            const timeEnd = item.cls.class_endtime || '00:00';
            upContainer.innerHTML += `
                <div class="upcoming-item">
                    <div class="up-left">
                        <div class="up-time">
                            <span class="time-val">${timeStart}</span>
                            <span class="time-val">${timeEnd}</span>
                        </div>
                        <div class="up-info">
                            <h4>${item.cls.name}</h4>
                            <div class="up-info-sub">Teacher: ${teacherName} <span class="up-badge">Upcoming</span></div>
                        </div>
                    </div>
                    <div class="up-price">
                        LKR ${item.fee.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
                    </div>
                </div>
            `;
        });
    }

    document.getElementById('totalDueLabel').textContent = `LKR ${totalDue.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
    document.getElementById('paymentAmountInput').value = totalDue.toFixed(2);
    
    const formAmountDueEl = document.getElementById('formAmountDue');
    if (formAmountDueEl) formAmountDueEl.textContent = `LKR ${totalDue.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
    
    const formDueDateEl = document.getElementById('formDueDate');
    if (formDueDateEl) formDueDateEl.textContent = getLocalDateString();
}

window.processPayment = async function() {
    if (!currentStudent) return;
    
    const input = document.getElementById('paymentAmountInput');
    let paymentAmount = parseFloat(input.value);
    
    if (isNaN(paymentAmount) || paymentAmount <= 0) {
        showToast('warning', 'Invalid Amount', 'Please enter a valid payment amount greater than 0.');
        return;
    }

    const btn = document.getElementById('processPaymentBtn');
    btn.disabled = true;
    btn.textContent = 'Processing...';

    const payloads = [];
    const now = new Date().toISOString();
    let remainingAmount = paymentAmount;

    // 1. Allocate to outstanding fees first (oldest first)
    for (const item of outstandingList) {
        if (remainingAmount <= 0) break;
        
        let amountToApply = Math.min(remainingAmount, item.fee);
        
        payloads.push({
            student_id: String(currentStudent.id),
            class_id: String(item.cls.id),
            teacher_id: String(getActivatedId()),
            attendance_id: item.attendance.id,
            amount: amountToApply,
            payment_date: item.attendance.attendance_date,
            payment_type: 'Cash',
            status: amountToApply >= item.fee ? 'Paid' : 'Partial',
            created: now,
            updated: now
        });
        
        remainingAmount -= amountToApply;
    }

    // 2. Allocate remaining amount to upcoming classes
    if (remainingAmount > 0) {
        for (const item of upcomingList) {
            if (remainingAmount <= 0) break;
            
            let amountToApply = Math.min(remainingAmount, item.fee);
            
            payloads.push({
                student_id: String(currentStudent.id),
                class_id: String(item.cls.id),
                teacher_id: String(getActivatedId()),
                attendance_id: '', // Pre-paying for future attendance
                amount: amountToApply,
                payment_date: getLocalDateString(), // Paid today
                payment_type: 'Cash',
                status: amountToApply >= item.fee ? 'Paid' : 'Partial',
                created: now,
                updated: now
            });
            
            remainingAmount -= amountToApply;
        }
    }

    if (remainingAmount > 0) {
        // Still has remaining balance (overpaid) - create a credit record or just record it as unallocated payment
        payloads.push({
            student_id: String(currentStudent.id),
            class_id: '', // Unallocated
            teacher_id: String(getActivatedId()),
            attendance_id: '',
            amount: remainingAmount,
            payment_date: getLocalDateString(),
            payment_type: 'Cash',
            status: 'Overpayment / Credit',
            created: now,
            updated: now
        });
    }

    try {
        // Send all payloads to the API
        for (const payload of payloads) {
            await fetch(PAYMENTS_API, {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    'x-api-key': X_API_KEY
                },
                body: JSON.stringify(payload)
            });
        }

        showToast('success', 'Payment Successful', `Successfully processed LKR ${paymentAmount.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}.`);
        sendPaymentSMS(currentStudent, paymentAmount, getLocalDateString());
        
        // Broadcast payment update to other open windows
        localStorage.setItem('payment_updated', Date.now().toString());
        
        // Reload data
        await loadStudentProfile(currentStudent);

    } catch (err) {
        console.error('Payment processing failed', err);
        showToast('danger', 'Error', 'Failed to save some or all payment records.');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Process Payment';
    }
};

function focusNfcField() {
    const input = document.getElementById('nfc-number');
    if (input) input.focus();
}

window.addEventListener('DOMContentLoaded', () => {
    document.addEventListener('click', (e) => {
        if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'BUTTON') {
            focusNfcField();
        }
    });
    
    const nfcInput = document.getElementById('nfc-number');
    if (nfcInput) {
        nfcInput.addEventListener('blur', () => { 
            setTimeout(() => {
                if (document.activeElement && document.activeElement.tagName === 'INPUT') return;
                focusNfcField(); 
            }, 150); 
        });
        nfcInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const cardNo = nfcInput.value.trim();
                nfcInput.value = '';
                
                if (cardNo) {
                    const student = allStudents.find(s => s.nfc_number && s.nfc_number.trim() === cardNo);
                    if (student) {
                        loadStudentProfile(student);
                    } else {
                        showToast('danger', 'Unrecognized Card', 'This card is not registered to any student.');
                    }
                }
            }
        });
    }

    loadInitialData();
});
