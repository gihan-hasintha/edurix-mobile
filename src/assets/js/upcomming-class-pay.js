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
    document.getElementById('view-payment').style.display = 'block';
    document.getElementById('bottomSummaryBar').style.display = 'flex';
    
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
            const fmtFee = item.fee.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
            
            mainContainer.innerHTML += `
                <div class="class-item-card">
                    <div class="class-item-top">
                        <div class="class-checkbox-wrap">
                            <input type="checkbox" class="class-checkbox upcoming-checkbox"
                                data-class-id="${item.cls.id}" data-fee="${item.fee}"
                                onchange="updateUpcomingSelection()">
                        </div>
                        <div class="class-title-price">
                            <span class="class-name">${item.cls.name}</span>
                            <div class="class-price-col">
                                <span class="class-calc-text">LKR ${item.fee} &times; 1 day</span>
                                <span class="class-total-price total-text">LKR ${fmtFee}</span>
                            </div>
                        </div>
                    </div>
                    <hr class="class-divider">
                    <div class="class-item-bottom">
                        <div class="class-meta-cols">
                            <div class="class-meta-col">
                                <div class="meta-label">Teacher</div>
                                <div class="meta-value">
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                                    ${teacherName}
                                </div>
                            </div>
                            <div class="class-meta-col">
                                <div class="meta-label">Time</div>
                                <div class="meta-value">
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                                    ${timeStart} - ${timeEnd}
                                </div>
                            </div>
                        </div>
                        <div class="day-counter">
                            <button class="day-counter-btn" onclick="changeDayCount(this, -1)">-</button>
                            <span class="day-counter-display week-count" data-days="1">1 Day</span>
                            <button class="day-counter-btn" onclick="changeDayCount(this, 1)">+</button>
                        </div>
                    </div>
                </div>
            `;
        });
    }

    // Reset select-all button label on re-render
    const selectAllBtn = document.getElementById('selectAllBtn');
    if (selectAllBtn) selectAllBtn.textContent = 'Select All';

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
    
    const itemDiv = container.closest('.class-item-card');
    const checkbox = itemDiv.querySelector('.upcoming-checkbox');
    checkbox.checked = true;
    
    updateUpcomingSelection();
};

window.selectAllClasses = function() {
    const checkboxes = document.querySelectorAll('.upcoming-checkbox');
    const allChecked = Array.from(checkboxes).every(cb => cb.checked);
    // Toggle: if all checked → uncheck all, otherwise check all
    checkboxes.forEach(cb => { cb.checked = !allChecked; });
    // Update button label
    const btn = document.getElementById('selectAllBtn');
    if (btn) btn.textContent = allChecked ? 'Select All' : 'Deselect All';
    updateUpcomingSelection();
};

window.updateUpcomingSelection = function() {
    let totalDue = 0;
    let selectedCount = 0;
    const checkboxes = document.querySelectorAll('.upcoming-checkbox');
    checkboxes.forEach(cb => {
        const itemDiv = cb.closest('.class-item-card');
        const countSpan = itemDiv.querySelector('.week-count');
        const days = parseInt(countSpan.getAttribute('data-days')) || 1;
        const fee = parseFloat(cb.getAttribute('data-fee')) || 0;
        
        const calcTextEl = itemDiv.querySelector('.class-calc-text');
        const totalTextEl = itemDiv.querySelector('.total-text');
        
        if (cb.checked) {
            const itemTotal = fee * days;
            totalDue += itemTotal;
            selectedCount++;
            if (calcTextEl) calcTextEl.textContent = `LKR ${fee} \u00d7 ${days} day${days > 1 ? 's' : ''}`;
            if (totalTextEl) totalTextEl.textContent = `LKR ${itemTotal.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
            itemDiv.classList.remove('deselected');
        } else {
            if (calcTextEl) calcTextEl.textContent = `LKR ${fee} \u00d7 1 day`;
            if (totalTextEl) totalTextEl.textContent = `LKR ${fee.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
            itemDiv.classList.add('deselected');
        }
    });
    
    const fmtTotal = totalDue.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
    document.getElementById('totalDueLabel').textContent = `LKR ${fmtTotal}`;
    document.getElementById('paymentAmountInput').value = totalDue.toFixed(2);
    
    const formAmountDueEl = document.getElementById('formAmountDue');
    if (formAmountDueEl) formAmountDueEl.textContent = `LKR ${fmtTotal}`;

    // Update bottom bar
    const countEl = document.getElementById('selectedCount');
    const totalEl = document.getElementById('bottomTotalAmount');
    if (countEl) countEl.textContent = selectedCount;
    if (totalEl) totalEl.textContent = `LKR ${fmtTotal}`;
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
    btn.innerHTML = 'Processing...';

    const payloads = [];
    const now = new Date().toISOString();
    let remainingAmount = paymentAmount;

    const selectedItems = [];
    document.querySelectorAll('.upcoming-checkbox:checked').forEach(cb => {
        const classId = cb.getAttribute('data-class-id');
        const fee = parseFloat(cb.getAttribute('data-fee')) || 0;
        const countSpan = cb.closest('.class-item-card').querySelector('.week-count');
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
        btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"></rect><line x1="1" y1="10" x2="23" y2="10"></line></svg> Process Payment`;
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
