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
        
        if (studentId) {
            const student = allStudents.find(s => String(s.id) === String(studentId));
            if (student) {
                await loadStudentProfile(student);
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

async function loadStudentProfile(student) {
    currentStudent = student;
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
    upcomingList = [];
    const today = getLocalDateString();
    
    // Process Upcoming
    allEnrollments.forEach(enr => {
        const cls = allClasses.find(c => String(c.id) === String(enr.class_id));
        if (cls) {
            upcomingList.push({
                type: 'upcoming',
                cls: cls,
                fee: parseFloat(cls.fee_amount || 0),
                date: 'Upcoming / Scheduled'
            });
        }
    });
}

function renderPaymentUI() {
    document.getElementById('view-payment').style.display = 'flex';
    
    const photo = currentStudent.student_photo || './assets/img/student-blank-image.jpg';
    document.getElementById('studentPhoto').style.backgroundImage = `url('${photo}')`;
    document.getElementById('studentName').textContent = currentStudent.student_name || 'Unknown Name';
    document.getElementById('studentIdCode').textContent = `ID: ${currentStudent.student_id || 'N/A'}`;
    
    const parentNameEl = document.getElementById('parentName');
    if (parentNameEl) parentNameEl.textContent = currentStudent.parent_name || 'N/A';
    
    const phoneEl = document.getElementById('studentPhone');
    if (phoneEl) phoneEl.textContent = currentStudent.parent_contact || currentStudent.student_contact || 'N/A';

    // Render Upcoming in Main Area
    const mainContainer = document.getElementById('upcomingClassesListMain');
    mainContainer.innerHTML = '';
    
    if (upcomingList.length === 0) {
        mainContainer.innerHTML = `<div class="empty-state">No upcoming class fees required right now.</div>`;
    } else {
        let teacherName = 'Unknown Teacher';
        const activatedDataStr = localStorage.getItem('Activated_Teacher');
        if (activatedDataStr) {
            try {
                const stored = JSON.parse(activatedDataStr);
                teacherName = stored.teacher_name || stored.name || stored.teacherName || 'Unknown Teacher';
            } catch(e) {}
        }
        
        upcomingList.forEach(item => {
            const timeStart = item.cls.classtime || '00:00';
            const timeEnd = item.cls.class_endtime || '00:00';
            
            mainContainer.innerHTML += `
                <div class="outstanding-item" style="border-color: #e0e7ff; background: #fafbff; flex-direction: row; align-items: center; gap: 16px; transition: opacity 0.2s;">
                    <div>
                        <input type="checkbox" class="upcoming-checkbox" data-class-id="${item.cls.id}" data-fee="${item.fee}" checked onchange="updateUpcomingSelection()" style="width: 20px; height: 20px; cursor: pointer;">
                    </div>
                    <div style="flex: 1;">
                        <div class="out-top" style="margin-bottom: 8px;">
                            <h4 style="color: #4f46e5; margin: 0; font-size: 16px;">${item.cls.name}</h4>
                            <div class="out-amount" style="color: #1e293b; display: flex; align-items: center;">
                                <span class="calc-text" style="font-size: 13px; color: #64748b; font-weight: 500; margin-right: 8px;">LKR ${item.fee} x 1 day =</span>
                                <span class="total-text" style="font-size: 18px; font-weight: 700;">LKR ${item.fee.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                            </div>
                        </div>
                        <div class="out-dotted-divider" style="border-top: 1px dashed #c7d2fe; margin-bottom: 8px;"></div>
                        <div class="out-details" style="display: flex; justify-content: space-between; align-items: center; padding: 0;">
                            <div style="display: flex; gap: 24px;">
                                <div class="out-detail-col">
                                    <div style="font-size: 11px; color: #94a3b8; margin-bottom: 2px;">Teacher</div>
                                    <div style="font-size: 12px; color: #475569; display: flex; align-items: center; gap: 4px;">
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg> 
                                        ${teacherName}
                                    </div>
                                </div>
                                <div class="out-detail-col">
                                    <div style="font-size: 11px; color: #94a3b8; margin-bottom: 2px;">Time</div>
                                    <div style="font-size: 12px; color: #475569; display: flex; align-items: center; gap: 4px;">
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg> 
                                        ${timeStart} - ${timeEnd}
                                    </div>
                                </div>
                            </div>
                            
                            <div class="up-weeks-counter" style="margin-right: 0;">
                                <button class="week-btn" onclick="changeDayCount(this, -1)">-</button>
                                <span class="week-count" data-days="1" style="min-width: 50px; text-align: center;">1 Day</span>
                                <button class="week-btn" onclick="changeDayCount(this, 1)">+</button>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        });
    }

    // Call update to calculate total
    updateUpcomingSelection();
    
    const formDueDateEl = document.getElementById('formDueDate');
    if (formDueDateEl) formDueDateEl.textContent = getLocalDateString();
}

window.changeDayCount = function(btn, delta) {
    const container = btn.parentElement;
    const countSpan = container.querySelector('.week-count');
    let currentDays = parseInt(countSpan.getAttribute('data-days')) || 1;
    currentDays += delta;
    if (currentDays < 1) currentDays = 1;
    if (currentDays > 30) currentDays = 30; 
    
    countSpan.setAttribute('data-days', currentDays);
    countSpan.textContent = currentDays + (currentDays === 1 ? ' Day' : ' Days');
    
    const itemDiv = container.closest('.outstanding-item');
    const checkbox = itemDiv.querySelector('.upcoming-checkbox');
    checkbox.checked = true;
    
    updateUpcomingSelection();
};

window.updateUpcomingSelection = function() {
    let totalDue = 0;
    const checkboxes = document.querySelectorAll('.upcoming-checkbox');
    checkboxes.forEach(cb => {
        const itemDiv = cb.closest('.outstanding-item');
        const countSpan = itemDiv.querySelector('.week-count');
        const days = parseInt(countSpan.getAttribute('data-days')) || 1;
        const fee = parseFloat(cb.getAttribute('data-fee')) || 0;
        
        const calcText = itemDiv.querySelector('.calc-text');
        const totalText = itemDiv.querySelector('.total-text');
        
        if (cb.checked) {
            const itemTotal = fee * days;
            totalDue += itemTotal;
            calcText.textContent = `LKR ${fee} x ${days} day${days > 1 ? 's' : ''} =`;
            totalText.textContent = `LKR ${itemTotal.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
            calcText.style.display = 'inline';
            itemDiv.style.opacity = '1';
        } else {
            calcText.style.display = 'none';
            totalText.textContent = `LKR ${fee.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
            itemDiv.style.opacity = '0.5';
        }
    });
    
    document.getElementById('totalDueLabel').textContent = `LKR ${totalDue.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
    document.getElementById('paymentAmountInput').value = totalDue.toFixed(2);
    
    const formAmountDueEl = document.getElementById('formAmountDue');
    if (formAmountDueEl) formAmountDueEl.textContent = `LKR ${totalDue.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
};

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

    const selectedItems = [];
    document.querySelectorAll('.upcoming-checkbox:checked').forEach(cb => {
        const classId = cb.getAttribute('data-class-id');
        const fee = parseFloat(cb.getAttribute('data-fee')) || 0;
        const countSpan = cb.closest('.outstanding-item').querySelector('.week-count');
        const days = parseInt(countSpan.getAttribute('data-days')) || 1;
        selectedItems.push({
            class_id: classId,
            total_fee: fee * days,
            base_fee: fee
        });
    });

    // Allocate to selected upcoming classes
    if (selectedItems.length > 0) {
        for (const item of selectedItems) {
            if (remainingAmount <= 0) break;
            
            let amountToApply = Math.min(remainingAmount, item.total_fee);
            
            payloads.push({
                student_id: String(currentStudent.id),
                class_id: String(item.class_id),
                teacher_id: String(getActivatedId()),
                attendance_id: '', // Pre-paying for future attendance
                amount: amountToApply,
                payment_date: getLocalDateString(), // Paid today
                payment_type: 'Cash',
                status: amountToApply >= item.base_fee ? 'Paid' : 'Partial',
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

    window.initPaymentWindow = function() {
        // called on body load
    };

    loadInitialData();
});
