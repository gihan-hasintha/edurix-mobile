import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, getDocs, query, where, limit } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

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
let allEnrollments = [];
let targetClass = null;
let targetClassId = null;
let currentScannedStudent = null;
let currentAttendanceId = null;
let teacherSettings = null;

// Send Payment SMS via text.lk
async function sendPaymentSMS(student, amount, dateStr) {
    if (!teacherSettings || !teacherSettings.sms_service || !teacherSettings.sms_api || !teacherSettings.sms_senderid) return;
    if (!teacherSettings.payment_sms) return; // Must have payment SMS enabled

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

        if (response.ok) {
            console.log(`Payment SMS sent successfully to ${recipient}`);
        } else {
            console.error('Failed to send Payment SMS:', await response.text());
        }
    } catch (err) {
        console.error('Payment SMS sending error:', err);
    }
}

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

function getLocalDateString() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

window.initPaymentWindow = async function() {
    targetClassId = sessionStorage.getItem('paymentTargetClassId');
    if (!targetClassId) {
        showToast('danger', 'Error', 'No active class session found. Please close this window and try again.');
        return;
    }

    focusNfcField();
    
    document.addEventListener('click', () => { focusNfcField(); });
    
    const nfcInput = document.getElementById('nfc-number');
    if (nfcInput) {
        nfcInput.addEventListener('blur', () => { setTimeout(focusNfcField, 150); });
        nfcInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const cardNo = nfcInput.value.trim();
                nfcInput.value = '';
                
                if (cardNo) {
                    if (currentScannedStudent && currentScannedStudent.nfc_number === cardNo) {
                        // Tapped the same card again, trigger payment
                        markPayment();
                    } else {
                        // Different card or new scan
                        handleNfcScan(cardNo);
                    }
                } else {
                    // Pressed Enter without input (keyboard), trigger payment if pending
                    if (currentScannedStudent) {
                        markPayment();
                    }
                }
            }
        });
    }

    await loadInitialData();

    // Check for auto-load via URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    const autoLoadStudentId = urlParams.get('student_id');
    if (autoLoadStudentId) {
        const student = allStudents.find(s => String(s.id) === String(autoLoadStudentId));
        if (student && student.nfc_number) {
            await handleNfcScan(student.nfc_number);
        }
    }
};

async function loadInitialData() {
    try {
        document.getElementById('loading-window').style.display = 'flex';
        
        const activatedData = localStorage.getItem('Activated_Teacher') || localStorage.getItem('Activated_Institution');
        const stored = activatedData ? JSON.parse(activatedData) : null;
        const teacherId = stored ? (stored.teacher_id || stored.institution_id) : '';

        const [classesRes, studentsRes, enrollmentsRes, teacherRes] = await Promise.all([
            fetch(`${CLASSES_API}?teacher_id=${teacherId}`, { headers: { 'x-api-key': X_API_KEY } }),
            fetch(`${STUDENTS_API}?teacher_id=${teacherId}`, { headers: { 'x-api-key': X_API_KEY } }),
            fetch(`${CLASS_STUDENTS_API}?class_id=${targetClassId}`, { headers: { 'x-api-key': X_API_KEY } }),
            fetch(`${API_URL_BASE}/teachers`, { headers: { 'x-api-key': X_API_KEY } })
        ]);

        if (!classesRes.ok || !studentsRes.ok || !enrollmentsRes.ok || !teacherRes.ok) throw new Error('API fetch failed');

        const classesData = await classesRes.json();
        const studentsData = await studentsRes.json();
        const enrollmentsData = await enrollmentsRes.json();
        const teacherData = await teacherRes.json();
        
        const teachersItems = Array.isArray(teacherData) ? teacherData : (teacherData.items || []);
        teacherSettings = teachersItems.find(t => t.teacher_id === teacherId) || null;

        const classesList = Array.isArray(classesData) ? classesData : (classesData.items || []);
        targetClass = classesList.find(c => String(c.id) === String(targetClassId));
        
        allStudents = Array.isArray(studentsData) ? studentsData : (studentsData.items || []);
        allEnrollments = Array.isArray(enrollmentsData) ? enrollmentsData : (enrollmentsData.items || []);

        if (!targetClass) {
            showToast('danger', 'Class Not Found', 'Could not locate the active class details.');
        }

    } catch (err) {
        console.error(err);
        showToast('danger', 'Loading Error', 'Failed to load initial data from database.');
    } finally {
        document.getElementById('loading-window').style.display = 'none';
    }
}

