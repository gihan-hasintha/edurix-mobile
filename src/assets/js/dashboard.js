import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// ── Firebase Config ────────────────────────────────────────────────────────────
const firebaseConfig = {
    apiKey: "AIzaSyDxKcVG-j6nzzw_M4oWeQMmsWX_8f_qm60",
    authDomain: "student-registerform.firebaseapp.com",
    projectId: "student-registerform",
    storageBucket: "student-registerform.firebasestorage.app",
    messagingSenderId: "77346572955",
    appId: "1:77346572955:web:7a135d918d149e5d10943e"
};
const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);

// ── API Config ─────────────────────────────────────────────────────────────────
const API_BASE   = window.api?.env?.BASE_API_URL || 'https://api.edurix.imatap.com';
const X_API_KEY  = window.api?.env?.X_API_KEY || '996de2d470a0f1e9794b7778e216c193258aac001b36813f9ad1d3f957cc7ee7';
const HEADERS    = { 'x-api-key': X_API_KEY };

// ── Helpers ────────────────────────────────────────────────────────────────────
function getActivatedData() {
    const raw = localStorage.getItem('Activated_Teacher') || localStorage.getItem('Activated_Institution');
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
}

function getTeacherId() {
    const d = getActivatedData();
    return d ? (d.teacher_id || d.institution_id) : null;
}

function getAttendanceCollection() {
    const d = getActivatedData();
    if (d) {
        const region = d.region || d.province_region || d.province || 'wp';
        return `attendance_${region.toLowerCase()}`;
    }
    return 'attendance_wp';
}

function formatLKR(n) {
    return 'LKR ' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function formatTimeAMPM(t) {
    if (!t) return '';
    const [h24, min] = t.split(':');
    const h = parseInt(h24, 10);
    const ampm = h >= 12 ? 'PM' : 'AM';
    return `${h % 12 || 12}:${min} ${ampm}`;
}

function todayDayName() {
    return ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][new Date().getDay()];
}

