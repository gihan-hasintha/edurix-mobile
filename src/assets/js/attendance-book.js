import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, getDocs, query, where, orderBy, limit } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

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

const API_URL_BASE = window.api?.env?.API_URL ? window.api.env.API_URL.replace('/students', '') : 'http://72.60.210.102:3595';
const STUDENTS_API = window.api?.env?.API_URL || `${API_URL_BASE}/students`;
const CLASSES_API = `${API_URL_BASE}/classes`;
const CLASS_STUDENTS_API = `${API_URL_BASE}/class_students`;
const PAYMENTS_API = `${API_URL_BASE}/payments`;
const X_API_KEY = '996de2d470a0f1e9794b7778e216c193258aac001b36813f9ad1d3f957cc7ee7';

let allStudents = [];
let allClasses = [];
let allEnrollments = [];
let selectedStudent = null;
let currentStudentAttendance = [];
let currentStudentPayments = [];

function getAttendanceCollectionName() {
    const activatedData = localStorage.getItem('Activated_Teacher') || localStorage.getItem('Activated_Institution');
    if (activatedData) {
        try {
            const stored = JSON.parse(activatedData);
            const region = stored.region || stored.province_region || stored.province || 'WP';
            return `attendance_${region.toLowerCase()}`;
        } catch (e) { }
    }
    return 'attendance_wp';
}

function showLoader() {
    document.getElementById('loading-window').style.display = 'flex';
}

function hideLoader() {
    document.getElementById('loading-window').style.display = 'none';
}

