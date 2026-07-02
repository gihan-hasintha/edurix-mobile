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
const PAYMENTS_API = `${API_URL_BASE}/payments`;
const X_API_KEY = '996de2d470a0f1e9794b7778e216c193258aac001b36813f9ad1d3f957cc7ee7';

let allStudents = [];
let allClasses = [];
let allPayments = [];
let allAttendances = [];
let outstandingRecords = [];

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

function getLocalDateString() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

async function loadData() {
    const teacherId = getActivatedId();
    if (!teacherId) {
        document.getElementById('loader').innerHTML = '<p style="color: red;">Activation required to view data.</p>';
        return;
    }

    try {
        const [classesRes, studentsRes, paymentsRes] = await Promise.all([
            fetch(`${CLASSES_API}?teacher_id=${teacherId}`, { headers: { 'x-api-key': X_API_KEY } }),
            fetch(`${STUDENTS_API}?teacher_id=${teacherId}`, { headers: { 'x-api-key': X_API_KEY } }),
            fetch(`${PAYMENTS_API}?teacher_id=${teacherId}`, { headers: { 'x-api-key': X_API_KEY } })
        ]);

        if (!classesRes.ok || !studentsRes.ok || !paymentsRes.ok) throw new Error('Failed to fetch REST data');

        const classesData = await classesRes.json();
        const studentsData = await studentsRes.json();
        const paymentsData = await paymentsRes.json();

        allClasses = Array.isArray(classesData) ? classesData : (classesData.items || []);
        allStudents = Array.isArray(studentsData) ? studentsData : (studentsData.items || []);
        
        // Filter payments manually since API might not filter well by teacher ID unless all classes belong to teacher
        const classIds = new Set(allClasses.map(c => String(c.id)));
        const allPay = Array.isArray(paymentsData) ? paymentsData : (paymentsData.items || []);
        allPayments = allPay.filter(p => classIds.has(String(p.class_id)));

        // Fetch attendances from Firebase
        const collectionName = getAttendanceCollectionName();
        // We will fetch ALL attendance, or at least recent ones, but since there is no teacher ID on attendance directly,
        // we fetch all and filter by class IDs
        const q = query(collection(db, collectionName));
        const querySnapshot = await getDocs(q);
        
        const attendances = [];
        querySnapshot.forEach(doc => {
            const data = doc.data();
            if (classIds.has(String(data.class_id))) {
                attendances.push({ id: doc.id, ...data });
            }
        });
        allAttendances = attendances;

        processOutstandingFees();
        populateClassFilter();
        renderTable();
        
        document.getElementById('loader').classList.add('hidden');
        document.getElementById('tableContainer').classList.remove('hidden');

    } catch (err) {
        console.error('Data loading error:', err);
        document.getElementById('loader').innerHTML = '<p style="color: red;">Error loading data.</p>';
    }
}

function processOutstandingFees() {
    outstandingRecords = [];
    const today = getLocalDateString();
    
    // An outstanding fee exists if a student has checked IN (regardless of check_out_time)
    // AND there is no corresponding payment record with status 'Paid'
    allAttendances.forEach(att => {
        // Must have at least checked in
        if (!att.check_in_time) return;

        const payRecord = allPayments.find(p => 
            (String(p.attendance_id) === String(att.id) || (String(p.student_id) === String(att.student_id) && String(p.class_id) === String(att.class_id) && p.payment_date === att.attendance_date)) 
            && p.status === 'Paid'
        );
        
        if (!payRecord) {
            const cls = allClasses.find(c => String(c.id) === String(att.class_id));
            const student = allStudents.find(s => String(s.id) === String(att.student_id));
            
            if (cls && student) {
                outstandingRecords.push({
                    attendance: att,
                    cls: cls,
                    student: student,
                    fee: parseFloat(cls.fee_amount || 0),
                    isToday: att.attendance_date === today
                });
            }
        }
    });

    // Sort: today's records first (most urgent), then by date descending
    outstandingRecords.sort((a, b) => {
        if (a.isToday && !b.isToday) return -1;
        if (!a.isToday && b.isToday) return 1;
        return new Date(b.attendance.attendance_date) - new Date(a.attendance.attendance_date);
    });
}

function populateClassFilter() {
    const filter = document.getElementById('classFilter');
    if (!filter) return;
    
    allClasses.forEach(cls => {
        const option = document.createElement('option');
        option.value = cls.id;
        option.textContent = cls.name;
        filter.appendChild(option);
    });
}