function getInitials(name) {
    if (!name) return '?';
    return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

const AVATAR_COLORS = ['#ec4899','#8b5cf6','#14b8a6','#f97316','#3b82f6','#ef4444','#22c55e','#a855f7'];
function avatarColor(name) {
    let hash = 0;
    for (const c of (name || '')) hash = c.charCodeAt(0) + ((hash << 5) - hash);
    return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

// ── Chart instances ────────────────────────────────────────────────────────────
let revenueChart = null;
let studentChart = null;

// ── Main loader ────────────────────────────────────────────────────────────────
async function loadDashboardData() {
    const teacherId = getTeacherId();
    if (!teacherId) return; // activation screen still visible

    try {
        // 1. Parallel REST fetches
        const [classesRes, paymentsRes, studentsRes] = await Promise.all([
            fetch(`${API_BASE}/classes?teacher_id=${teacherId}`, { headers: HEADERS }),
            fetch(`${API_BASE}/payments?teacher_id=${teacherId}`, { headers: HEADERS }),
            fetch(`${API_BASE}/students?teacher_id=${teacherId}`, { headers: HEADERS })
        ]);

        let allClasses  = [];
        let allPayments = [];
        let allStudents = [];

        if (classesRes.ok) {
            const d = await classesRes.json();
            allClasses = (Array.isArray(d) ? d : (d.items || [])).filter(
                c => c.teacher_id === teacherId || c.institution_id === teacherId
            );
        }
        if (paymentsRes.ok) {
            const d = await paymentsRes.json();
            const raw = Array.isArray(d) ? d : (d.items || []);
            const classIds = new Set(allClasses.map(c => String(c.id)));
            allPayments = raw.filter(p => classIds.has(String(p.class_id)));
            allPayments.sort((a, b) => new Date(b.created || b.payment_date) - new Date(a.created || a.payment_date));
        }
        if (studentsRes.ok) {
            const d = await studentsRes.json();
            const raw = Array.isArray(d) ? d : (d.items || []);
            allStudents = raw.filter(
                s => s.teacher_id === teacherId || s.institution_id === teacherId
            );
        }

        // 2. Firebase attendance
        let allAttendances = [];
        try {
            const snap = await getDocs(collection(db, getAttendanceCollection()));
            const classIds = new Set(allClasses.map(c => String(c.id)));
            snap.forEach(doc => {
                const d = doc.data();
                if (classIds.has(String(d.class_id))) {
                    allAttendances.push({ id: doc.id, ...d });
                }
            });
        } catch (e) {
            console.warn('Attendance fetch failed:', e);
        }

        // 3. Render everything
        renderGreeting();
        renderSummaryCards(allClasses, allPayments, allStudents, allAttendances);
        renderAlertBanners(allPayments, allAttendances, allClasses);
        renderRevenueChart(allPayments);
        renderStudentChart(allStudents, allPayments, allAttendances, allClasses);
        renderTodaysClasses(allClasses);
        renderRecentPayments(allPayments, allStudents, allClasses);
        renderBirthdays(allStudents);

        // Update date display
        const dateEl = document.getElementById('dash-date-display');
        if (dateEl) {
            const now = new Date();
            dateEl.textContent = now.toLocaleDateString('en-US', {
                weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
            });
        }

    } catch (err) {
        console.error('Dashboard load error:', err);
    }
}

// ── Greeting ───────────────────────────────────────────────────────────────────
function renderGreeting() {
    const data = getActivatedData();
    const nameEl = document.getElementById('dash-user-name');
    if (!nameEl) return;
    if (data && (data.teacher_name || data.name)) {
        nameEl.textContent = data.teacher_name || data.name;
    }
    const hour = new Date().getHours();
    const greetEl = document.getElementById('dash-greeting-text');
    if (greetEl) {
        greetEl.textContent = hour < 12 ? 'Good Morning,' : hour < 17 ? 'Good Afternoon,' : 'Good Evening,';
    }
}

// ── Summary Cards ──────────────────────────────────────────────────────────────
function renderSummaryCards(classes, payments, students, attendances) {
    const now = new Date();
    const cm = now.getMonth(), cy = now.getFullYear();
    const pm = new Date(cy, cm - 1, 1);

    // Total Students
    setText('dash-total-students', students.length.toLocaleString());

    // New Registrations this month (for trend and card)
    const newRegs = students.filter(s => {
        if (!s.created_at && !s.created) return false;
        const d = new Date(s.created_at || s.created);
        return d.getMonth() === cm && d.getFullYear() === cy;
    });

    const studentTrendEl = document.getElementById('dash-students-trend');
    if (studentTrendEl) {
        studentTrendEl.textContent = newRegs.length > 0 ? `↑ ${newRegs.length} this month` : 'Updated today';
        studentTrendEl.style.color = newRegs.length > 0 ? '#22c55e' : '#64748b';
    }

    // Today's Classes count
    const todayDay = todayDayName();
    const todayClasses = classes.filter(c => c.classdate === todayDay);
    setText('dash-today-classes', todayClasses.length.toLocaleString());

    // Revenue this month vs prev month
    let currRev = 0, prevRev = 0;
    payments.forEach(p => {
        const d = new Date(p.created || p.payment_date);
        const amt = parseFloat(p.amount || 0);
        if ((p.status === 'Paid' || p.status === 'Partial')) {
            if (d.getMonth() === cm && d.getFullYear() === cy) currRev += amt;
            if (d.getMonth() === pm.getMonth() && d.getFullYear() === pm.getFullYear()) prevRev += amt;
        }
    });
    setText('dash-total-revenue', formatLKR(currRev));
    const revTrend = document.getElementById('dash-revenue-trend');
    if (revTrend) {
        if (prevRev > 0) {
            const pct = (((currRev - prevRev) / prevRev) * 100).toFixed(1);
            revTrend.textContent = `${pct >= 0 ? '↑' : '↓'} ${Math.abs(pct)}% vs last month`;
            revTrend.style.color = pct >= 0 ? '#22c55e' : '#ef4444';
        } else {
            revTrend.textContent = currRev > 0 ? '↑ New this month' : 'No data';
        }
    }

    // Pending Fees
    let pendingAmt = 0;
    const pendingStudentIds = new Set();
    attendances.forEach(att => {
        if (!att.check_in_time) return;
        const paid = payments.find(p =>
            (String(p.attendance_id) === String(att.id) ||
             (String(p.class_id) === String(att.class_id) &&
              p.payment_date === att.attendance_date &&
              String(p.student_id) === String(att.student_id))) &&
            p.status === 'Paid'
        );
        if (!paid) {
            const cls = classes.find(c => String(c.id) === String(att.class_id));
            if (cls) {
                pendingAmt += parseFloat(cls.fee_amount || 0);
                pendingStudentIds.add(att.student_id);
            }
        }
    });
    setText('dash-pending-fees', formatLKR(pendingAmt));
    setText('dash-pending-students', pendingStudentIds.size + ' Students');

    // New Registrations this month (for trend and card)
    const newRegsEl = document.getElementById('dash-new-registrations');
    if (newRegsEl) {
        newRegsEl.textContent = newRegs.length > 0 ? newRegs.length : students.length;
    }
    const newRegsSubEl = document.getElementById('dash-new-registrations-sub');
    if (newRegsSubEl) {
        newRegsSubEl.textContent = newRegs.length > 0 ? 'This Month' : 'Total Students';
    }
}

function setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
}

// ── Alert Banners ─────────────────────────────────────────────────────────────
function renderAlertBanners(payments, attendances, classes) {
    // Pending Fees Alert
    const pendingStudentIds = new Set();
    attendances.forEach(att => {
        if (!att.check_in_time) return;
        const paid = payments.find(p =>
            (String(p.attendance_id) === String(att.id) ||
             (String(p.class_id) === String(att.class_id) &&
              p.payment_date === att.attendance_date &&
              String(p.student_id) === String(att.student_id))) &&
            p.status === 'Paid'
        );
        if (!paid) pendingStudentIds.add(att.student_id);
    });
    const pendingFeeDescEl = document.getElementById('dash-alert-pending-desc');
    if (pendingFeeDescEl) {
        pendingFeeDescEl.textContent = `${pendingStudentIds.size} student${pendingStudentIds.size !== 1 ? 's' : ''} have outstanding payments.`;
    }

    // Absent Today (absent = attended = checked in today without payment? Use classes scheduled today)
    // We show today's total attendance count
    const today = new Date().toISOString().split('T')[0];
    const todayAttendances = attendances.filter(att => att.attendance_date === today && att.check_in_time);
    const absentDescEl = document.getElementById('dash-alert-absent-desc');
    if (absentDescEl) {
        const todayDay = todayDayName();
        const todayClassStudents = classes
            .filter(c => c.classdate === todayDay)
            .reduce((sum, c) => sum + (parseInt(c.student_count || 0)), 0);
        const absentCount = Math.max(0, todayClassStudents - todayAttendances.length);
        absentDescEl.textContent = `${todayAttendances.length} student${todayAttendances.length !== 1 ? 's' : ''} attended today.`;
    }

    // Today's Income
    let todayIncome = 0;
    let todayPaymentCount = 0;
    payments.forEach(p => {
        const pd = (p.created || p.payment_date || '').split('T')[0];
        if (pd === today && (p.status === 'Paid' || p.status === 'Partial')) {
            todayIncome += parseFloat(p.amount || 0);
            todayPaymentCount++;
        }
    });
    const incomeDescEl = document.getElementById('dash-alert-income-desc');
    if (incomeDescEl) {
        incomeDescEl.textContent = `${formatLKR(todayIncome)} collected from ${todayPaymentCount} payment${todayPaymentCount !== 1 ? 's' : ''}.`;
    }
}

// ── Revenue Trend Chart ────────────────────────────────────────────────────────
function renderRevenueChart(payments) {
    const ctx = document.getElementById('dashRevenueChart');
    if (!ctx) return;
    if (revenueChart) { revenueChart.destroy(); revenueChart = null; }

    // Build last 30 days daily totals
    const days = [];
    const dayTotals = {};
    const now = new Date();
    for (let i = 29; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(now.getDate() - i);
        const key = d.toISOString().split('T')[0];
        const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        days.push({ key, label });
        dayTotals[key] = 0;
    }

    payments.forEach(p => {
        const key = (p.created || p.payment_date || '').split('T')[0];
        if (dayTotals[key] !== undefined && (p.status === 'Paid' || p.status === 'Partial')) {
            dayTotals[key] += parseFloat(p.amount || 0);
        }
    });

    // Show every ~5th label to avoid crowding
    const labels = days.map((d, i) => (i % 5 === 0 || i === days.length - 1) ? d.label : '');
    const data   = days.map(d => dayTotals[d.key]);

    const gradient = ctx.getContext('2d').createLinearGradient(0, 0, 0, 250);
    gradient.addColorStop(0, 'rgba(239, 68, 68, 0.3)');
    gradient.addColorStop(1, 'rgba(239, 68, 68, 0.0)');

    revenueChart = new Chart(ctx.getContext('2d'), {
        type: 'line',
        data: {
            labels,
            datasets: [{
                data,
                borderColor: '#ef4444',
                backgroundColor: gradient,
                borderWidth: 2,
                tension: 0.4,
                fill: true,
                pointBackgroundColor: '#ef4444',
                pointBorderColor: '#fff',
                pointBorderWidth: 2,
                pointRadius: 4,
                pointHoverRadius: 6
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        title: (items) => days[items[0].dataIndex]?.label || '',
                        label: (item) => ' ' + formatLKR(item.parsed.y)
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    border: { display: false },
                    grid: { color: '#f1f5f9' },
                    ticks: {
                        callback: v => v >= 1000 ? (v / 1000) + 'K' : v,
                        color: '#64748b', font: { size: 10, family: 'Inter' }
                    }
                },
                x: {
                    grid: { display: false },
                    ticks: { color: '#64748b', font: { size: 10, family: 'Inter' } }
                }
            }
        }
    });
}

// ── Student Distribution Chart ────────────────────────────────────────────────
function renderStudentChart(students, payments, attendances, classes) {
    const ctx = document.getElementById('dashStudentChart');
    if (!ctx) return;
    if (studentChart) { studentChart.destroy(); studentChart = null; }

    const total = students.length;

    // Students with unpaid attendance = pending
    const pendingIds = new Set();
    attendances.forEach(att => {
        if (!att.check_in_time) return;
        const paid = payments.find(p =>
            (String(p.attendance_id) === String(att.id) ||
             (String(p.class_id) === String(att.class_id) &&
              p.payment_date === att.attendance_date &&
              String(p.student_id) === String(att.student_id))) &&
            p.status === 'Paid'
        );
        if (!paid) pendingIds.add(String(att.student_id));
    });

    const now = new Date();
    const cm = now.getMonth(), cy = now.getFullYear();
    const newStudents = students.filter(s => {
        const d = new Date(s.created_at || s.created || 0);
        return d.getMonth() === cm && d.getFullYear() === cy;
    });
    const newCount = newStudents.length;

    const inactiveCount = students.filter(s => s.student_status === 'Inactive').length;
    const pendingCount = pendingIds.size;
    const activeCount  = Math.max(0, total - pendingCount - newCount - inactiveCount);

    const labels = ['Active Students', 'Pending Payments', 'New Registrations', 'Inactive Students'];
    const data   = [activeCount, pendingCount, newCount, inactiveCount];
    const colors = ['#22c55e', '#f97316', '#3b82f6', '#a855f7'];

    studentChart = new Chart(ctx.getContext('2d'), {
        type: 'doughnut',
        data: {
            labels,
            datasets: [{ data, backgroundColor: colors, borderWidth: 0, cutout: '70%' }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false }, tooltip: { enabled: true } }
        }
    });

    // Legend
    const legend = document.querySelector('.dash-donut-container .donut-legend');
    if (legend) {
        legend.innerHTML = data.map((val, i) => `
            <div class="donut-legend-item">
                <div class="donut-legend-label">
                    <div class="donut-legend-dot" style="background:${colors[i]}"></div>
                    ${labels[i]}
                </div>
                <div>
                    <span class="donut-legend-value">${val.toLocaleString()}</span>
                    <span class="donut-legend-pct">(${total > 0 ? Math.round(val/total*100) : 0}%)</span>
                </div>
            </div>
        `).join('');
    }
    setText('dash-donut-total', total.toLocaleString());
    const pctActive = total > 0 ? Math.round(activeCount / total * 100) : 0;
    setText('dash-donut-info-text', `${pctActive}% of students are active and regular.`);
}