async function initData() {
    showLoader();
    const activatedData = localStorage.getItem('Activated_Teacher') || localStorage.getItem('Activated_Institution');
    if (!activatedData) {
        hideLoader();
        alert('Please activate your account first.');
        return;
    }

    const stored = JSON.parse(activatedData);
    const teacherId = stored.teacher_id || stored.institution_id;

    try {
        const studentListContainer = document.getElementById('studentListContainer');
        studentListContainer.innerHTML = '<div class="spinner"></div>';
        
        const [studentsRes, classesRes, enrollmentsRes] = await Promise.all([
            fetch(`${STUDENTS_API}?teacher_id=${teacherId}`, { headers: { 'x-api-key': X_API_KEY } }),
            fetch(`${CLASSES_API}?teacher_id=${teacherId}`, { headers: { 'x-api-key': X_API_KEY } }),
            fetch(CLASS_STUDENTS_API, { headers: { 'x-api-key': X_API_KEY } })
        ]);

        const studentsData = await studentsRes.json();
        const classesData = await classesRes.json();
        const enrollmentsData = await enrollmentsRes.json();

        allStudents = Array.isArray(studentsData) ? studentsData : (studentsData.items || []);
        allClasses = Array.isArray(classesData) ? classesData : (classesData.items || []);
        allEnrollments = Array.isArray(enrollmentsData) ? enrollmentsData : (enrollmentsData.items || []);
        
        allStudents = allStudents.filter(s => s.teacher_id === teacherId);
        allClasses = allClasses.filter(c => c.teacher_id === teacherId);

        // Fetch all attendance for this teacher's classes to pre-calculate absences
        const classIds = allClasses.map(c => String(c.id));
        let allTeacherAttendance = [];
        try {
            const collectionName = getAttendanceCollectionName();
            for (let i = 0; i < classIds.length; i += 10) {
                const chunk = classIds.slice(i, i + 10);
                if (chunk.length > 0) {
                    const q = query(collection(db, collectionName), where('class_id', 'in', chunk));
                    const snap = await getDocs(q);
                    snap.forEach(doc => allTeacherAttendance.push({ id: doc.id, ...doc.data() }));
                }
            }
        } catch (attErr) {
            console.error("Error pre-fetching attendance:", attErr);
        }

        // Pre-calculate consecutive absences for all students
        allStudents.forEach(s => {
            s.consecutive_absent_count = calculateConsecutiveAbsences(s, allTeacherAttendance);
        });

        // Populate class filter select
        const classFilterSelect = document.getElementById('filterClassSelect');
        allClasses.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c.id;
            opt.textContent = c.name;
            classFilterSelect.appendChild(opt);
        });

        applyStudentFilters();
        
        document.getElementById('studentSearchInput').addEventListener('input', applyStudentFilters);

        // Filter Modal Events
        document.getElementById('openStudentFilterBtn').addEventListener('click', () => {
            document.getElementById('studentFilterModal').style.display = 'flex';
        });
        document.getElementById('closeStudentFilterBtn').addEventListener('click', () => {
            document.getElementById('studentFilterModal').style.display = 'none';
        });
        document.getElementById('applyStudentFiltersBtn').addEventListener('click', () => {
            applyStudentFilters();
            document.getElementById('studentFilterModal').style.display = 'none';
        });
        document.getElementById('resetStudentFiltersBtn').addEventListener('click', () => {
            document.getElementById('studentSearchInput').value = '';
            document.getElementById('filterFreeCard').checked = false;
            document.getElementById('filterClassSelect').value = 'All';
            document.getElementById('filterAbsentCount').value = '';
            document.getElementById('filterSortSelect').value = 'name_asc';
            applyStudentFilters();
            document.getElementById('studentFilterModal').style.display = 'none';
        });

        const monthInput = document.getElementById('bookMonthFilter');
        const now = new Date();
        monthInput.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        
        monthInput.addEventListener('change', renderLedger);
        document.getElementById('bookClassFilter').addEventListener('change', renderLedger);
        // Settings Dropdown Logic
        const settingsBtn = document.getElementById('settingsDropdownBtn');
        const settingsMenu = document.getElementById('settingsDropdownMenu');
        if (settingsBtn && settingsMenu) {
            settingsBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                // Initially style.display is empty, so checking !== 'block' ensures it opens on the very first click
                settingsMenu.style.display = (settingsMenu.style.display !== 'block') ? 'block' : 'none';
            });
            document.addEventListener('click', (e) => {
                if (!settingsMenu.contains(e.target)) {
                    settingsMenu.style.display = 'none';
                }
            });
        }

        document.getElementById('bookUpcomingFilter').addEventListener('change', renderLedger);
        document.getElementById('bookAttendanceFilter').addEventListener('change', renderLedger);
        document.getElementById('bookPaymentFilter').addEventListener('change', renderLedger);
        document.getElementById('navbarViewModeToggle').addEventListener('change', renderLedger);
        document.getElementById('navbarShowChartsToggle').addEventListener('change', renderLedger);
        
        document.getElementById('navbarAbsenceWarningToggle').addEventListener('change', () => {
            applyStudentFilters(); // Update sidebar list warnings
            if (selectedStudent) {
                const absences = selectedStudent.consecutive_absent_count || 0;
                const banner = document.getElementById('consecutiveAbsenceBanner');
                if (document.getElementById('navbarAbsenceWarningToggle').checked && absences >= 3) {
                    banner.style.display = 'flex';
                    document.getElementById('consecutiveAbsenceText').textContent = `Warning: This student has missed ${absences} consecutive classes.`;
                } else {
                    banner.style.display = 'none';
                }
            }
        });

    } catch (err) {
        console.error('Initialization error:', err);
    } finally {
        hideLoader();
    }
}