function renderTable() {
    const tbody = document.getElementById('outstandingTableBody');
    if (!tbody) return;

    const search = (document.getElementById('studentSearch').value || '').toLowerCase();
    const classFilter = document.getElementById('classFilter').value;

    const filtered = outstandingRecords.filter(rec => {
        const matchesClass = classFilter === 'All' || String(rec.cls.id) === String(classFilter);
        const matchesSearch = (rec.student.student_name && rec.student.student_name.toLowerCase().includes(search)) || 
                              (rec.student.student_id && rec.student.student_id.toLowerCase().includes(search));
        return matchesClass && matchesSearch;
    });

    tbody.innerHTML = '';
    
    let totalOutstanding = 0;

    // Group filtered records by student
    const studentGroups = {};
    filtered.forEach(rec => {
        const sid = String(rec.student.id);
        if (!studentGroups[sid]) {
            studentGroups[sid] = {
                student: rec.student,
                records: [],
                totalOutstanding: 0,
                hasToday: false
            };
        }
        studentGroups[sid].records.push(rec);
        studentGroups[sid].totalOutstanding += rec.fee;
        if (rec.isToday) studentGroups[sid].hasToday = true;
    });

    const groupedList = Object.values(studentGroups);
    // Sort groupedList: if hasToday, it should be at the top, then by total amount descending
    groupedList.sort((a, b) => {
        if (a.hasToday && !b.hasToday) return -1;
        if (!a.hasToday && b.hasToday) return 1;
        return b.totalOutstanding - a.totalOutstanding;
    });

    if (groupedList.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 20px; color: #64748b;">No outstanding fees found.</td></tr>';
    } else {
        groupedList.forEach(group => {
            totalOutstanding += group.totalOutstanding;
            const photo = group.student.student_photo || './assets/img/student-blank-image.jpg';
            const tr = document.createElement('tr');
            
            // Generate classes HTML
            const classNamesSet = new Set();
            const classesHtmlArr = [];
            group.records.forEach(rec => {
                if (!classNamesSet.has(rec.cls.id)) {
                    classNamesSet.add(rec.cls.id);
                    const hasTodayForClass = group.records.some(r => r.cls.id === rec.cls.id && r.isToday);
                    const todayBadge = hasTodayForClass ? `<span style="display:inline-block;background:#dc2626;color:white;font-size:10px;font-weight:700;padding:2px 6px;border-radius:10px;margin-left:6px;vertical-align:middle;">TODAY</span>` : '';
                    classesHtmlArr.push(`<div style="margin-bottom:4px; font-weight: 500; color: #334155; font-size: 12px;">${rec.cls.name}${todayBadge}</div>`);
                }
            });
            const classesHtml = classesHtmlArr.join('');
            const unpaidClassesCount = group.records.length;

            const rowStyle = group.hasToday ? 'background:#fff7f7;' : '';
            tr.setAttribute('style', rowStyle);
            
            let typeColor = group.student.class_type === 'Online' ? '#3b82f6' : (group.student.class_type === 'Both' ? '#8b5cf6' : '#10b981');
            let classTypeHtml = group.student.class_type ? `<span style="background: ${typeColor}20; color: ${typeColor}; padding: 1px 4px; border-radius: 4px; font-size: 10px; font-weight: bold; margin-left: 6px; vertical-align: middle;">${group.student.class_type.toUpperCase()}</span>` : '';
            
            tr.innerHTML = `
                <td>
                    <div class="student-info">
                        <img class="student-photo" src="${photo}" onerror="this.src='./assets/img/student-blank-image.jpg'" alt="${group.student.student_name}">
                        <div class="student-details">
                            <span class="student-name">${group.student.student_name}${classTypeHtml}</span>
                            <span class="student-id">${group.student.student_id || 'N/A'}</span>
                        </div>
                    </div>
                </td>
                <td>${classesHtml}</td>
                <td style="text-align: center;">
                    <span style="background: #fee2e2; color: #ef4444; font-weight: 600; padding: 3px 8px; border-radius: 6px; font-size: 12px;">${unpaidClassesCount}</span>
                </td>
                <td style="font-weight:700;color:#dc2626;font-size:12px;">LKR <br>${group.totalOutstanding.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                <td><span class="badge badge-unpaid">Unpaid</span></td>
                <td style="text-align: right;">
                    <button onclick="window.open('outstanding-payments.html?student_id=${group.student.id}', '_blank', 'width=1200,height=800')" style="background: #dc2626; color: white; border: none; padding: 6px 12px; border-radius: 2px; font-size: 10px; cursor: pointer; font-weight: 500;">PAY</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }

    document.getElementById('totalOutstandingVal').textContent = `LKR ${totalOutstanding.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
    document.getElementById('unpaidClassesCount').textContent = groupedList.length; // Number of unique students with outstanding fees
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('classFilter').addEventListener('change', renderTable);
    document.getElementById('studentSearch').addEventListener('input', renderTable);
    loadData();
});

// Listen for real-time payment updates from other windows
window.addEventListener('storage', (e) => {
    if (e.key === 'payment_updated') {
        loadData();
    }
});