// ── Today's Classes List ───────────────────────────────────────────────────────
function renderTodaysClasses(classes) {
    const container = document.getElementById('dash-todays-classes-list');
    if (!container) return;

    const todayDay = todayDayName();
    const todayClasses = classes
        .filter(c => c.classdate === todayDay)
        .sort((a, b) => (a.classtime || '').localeCompare(b.classtime || ''))
        .slice(0, 5);

    if (todayClasses.length === 0) {
        container.innerHTML = `<div style="text-align:center;color:#94a3b8;padding:20px;font-size:13px;">No classes scheduled for today.</div>`;
        return;
    }

    const bgColors = ['bg-red-light', 'bg-blue-light', 'bg-green-light', 'bg-orange-light', 'bg-purple-light'];
    const txtColors = ['text-red', 'text-blue', 'text-green', 'text-orange', 'text-purple'];

    container.innerHTML = todayClasses.map((cls, i) => {
        const startTime = formatTimeAMPM(cls.classtime);
        const endTime   = formatTimeAMPM(cls.class_endtime);
        const timeStr   = startTime ? `${startTime}${endTime ? ' - ' + endTime : ''}` : 'Time TBA';
        const colorIdx  = i % bgColors.length;
        const initials  = getInitials(cls.name);

        return `
        <div class="dash-list-item" style="align-items: flex-start; padding-top: 5px;">
            <div class="item-icon circle" style="background-color:${AVATAR_COLORS[colorIdx % AVATAR_COLORS.length]};color:#fff;width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;flex-shrink:0;">
                ${initials}
            </div>
            <div class="item-content" style="flex: 1;">
                <div class="item-title" style="color:#0f172a;">${cls.name || 'Unnamed Class'}</div>
                <div class="item-subtitle">${timeStr}</div>
                <div class="item-meta">${cls.location || ''}</div>
            </div>
            <div class="item-stats" style="flex: 1;">
                <div class="item-title" style="color:#64748b; font-size:12px; font-weight:500;">${parseInt(cls.student_count || 0)} Students</div>
                <div class="item-label" style="margin-top: 4px; font-size: 11px;">Fee</div>
                <div class="item-title" style="color:#0f172a; font-size:13px;">LKR ${parseInt(cls.fee_amount || 0).toLocaleString()}</div>
            </div>
            <div class="item-badge" style="background-color:#eff6ff;color:#3b82f6;padding:4px 12px;border-radius:20px;font-size:11px;font-weight:600;">
                Upcoming
            </div>
        </div>`;
    }).join('');
}