function applyStudentFilters() {
    let filtered = [...allStudents];
    
    // 1. Search Term
    const term = document.getElementById('studentSearchInput').value.toLowerCase();
    if (term) {
        filtered = filtered.filter(s => 
            (s.student_name && s.student_name.toLowerCase().includes(term)) ||
            (s.student_id && s.student_id.toLowerCase().includes(term)) ||
            (s.parent_phone_number && s.parent_phone_number.includes(term)) ||
            (s.phone_number && s.phone_number.includes(term)) ||
            (s.student_phone_number && s.student_phone_number.includes(term))
        );
    }

    // 2. Free Card Only
    const freeCardOnly = document.getElementById('filterFreeCard').checked;
    if (freeCardOnly) {
        filtered = filtered.filter(s => s.free_card === true || s.free_card === 'true' || s.is_free_card === true || s.is_free_card === 'true');
    }

    // 3. Class Filter
    const classId = document.getElementById('filterClassSelect').value;
    if (classId !== 'All') {
        const studentIdsInClass = allEnrollments.filter(e => String(e.class_id) === String(classId)).map(e => String(e.student_id));
        filtered = filtered.filter(s => studentIdsInClass.includes(String(s.id)));
    }

    // 4. Sort
    const sortVal = document.getElementById('filterSortSelect').value;
    if (sortVal === 'name_asc') {
        filtered.sort((a, b) => (a.student_name || '').localeCompare(b.student_name || ''));
    } else if (sortVal === 'name_desc') {
        filtered.sort((a, b) => (b.student_name || '').localeCompare(a.student_name || ''));
    } else if (sortVal === 'date_desc') {
        filtered.sort((a, b) => new Date(b.joined_date || b.created_at || 0) - new Date(a.joined_date || a.created_at || 0));
    } else if (sortVal === 'date_asc') {
        filtered.sort((a, b) => new Date(a.joined_date || a.created_at || 0) - new Date(b.joined_date || b.created_at || 0));
    }

    // 5. Top Absent Students
    const absentCountVal = document.getElementById('filterAbsentCount').value;
    if (absentCountVal && parseInt(absentCountVal) > 0) {
        // We assume the backend can send absent_count, otherwise this falls back gracefully
        filtered.sort((a, b) => (b.absent_count || 0) - (a.absent_count || 0));
        filtered = filtered.slice(0, parseInt(absentCountVal));
    }

    renderStudentList(filtered);
}

function renderStudentList(students) {
    const container = document.getElementById('studentListContainer');
    container.innerHTML = '';
    
    if (students.length === 0) {
        container.innerHTML = `<div class="empty-state"><p>No students found</p></div>`;
        return;
    }

    students.forEach(s => {
        const consecutiveAbsences = s.consecutive_absent_count || 0;
        const isWarningEnabled = document.getElementById('navbarAbsenceWarningToggle').checked;
        const hasWarning = isWarningEnabled && consecutiveAbsences >= 3;

        const div = document.createElement('div');
        div.className = `student-item ${selectedStudent && selectedStudent.id === s.id ? 'active' : ''} ${hasWarning ? 'warning-state' : ''}`;
        
        const photo = s.student_photo || './assets/img/student-blank-image.jpg';
        
        let warningIcon = '';
        if (hasWarning) {
            warningIcon = `<svg class="warning-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" title="3+ Consecutive Absences"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`;
        }
        
        let typeColor = s.class_type === 'Online' ? '#3b82f6' : (s.class_type === 'Both' ? '#8b5cf6' : '#10b981');
        let classTypeHtml = s.class_type ? `<span style="background: ${typeColor}20; color: ${typeColor}; padding: 1px 4px; border-radius: 4px; font-size: 10px; font-weight: bold; margin-left: 6px; vertical-align: middle;">${s.class_type.toUpperCase()}</span>` : '';
        
        div.innerHTML = `
            <div class="student-item-photo" style="background-image: url('${photo}'), url('./assets/img/student-blank-image.jpg');"></div>
            <div class="student-item-details">
                <div class="student-item-name" style="display:flex; align-items:center;">${s.student_name} ${classTypeHtml} ${warningIcon}</div>
                <div class="student-item-id">${s.student_id || 'No ID'}</div>
            </div>
        `;
        
        div.onclick = () => selectStudent(s);
        container.appendChild(div);
    });
}