async function handleNfcScan(nfcCardNumber) {
    if (!targetClass) return;

    // Reset view
    document.getElementById('view-waiting').style.display = 'flex';
    document.getElementById('view-payment').style.display = 'none';
    currentScannedStudent = null;
    currentAttendanceId = null;

    // 1. Find Student
    const student = allStudents.find(s => s.nfc_number && s.nfc_number.trim() === nfcCardNumber);
    if (!student) {
        playSound('error');
        showToast('danger', 'Unrecognized Card', 'This card is not registered to any student.');
        return;
    }

    // 2. Check Enrollment
    const isEnrolled = allEnrollments.some(e => String(e.student_id) === String(student.id) && String(e.class_id) === String(targetClassId));
    if (!isEnrolled) {
        playSound('error');
        showToast('warning', 'Not Enrolled', `${student.student_name} is not enrolled in ${targetClass.name}.`);
        return;
    }

    // 3. Verify Attendance for today
    document.getElementById('loading-window').style.display = 'flex';
    try {
        const collectionName = getAttendanceCollectionName();
        const todayDateStr = getLocalDateString();
        
        const q = query(
            collection(db, collectionName),
            where('class_id', '==', String(targetClassId)),
            where('student_id', '==', String(student.id)),
            where('attendance_date', '==', todayDateStr),
            limit(1)
        );
        
        const [querySnapshot, payRes] = await Promise.all([
            getDocs(q),
            fetch(`${PAYMENTS_API}?student_id=${student.id}&class_id=${targetClassId}&payment_date=${todayDateStr}`, { headers: { 'x-api-key': X_API_KEY } }).catch(err => {
                console.error('Error checking previous payments:', err);
                return null;
            })
        ]);
        
        if (querySnapshot.empty) {
            playSound('error');
            showToast('danger', 'Attendance Missing', `${student.student_name} has not been marked present today.`);
            document.getElementById('loading-window').style.display = 'none';
            return;
        }

        const attendanceDoc = querySnapshot.docs[0];
        const attendanceRecord = attendanceDoc.data();
        if (attendanceRecord.status !== 'Present') {
            playSound('error');
            showToast('danger', 'Attendance Missing', `${student.student_name} has not been marked present today.`);
            document.getElementById('loading-window').style.display = 'none';
            return;
        }

        currentAttendanceId = attendanceDoc.id;

        // 4. Verify no duplicate payment for today
        if (payRes && payRes.ok) {
            const payData = await payRes.json();
            const allPayments = Array.isArray(payData) ? payData : (payData.items || []);
            const alreadyPaid = allPayments.find(p => p.status === 'Paid');

            if (alreadyPaid) {
                playSound('warning');
                showToast('warning', 'Already Paid', `${student.student_name} has already paid the fee for today's class.`);
                document.getElementById('loading-window').style.display = 'none';
                return;
            }
        }

        // Passed all validations
        currentScannedStudent = student;
        displayPaymentView(student, targetClass);
        playSound('success');

    } catch (err) {
        console.error(err);
        showToast('danger', 'Verification Error', 'Could not verify attendance status.');
    } finally {
        document.getElementById('loading-window').style.display = 'none';
    }
}

function displayPaymentView(student, classInfo) {
    const photo = student.student_photo || './assets/img/depositphotos_679927214-stock-illustration-default-avatar-profile-placeholder-abstract.jpg';
    document.getElementById('studentPhoto').style.backgroundImage = `url('${photo}')`;
    document.getElementById('studentName').textContent = student.student_name || 'Unknown Name';
    document.getElementById('studentIdCode').textContent = student.student_id || 'N/A';
    
    document.getElementById('classNameBadge').textContent = classInfo.name || 'N/A';
    
    const feeFormatted = classInfo.fee_amount ? parseFloat(classInfo.fee_amount).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2}) : "0.00";
    document.getElementById('classFeeAmount').textContent = `${feeFormatted} LKR`;

    document.getElementById('view-waiting').style.display = 'none';
    document.getElementById('view-payment').style.display = 'flex';
}

window.markPayment = async function() {
    if (!currentScannedStudent || !targetClass) return;

    const btn = document.getElementById('markPaymentBtn');
    btn.disabled = true;
    btn.textContent = 'Processing...';

    const fee = targetClass.fee_amount ? parseFloat(targetClass.fee_amount) : 0;
    
    // 1. Optimistic UI update: instantly show success and hide payment view
    playSound('success');
    showToast('success', 'Payment Recorded', `Payment of ${fee.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})} LKR collected successfully.`);
    
    document.getElementById('view-waiting').style.display = 'flex';
    document.getElementById('view-payment').style.display = 'none';
    
    // 2. Store variables for network request and reset globals immediately
    const studentIdToPay = String(currentScannedStudent.id);
    const attendanceIdToPay = currentAttendanceId;
    
    currentScannedStudent = null;
    currentAttendanceId = null;
    
    btn.disabled = false;
    btn.textContent = 'Mark Payment';
    focusNfcField();

    // 3. Perform network request in background
    const now = new Date().toISOString();
    const payload = {
        student_id: studentIdToPay,
        class_id: String(targetClass.id),
        teacher_id: String(targetClass.teacher_id),
        attendance_id: attendanceIdToPay,
        amount: fee,
        payment_date: getLocalDateString(),
        payment_type: 'Cash',
        status: 'Paid',
        created: now,
        updated: now
    };

    try {
        const response = await fetch(PAYMENTS_API, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'x-api-key': X_API_KEY
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            throw new Error('Failed to save payment');
        } else {
            const dateStr = getLocalDateString();
            const studentRef = allStudents.find(s => String(s.id) === String(studentIdToPay));
            if (studentRef) sendPaymentSMS(studentRef, fee, dateStr);
        }
    } catch (err) {
        console.error(err);
        showToast('danger', 'Payment Error', 'Failed to sync the payment record to server.');
    }
};