// ── Recent Payments List ──────────────────────────────────────────────────────
function renderRecentPayments(payments, students, classes) {
    const container = document.getElementById('dash-recent-payments-list');
    if (!container) return;

    const recent = payments.slice(0, 5);

    if (recent.length === 0) {
        container.innerHTML = `<div style="text-align:center;color:#94a3b8;padding:20px;font-size:13px;">No recent payments.</div>`;
        return;
    }

    container.innerHTML = recent.map(p => {
        const student = students.find(s => String(s.id) === String(p.student_id));
        const cls     = classes.find(c => String(c.id) === String(p.class_id));
        const name    = student ? student.student_name : 'Unknown';
        const initials = getInitials(name);
        const bgColor  = avatarColor(name);
        const clsName  = cls ? cls.name : 'Unknown Class';
        const amount   = parseFloat(p.amount || 0);
        const dateStr  = new Date(p.created || p.payment_date).toLocaleDateString('en-GB', {
            day: 'numeric', month: 'short', year: 'numeric'
        });

        return `
        <div class="dash-list-item" style="align-items: flex-start; padding-top: 5px;">
            <div class="item-icon circle" style="background-color:${bgColor};color:#fff;width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;flex-shrink:0;">
                ${initials}
            </div>
            <div class="item-content">
                <div class="item-title" style="color:#0f172a;">${name}</div>
                <div class="item-subtitle">${clsName}</div>
                <div class="item-meta">${dateStr}</div>
            </div>
            <div class="item-right flex-end-center" style="gap: 8px;">
                <div class="item-title" style="color:#0f172a; font-size: 13px;">${formatLKR(amount)}</div>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
        </div>`;
    }).join('');
}