async function selectStudent(student) {
    selectedStudent = student;
    applyStudentFilters(); // re-render to set active class while keeping current filters and sorting

    document.getElementById('bookPlaceholder').style.display = 'none';
    document.getElementById('bookContent').style.display = 'flex';

    let typeColor = student.class_type === 'Online' ? '#3b82f6' : (student.class_type === 'Both' ? '#8b5cf6' : '#10b981');
    let classTypeHtml = student.class_type ? `<span style="background: ${typeColor}20; color: ${typeColor}; padding: 1px 4px; border-radius: 4px; font-size: 10px; font-weight: bold; margin-left: 6px; vertical-align: middle;">${student.class_type.toUpperCase()}</span>` : '';
    document.getElementById('bookStudentName').innerHTML = student.student_name + classTypeHtml;
    document.getElementById('bookStudentId').textContent = student.student_id || 'N/A';
    
    const phoneEl = document.getElementById('bookStudentPhone');
    phoneEl.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg> ${student.parent_phone_number || 'N/A'}`;
    
    const parentEl = document.getElementById('bookStudentParent');
    parentEl.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg> ${student.parent_name || 'N/A'}`;
    
    const personalPhoneEl = document.getElementById('bookStudentPersonalPhone');
    const pPhone = student.student_phone_number || student.phone_number || student.phone;
    if (pPhone) {
        personalPhoneEl.style.display = 'flex';
        personalPhoneEl.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"></rect><line x1="12" y1="18" x2="12.01" y2="18"></line></svg> ${pPhone}`;
    } else {
        personalPhoneEl.style.display = 'none';
    }

    const emailEl = document.getElementById('bookStudentEmail');
    const email = student.student_email || student.email;
    if (email) {
        emailEl.style.display = 'flex';
        emailEl.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg> ${email}`;
    } else {
        emailEl.style.display = 'none';
    }

    const addressEl = document.getElementById('bookStudentAddress');
    if (student.address) {
        addressEl.style.display = 'flex';
        addressEl.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg> ${student.address}`;
    } else {
        addressEl.style.display = 'none';
    }

    const birthdayEl = document.getElementById('bookStudentBirthday');
    const birthday = student.birthday || student.dob || student.date_of_birth;
    if (birthday) {
        birthdayEl.style.display = 'flex';
        birthdayEl.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-8a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8"></path><path d="M4 16s.5-1 2-1 2.5 2 4 2 2.5-2 4-2 2.5 2 4 2 2-1 2-1"></path><path d="M2 21h20"></path><path d="M7 8v3"></path><path d="M12 8v3"></path><path d="M17 8v3"></path><path d="M7 4h.01"></path><path d="M12 4h.01"></path><path d="M17 4h.01"></path></svg> ${birthday.split('T')[0]}`;
    } else {
        birthdayEl.style.display = 'none';
    }

    const joinedDateEl = document.getElementById('bookStudentJoinedDate');
    const joinedDate = student.joined_date || student.created_at || student.registration_date;
    if (joinedDate) {
        joinedDateEl.style.display = 'flex';
        joinedDateEl.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg> Joined: ${joinedDate.split('T')[0]}`;
    } else {
        joinedDateEl.style.display = 'none';
    }

    const freeCardEl = document.getElementById('bookStudentFreeCard');
    const isFreeCard = student.free_card === true || student.free_card === 'true' || student.is_free_card === true || student.is_free_card === 'true';
    if (isFreeCard) {
        freeCardEl.style.display = 'flex';
    } else {
        freeCardEl.style.display = 'none';
    }

    document.getElementById('bookStudentPhoto').style.backgroundImage = `url('${student.student_photo || './assets/img/student-blank-image.jpg'}'), url('./assets/img/student-blank-image.jpg')`;

    // Get enrolled classes
    const enrolledClassIds = allEnrollments.filter(e => String(e.student_id) === String(student.id)).map(e => String(e.class_id));
    const enrolledClasses = allClasses.filter(c => enrolledClassIds.includes(String(c.id)));
    
    const classFilter = document.getElementById('bookClassFilter');
    classFilter.innerHTML = '<option value="All">All Enrolled Classes</option>';
    enrolledClasses.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = c.name;
        classFilter.appendChild(opt);
    });

    await fetchStudentRecords(student.id, enrolledClassIds);
}

async function fetchStudentRecords(studentId, classIds) {
    const tbody = document.getElementById('ledgerTableBody');
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 40px;"><div class="spinner"></div></td></tr>';
    
    showLoader();
    try {
        const collectionName = getAttendanceCollectionName();
        
        // Fetch Attendance (Firebase)
        const q = query(
            collection(db, collectionName),
            where('student_id', '==', String(studentId))
        );
        const snapshot = await getDocs(q);
        let attRecords = [];
        snapshot.forEach(doc => {
            attRecords.push({ id: doc.id, ...doc.data() });
        });
        currentStudentAttendance = attRecords;

        // Fetch Payments
        const payRes = await fetch(`${PAYMENTS_API}?student_id=${studentId}`, { headers: { 'x-api-key': X_API_KEY } });
        if (payRes.ok) {
            const payData = await payRes.json();
            currentStudentPayments = Array.isArray(payData) ? payData : (payData.items || []);
        } else {
            currentStudentPayments = [];
        }

        // Calculate consecutive absences
        const absences = calculateConsecutiveAbsences(selectedStudent);
        selectedStudent.consecutive_absent_count = absences;
        
        // Re-render sidebar to apply warning flag if needed
        applyStudentFilters();

        // Update the right panel warning banner
        const banner = document.getElementById('consecutiveAbsenceBanner');
        const bannerText = document.getElementById('consecutiveAbsenceText');
        const isWarningEnabled = document.getElementById('navbarAbsenceWarningToggle').checked;
        if (isWarningEnabled && absences >= 3) {
            banner.style.display = 'flex';
            bannerText.textContent = `Warning: This student has missed ${absences} consecutive classes.`;
        } else {
            banner.style.display = 'none';
        }

        renderLedger();

    } catch (e) {
        console.error("Error fetching records", e);
    } finally {
        hideLoader();
    }
}

function calculateConsecutiveAbsences(student, attendanceRecords = currentStudentAttendance) {
    if (!student) return 0;
    const todayStr = getLocalDateString();
    
    // Get all enrolled classes
    const enrolledClassIds = allEnrollments.filter(e => String(e.student_id) === String(student.id)).map(e => String(e.class_id));
    const enrolledClasses = allClasses.filter(c => enrolledClassIds.includes(String(c.id)));
    
    // Collect all past class dates (look back up to 60 days)
    let allPastDates = [];
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 60);
    cutoffDate.setHours(0, 0, 0, 0); // Safe boundary
    const endDate = new Date();
    endDate.setHours(23, 59, 59, 999);
    
    enrolledClasses.forEach(c => {
        if (c.classdate) {
            const targetDay = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"].indexOf(c.classdate.trim().toLowerCase());
            if (targetDay !== -1) {
                let d = new Date(cutoffDate);
                while (d <= endDate) {
                    if (d.getDay() === targetDay) {
                        const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                        if (dateStr <= todayStr) {
                            allPastDates.push({ date: dateStr, class_id: String(c.id), isPresent: false });
                        }
                    }
                    d.setDate(d.getDate() + 1);
                }
            }
        }
    });
    
    // Filter attendance just for this student
    let studentAtt = attendanceRecords;
    if (attendanceRecords !== currentStudentAttendance) {
        studentAtt = attendanceRecords.filter(a => 
            String(a.student_id) === String(student.id) || 
            String(a.studentId) === String(student.id) || 
            String(a.Student_ID) === String(student.id)
        );
    }
    
    // Mark present based on the attendance records
    studentAtt.forEach(att => {
        if (att.attendance_date && att.attendance_date <= todayStr) {
            const match = allPastDates.find(d => d.date === att.attendance_date && d.class_id === String(att.class_id));
            if (match) {
                match.isPresent = true;
            } else {
                allPastDates.push({ date: att.attendance_date, class_id: String(att.class_id), isPresent: true });
            }
        }
    });
    
    // Sort descending by string date
    allPastDates.sort((a, b) => b.date.localeCompare(a.date));
    
    let consecutive = 0;
    for (let r of allPastDates) {
        if (!r.isPresent) {
            consecutive++;
        } else {
            break;
        }
    }
    
    return consecutive;
}

function getLocalDateString() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function renderLedger() {
    const tbody = document.getElementById('ledgerTableBody');
    tbody.innerHTML = '';
    
    if (!selectedStudent) return;

    const classIdFilter = document.getElementById('bookClassFilter').value;
    const monthFilter = document.getElementById('bookMonthFilter').value; // YYYY-MM
    
    // Create a combined list of dates
    const datesMap = new Map();

    const enrolledClassIds = allEnrollments.filter(e => String(e.student_id) === String(selectedStudent.id)).map(e => String(e.class_id));
    const enrolledClasses = allClasses.filter(c => enrolledClassIds.includes(String(c.id)));

    // Pre-populate with generated dates for the selected month based on class schedule
    if (monthFilter) {
        enrolledClasses.forEach(c => {
            if (classIdFilter !== 'All' && String(c.id) !== String(classIdFilter)) return;
            
            if (c.classdate) {
                const targetDay = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"].indexOf(c.classdate.trim().toLowerCase());
                if (targetDay !== -1) {
                    const [yyyy, mm] = monthFilter.split('-');
                    const year = parseInt(yyyy, 10);
                    const month = parseInt(mm, 10) - 1;
                    const daysInMonth = new Date(year, month + 1, 0).getDate();

                    for (let i = 1; i <= daysInMonth; i++) {
                        const d = new Date(year, month, i);
                        if (d.getDay() === targetDay) {
                            const dStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
                            const key = `${dStr}_${c.id}`;
                            datesMap.set(key, {
                                date: dStr,
                                class_id: c.id,
                                check_in: '-',
                                check_out: '-',
                                isPresent: false,
                                payment: null
                            });
                        }
                    }
                }
            }
        });
    }

    currentStudentAttendance.forEach(att => {
        if (!att.attendance_date) return;
        if (monthFilter && !att.attendance_date.startsWith(monthFilter)) return;
        if (classIdFilter !== 'All' && String(att.class_id) !== String(classIdFilter)) return;

        const key = `${att.attendance_date}_${att.class_id}`;
        if (!datesMap.has(key)) {
            datesMap.set(key, {
                date: att.attendance_date,
                class_id: att.class_id,
                check_in: att.check_in_time,
                check_out: att.check_out_time,
                attendance_id: att.id,
                isPresent: true,
                payment: null
            });
        } else {
            const entry = datesMap.get(key);
            entry.check_in = att.check_in_time;
            entry.check_out = att.check_out_time;
            entry.attendance_id = att.id;
            entry.isPresent = true;
        }
    });

    currentStudentPayments.forEach(pay => {
        if (!pay.payment_date) return;
        if (monthFilter && !pay.payment_date.startsWith(monthFilter)) return;
        if (classIdFilter !== 'All' && String(pay.class_id) !== String(classIdFilter)) return;

        const key = `${pay.payment_date}_${pay.class_id}`;
        if (datesMap.has(key)) {
            datesMap.get(key).payment = pay;
        } else {
            datesMap.set(key, {
                date: pay.payment_date,
                class_id: pay.class_id,
                check_in: '-',
                check_out: '-',
                isPresent: false,
                payment: pay
            });
        }
    });

    const rows = Array.from(datesMap.values()).sort((a, b) => new Date(b.date) - new Date(a.date));

    const todayStr = getLocalDateString();
    const upcomingFilter = document.getElementById('bookUpcomingFilter').value;
    const attendanceFilter = document.getElementById('bookAttendanceFilter').value;
    const paymentFilter = document.getElementById('bookPaymentFilter').value;

    const filteredRows = rows.filter(r => {
        if (r.date > todayStr && upcomingFilter === 'hide') {
            return false; // Skip future dates
        }

        const isPaid = r.payment && r.payment.status === 'Paid';
        const isPresent = r.isPresent;

        if (attendanceFilter !== 'All') {
            if (attendanceFilter === 'Present' && !isPresent) return false;
            if (attendanceFilter === 'Absent' && isPresent) return false;
        }

        if (paymentFilter !== 'All') {
            if (paymentFilter === 'Paid' && !isPaid) return false;
            if (paymentFilter === 'Unpaid' && isPaid) return false;
        }

        return true;
    });

    const isCalendarMode = document.getElementById('navbarViewModeToggle').checked;
    const tableContainer = document.getElementById('ledgerTableContainer');
    const calendarContainer = document.getElementById('ledgerCalendarContainer');

    if (!isCalendarMode) {
        tableContainer.style.display = 'block';
        calendarContainer.style.display = 'none';
        
        if (filteredRows.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 20px; color:#94a3b8;">No records found for the selected filters.</td></tr>`;
            return;
        }

        filteredRows.forEach(r => {
            const cls = allClasses.find(c => String(c.id) === String(r.class_id));
            const className = cls ? cls.name : 'Unknown Class';
            
            const isPaid = r.payment && r.payment.status === 'Paid';
            const isPresent = r.isPresent;

            let attendanceBadgeHtml = '';
            if (r.date > todayStr) {
                attendanceBadgeHtml = `<span class="status-badge" style="background: #e0e7ff; color: #4338ca;">Upcoming</span>`;
            } else {
                attendanceBadgeHtml = `<span class="status-badge ${isPresent ? 'status-present' : 'status-absent'}">${isPresent ? 'Present' : 'Absent'}</span>`;
            }

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${r.date}</td>
                <td><strong>${className}</strong></td>
                <td>${r.check_in || '-'}</td>
                <td>${r.check_out || '-'}</td>
                <td>${attendanceBadgeHtml}</td>
                <td><span class="status-badge ${isPaid ? 'status-paid' : 'status-unpaid'}">${isPaid ? 'Paid' : 'Unpaid'}</span></td>
            `;
            tbody.appendChild(tr);
        });
    } else {
        tableContainer.style.display = 'none';
        calendarContainer.style.display = 'block';
        
        calendarContainer.innerHTML = '';
        if (filteredRows.length === 0) {
            calendarContainer.innerHTML = `<div style="text-align:center; padding: 20px; color:#94a3b8;">No records found for the selected filters.</div>`;
            return;
        }

        const [yyyy, mm] = monthFilter ? monthFilter.split('-') : [new Date().getFullYear(), String(new Date().getMonth() + 1).padStart(2, '0')];
        const year = parseInt(yyyy, 10);
        const month = parseInt(mm, 10) - 1;
        const firstDay = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();

        let calHtml = '<div class="calendar-grid">';
        const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        days.forEach(d => calHtml += `<div class="calendar-day-header">${d}</div>`);

        for (let i = 0; i < firstDay; i++) {
            calHtml += `<div class="calendar-cell empty"></div>`;
        }

        for (let i = 1; i <= daysInMonth; i++) {
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
            const isToday = dateStr === todayStr ? 'today' : '';
            
            const dayEvents = filteredRows.filter(r => r.date === dateStr);
            
            let eventsHtml = '';
            dayEvents.forEach(r => {
                const cls = allClasses.find(c => String(c.id) === String(r.class_id));
                const className = cls ? cls.name : 'Unknown';
                const isPaid = r.payment && r.payment.status === 'Paid';
                const isPresent = r.isPresent;
                let attStatus = r.date > todayStr ? 'Upcoming' : (isPresent ? 'Present' : 'Absent');
                let attColor = r.date > todayStr ? '#6366f1' : (isPresent ? '#10b981' : '#ef4444');
                let payColor = isPaid ? '#10b981' : '#f59e0b';
                
                eventsHtml += `
                    <div class="calendar-event">
                        <div class="ev-title" title="${className}">${className}</div>
                        <div class="ev-status">
                            <span style="color: ${attColor}; font-weight:bold;">${attStatus}</span>
                            <span style="color: ${payColor}; margin-left:auto; font-weight:bold;">${isPaid ? 'Paid' : 'Unpaid'}</span>
                        </div>
                    </div>
                `;
            });

            calHtml += `
                <div class="calendar-cell ${isToday}">
                    <div class="date-num">${i}</div>
                    ${eventsHtml}
                </div>
            `;
        }
        calendarContainer.innerHTML = calHtml;
    }

    renderCharts(rows, filteredRows);
}

let attendanceChartInstance = null;
let paymentChartInstance = null;

function renderCharts(allRows, filteredRows) {
    const isChartsEnabled = document.getElementById('navbarShowChartsToggle').checked;
    const chartsContainer = document.getElementById('studentChartsContainer');
    
    if (!isChartsEnabled) {
        chartsContainer.style.display = 'none';
        return;
    }

    chartsContainer.style.display = 'flex';

    // 1. Bar Chart: Attendance over last 6 months
    const monthCounts = {};
    const today = new Date();
    
    // Initialize last 6 months with 0
    for (let i = 5; i >= 0; i--) {
        const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
        const mKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        monthCounts[mKey] = { present: 0, absent: 0 };
    }

    const pastRows = allRows.filter(r => r.date <= getLocalDateString());
    pastRows.forEach(r => {
        const mKey = r.date.substring(0, 7); // YYYY-MM
        if (monthCounts[mKey]) {
            if (r.isPresent) monthCounts[mKey].present++;
            else monthCounts[mKey].absent++;
        }
    });

    const labels = Object.keys(monthCounts);
    const presentData = labels.map(l => monthCounts[l].present);
    const absentData = labels.map(l => monthCounts[l].absent);

    const ctxBar = document.getElementById('attendanceBarChart').getContext('2d');
    if (attendanceChartInstance) attendanceChartInstance.destroy();
    
    attendanceChartInstance = new Chart(ctxBar, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Present',
                    data: presentData,
                    backgroundColor: '#10b981',
                    borderRadius: 4
                },
                {
                    label: 'Absent',
                    data: absentData,
                    backgroundColor: '#ef4444',
                    borderRadius: 4
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { beginAtZero: true, stacked: true },
                x: { stacked: true }
            },
            plugins: {
                legend: { position: 'bottom' }
            }
        }
    });

    // 2. Pie Chart: Paid vs Unpaid (from filtered rows)
    let paidCount = 0;
    let unpaidCount = 0;

    filteredRows.forEach(r => {
        if (r.date <= getLocalDateString()) {
            if (r.payment && r.payment.status === 'Paid') {
                paidCount++;
            } else {
                unpaidCount++;
            }
        }
    });

    const ctxPie = document.getElementById('paymentPieChart').getContext('2d');
    if (paymentChartInstance) paymentChartInstance.destroy();

    // If no past records in filtered rows, show empty or default
    if (paidCount === 0 && unpaidCount === 0) {
        unpaidCount = 1; // dummy so chart draws something grey
    }

    paymentChartInstance = new Chart(ctxPie, {
        type: 'doughnut',
        data: {
            labels: ['Paid', 'Unpaid'],
            datasets: [{
                data: [paidCount, unpaidCount === 1 && paidCount === 0 ? 0 : unpaidCount],
                backgroundColor: ['#10b981', '#f59e0b'],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '60%',
            plugins: {
                legend: { position: 'bottom' }
            }
        }
    });
}

document.addEventListener('DOMContentLoaded', initData);