// ── Birthdays This Week ───────────────────────────────────────────────────────
function renderBirthdays(students) {
    const container = document.getElementById('dash-birthdays-list');
    if (!container) return;

    const now = new Date();
    const today = { m: now.getMonth() + 1, d: now.getDate() };

    // Get the next 7 days range
    const upcoming = students.filter(s => {
        if (!s.birthday) return false;
        const bday = new Date(s.birthday);
        if (isNaN(bday)) return false;
        const bm = bday.getMonth() + 1;
        const bd = bday.getDate();
        // Check within next 7 days
        for (let i = 0; i <= 7; i++) {
            const check = new Date(now);
            check.setDate(now.getDate() + i);
            if (bm === check.getMonth() + 1 && bd === check.getDate()) return true;
        }
        return false;
    }).sort((a, b) => {
        const da = new Date(a.birthday), db = new Date(b.birthday);
        return da.getDate() - db.getDate();
    }).slice(0, 5);

    if (upcoming.length === 0) {
        container.innerHTML = `<div style="text-align:center;color:#94a3b8;padding:10px;font-size:12px;">No birthdays this week.</div>`;
        return;
    }

    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

    container.innerHTML = upcoming.map(s => {
        const bday = new Date(s.birthday);
        const dateLabel = `${bday.getDate()} ${months[bday.getMonth()]}`;
        const initials  = getInitials(s.student_name);
        const bg        = avatarColor(s.student_name);

        return `
        <div class="bday-item">
            <div class="bday-avatar" style="background-color:${bg};color:#fff;font-weight:700;font-size:11px;">
                ${initials}
            </div>
            <div class="bday-name">${s.student_name || 'Student'}</div>
            <div class="bday-date">${dateLabel}</div>
            <div class="bday-icon">🎂</div>
        </div>`;
    }).join('');
}

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    loadDashboardData();
});

// Reload when payment updated from another tab
window.addEventListener('storage', e => {
    if (e.key === 'payment_updated') loadDashboardData();
});
