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
const CLASSES_API = `${API_URL_BASE}/classes`;
const PAYMENTS_API = `${API_URL_BASE}/payments`;
const STUDENTS_API = `${API_URL_BASE}/students`;
const X_API_KEY = '996de2d470a0f1e9794b7778e216c193258aac001b36813f9ad1d3f957cc7ee7';

let allClasses = [];
let allPayments = [];
let allStudents = [];
let allAttendances = [];
let tableTransactions = [];
let currentPage = 1;
const rowsPerPage = 5;

let globalDateRange = { type: 'all', start: null, end: null };

function isDateInRange(dStr) {
    if (globalDateRange.type === 'all') return true;
    const d = new Date(dStr);
    const now = new Date();
    
    const dTime = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const nowTime = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    
    if (globalDateRange.type === 'today') {
        return dTime === nowTime;
    }
    if (globalDateRange.type === 'this_week') {
        const weekStart = new Date(nowTime);
        weekStart.setDate(weekStart.getDate() - weekStart.getDay());
        return dTime >= weekStart.getTime();
    }
    if (globalDateRange.type === 'this_month') {
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }
    if (globalDateRange.type === 'this_year') {
        return d.getFullYear() === now.getFullYear();
    }
    if (globalDateRange.type === 'custom') {
        const start = globalDateRange.start ? new Date(globalDateRange.start).getTime() : 0;
        const end = globalDateRange.end ? new Date(globalDateRange.end).getTime() : Infinity;
        return dTime >= start && dTime <= end;
    }
    return true;
}

let sparkTotalChart, sparkPaidChart, sparkPendingChart, sparkRefundChart;
let mainTrendChart, classDonutChart;

function getActivatedData() {
    const activatedData = localStorage.getItem('Activated_Teacher') || localStorage.getItem('Activated_Institution');
    if (!activatedData) return null;
    return JSON.parse(activatedData);
}

function getAttendanceCollectionName() {
    const data = getActivatedData();
    if (data) {
        const region = data.region || data.province_region || data.province || 'WP';
        return `attendance_${region.toLowerCase()}`;
    }
    return 'attendance_wp';
}

function getTeacherId() {
    const data = getActivatedData();
    return data ? (data.teacher_id || data.institution_id) : null;
}

async function loadData() {
    const teacherId = getTeacherId();
    if (!teacherId) {
        document.getElementById('loader').innerHTML = '<p style="color: red;">Activation required to view data.</p>';
        return;
    }

    try {
        const [classesRes, paymentsRes, studentsRes] = await Promise.all([
            fetch(`${CLASSES_API}?teacher_id=${teacherId}`, { headers: { 'x-api-key': X_API_KEY } }),
            fetch(`${PAYMENTS_API}?teacher_id=${teacherId}`, { headers: { 'x-api-key': X_API_KEY } }),
            fetch(`${STUDENTS_API}?teacher_id=${teacherId}`, { headers: { 'x-api-key': X_API_KEY } })
        ]);

        if (classesRes.ok) {
            const data = await classesRes.json();
            allClasses = Array.isArray(data) ? data : (data.items || []);
        }
        
        if (paymentsRes.ok) {
            const data = await paymentsRes.json();
            const allPay = Array.isArray(data) ? data : (data.items || []);
            const classIds = new Set(allClasses.map(c => String(c.id)));
            allPayments = allPay.filter(p => classIds.has(String(p.class_id)));
            allPayments.sort((a, b) => new Date(b.created || b.payment_date) - new Date(a.created || a.payment_date));
        }

        if (studentsRes.ok) {
            const data = await studentsRes.json();
            allStudents = Array.isArray(data) ? data : (data.items || []);
        }

        // Fetch attendances for pending calculation
        const collectionName = getAttendanceCollectionName();
        const classIds = new Set(allClasses.map(c => String(c.id)));
        const querySnapshot = await getDocs(query(collection(db, collectionName)));
        
        allAttendances = [];
        querySnapshot.forEach(doc => {
            const d = doc.data();
            if (classIds.has(String(d.class_id))) {
                allAttendances.push({ id: doc.id, ...d });
            }
        });

        processDashboard();
        
        document.getElementById('loader').classList.add('hidden');
        document.getElementById('mainContainer').classList.remove('hidden');

    } catch (err) {
        console.error('Failed to load revenue data', err);
        document.getElementById('loader').innerHTML = '<p style="color: red;">Error loading data.</p>';
    }
}

function processDashboard() {
    const now = new Date();
    
    let metrics = {
        currTotal: 0, prevTotal: 0,
        currPaid: 0, prevPaid: 0,
        currPending: 0, prevPending: 0,
        currRefund: 0, prevRefund: 0
    };

    function checkDates(dStr) {
        if (!dStr) return { isCurr: false, isPrev: false };
        const d = new Date(dStr);
        let isCurr = false;
        let isPrev = false;

        const dTime = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
        const nowTime = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

        if (globalDateRange.type === 'today') {
            const yesterday = new Date(nowTime);
            yesterday.setDate(yesterday.getDate() - 1);
            isCurr = (dTime === nowTime);
            isPrev = (dTime === yesterday.getTime());
        } else if (globalDateRange.type === 'this_week') {
            const weekStart = new Date(nowTime);
            weekStart.setDate(weekStart.getDate() - weekStart.getDay());
            const prevWeekStart = new Date(weekStart);
            prevWeekStart.setDate(prevWeekStart.getDate() - 7);
            
            isCurr = (dTime >= weekStart.getTime() && dTime <= nowTime);
            isPrev = (dTime >= prevWeekStart.getTime() && dTime < weekStart.getTime());
        } else if (globalDateRange.type === 'this_month') {
            isCurr = (d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear());
            const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            isPrev = (d.getMonth() === prevMonthDate.getMonth() && d.getFullYear() === prevMonthDate.getFullYear());
        } else if (globalDateRange.type === 'this_year') {
            isCurr = (d.getFullYear() === now.getFullYear());
            isPrev = (d.getFullYear() === now.getFullYear() - 1);
        } else if (globalDateRange.type === 'custom') {
            const start = globalDateRange.start ? new Date(globalDateRange.start).getTime() : 0;
            const end = globalDateRange.end ? new Date(globalDateRange.end).getTime() : Infinity;
            isCurr = (dTime >= start && dTime <= end);
            isPrev = false;
        } else {
            isCurr = true; // All time
            isPrev = false;
        }
        return { isCurr, isPrev };
    }

    // Calculate Paid / Total
    allPayments.forEach(p => {
        const { isCurr, isPrev } = checkDates(p.created || p.payment_date);
        const amount = parseFloat(p.amount || 0);

        if (p.status === 'Paid' || p.status === 'Partial') {
            if (isCurr) {
                metrics.currPaid += amount;
                metrics.currTotal += amount;
            }
            if (isPrev) {
                metrics.prevPaid += amount;
                metrics.prevTotal += amount;
            }
        } else if (p.status === 'Refunded') {
            if (isCurr) metrics.currRefund += amount;
            if (isPrev) metrics.prevRefund += amount;
        }
    });

    // Calculate Pending (Attendances without fully paid records)
    allAttendances.forEach(att => {
        if (!att.check_in_time) return;
        
        const payRec = allPayments.find(p => (String(p.attendance_id) === String(att.id) || (String(p.class_id) === String(att.class_id) && p.payment_date === att.attendance_date && String(p.student_id) === String(att.student_id))) && p.status === 'Paid');
        
        if (!payRec) {
            const cls = allClasses.find(c => String(c.id) === String(att.class_id));
            if (cls) {
                const fee = parseFloat(cls.fee_amount || 0);
                const { isCurr, isPrev } = checkDates(att.attendance_date);

                if (isCurr) metrics.currPending += fee;
                if (isPrev) metrics.prevPending += fee;
            }
        }
    });

    // Update UI Cards
    updateCard('Total', metrics.currTotal, metrics.prevTotal);
    updateCard('Paid', metrics.currPaid, metrics.prevPaid);
    updateCard('Pending', metrics.currPending, metrics.prevPending);
    updateCard('Refund', metrics.currRefund, metrics.prevRefund);

    // Render Charts
    renderSparklines();
    renderTrendChart();
    renderDonutChart();

    // Render Table
    tableTransactions = allPayments.filter(p => isDateInRange(p.created || p.payment_date));
    currentPage = 1;
    renderTable();
}

function updateCard(type, curr, prev) {
    const valEl = document.getElementById(`card${type}Val`);
    const trendEl = document.getElementById(`card${type}Trend`);
    if (!valEl || !trendEl) return;
    
    valEl.textContent = `LKR ${curr.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;

    let pct = 0;
    if (prev > 0) {
        pct = ((curr - prev) / prev) * 100;
    } else if (curr > 0) {
        pct = 100;
    }

    const absPct = Math.abs(pct).toFixed(1);
    
    let suffix = 'vs Prev Month';
    if (globalDateRange.type === 'today') suffix = 'vs Yesterday';
    else if (globalDateRange.type === 'this_week') suffix = 'vs Last Week';
    else if (globalDateRange.type === 'this_year') suffix = 'vs Prev Year';
    else if (globalDateRange.type === 'all') suffix = 'All Time';
    else if (globalDateRange.type === 'custom') suffix = 'Custom Range';

    if (globalDateRange.type === 'all' || globalDateRange.type === 'custom') {
        if (trendEl.classList) {
            trendEl.classList.remove('trend-up', 'trend-down');
            trendEl.classList.add('trend-neutral');
        } else {
            trendEl.className = 'trend-neutral';
        }
        trendEl.innerHTML = globalDateRange.type === 'all' ? `All Time Revenue` : `Custom Range Revenue`;
    } else if (pct > 0) {
        if (trendEl.classList) {
            trendEl.classList.remove('trend-neutral', 'trend-down');
            trendEl.classList.add('trend-up');
        } else {
            trendEl.className = 'trend-up';
        }
        trendEl.innerHTML = `↑ ${absPct}% ${suffix}`;
    } else if (pct < 0) {
        if (trendEl.classList) {
            trendEl.classList.remove('trend-up', 'trend-neutral');
            trendEl.classList.add('trend-down');
        } else {
            trendEl.className = 'trend-down';
        }
        trendEl.innerHTML = `↓ ${absPct}% ${suffix}`;
    } else {
        if (trendEl.classList) {
            trendEl.classList.remove('trend-up', 'trend-down');
            trendEl.classList.add('trend-neutral');
        } else {
            trendEl.className = 'trend-neutral';
        }
        trendEl.innerHTML = `= 0% ${suffix}`;
    }
}

function renderSparklines() {
    const sparkOptions = {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
        scales: { x: { display: false }, y: { display: false } },
        elements: { point: { radius: 0 } }
    };

    const last7Days = Array.from({length: 7}, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - (6 - i));
        return d.toLocaleDateString('en-CA');
    });

    const sparkData = { Total: [0,0,0,0,0,0,0], Paid: [0,0,0,0,0,0,0], Pending: [0,0,0,0,0,0,0], Refund: [0,0,0,0,0,0,0] };

    allPayments.forEach(p => {
        const dStr = new Date(p.created || p.payment_date).toLocaleDateString('en-CA');
        const idx = last7Days.indexOf(dStr);
        if (idx > -1) {
            const amt = parseFloat(p.amount || 0);
            if (p.status === 'Paid' || p.status === 'Partial') {
                sparkData.Paid[idx] += amt;
                sparkData.Total[idx] += amt;
            } else if (p.status === 'Refunded') {
                sparkData.Refund[idx] += amt;
            }
        }
    });

    allAttendances.forEach(att => {
        if (!att.check_in_time) return;
        const dStr = new Date(att.attendance_date).toLocaleDateString('en-CA');
        const idx = last7Days.indexOf(dStr);
        if (idx > -1) {
            const payRec = allPayments.find(p => (String(p.attendance_id) === String(att.id) || (String(p.class_id) === String(att.class_id) && p.payment_date === att.attendance_date && String(p.student_id) === String(att.student_id))) && p.status === 'Paid');
            if (!payRec) {
                const cls = allClasses.find(c => String(c.id) === String(att.class_id));
                if (cls) {
                    sparkData.Pending[idx] += parseFloat(cls.fee_amount || 0);
                }
            }
        }
    });

    const createSpark = (id, color, instance, dataArray) => {
        const ctx = document.getElementById(id);
        if (instance) instance.destroy();
        return new Chart(ctx, {
            type: 'line',
            data: { labels: last7Days, datasets: [{ data: dataArray, borderColor: color, borderWidth: 2, tension: 0.4 }] },
            options: sparkOptions
        });
    };

    sparkTotalChart = createSpark('sparkTotal', '#ef4444', sparkTotalChart, sparkData.Total);
    sparkPaidChart = createSpark('sparkPaid', '#10b981', sparkPaidChart, sparkData.Paid);
    sparkPendingChart = createSpark('sparkPending', '#f97316', sparkPendingChart, sparkData.Pending);
    sparkRefundChart = createSpark('sparkRefund', '#a855f7', sparkRefundChart, sparkData.Refund);
}

function renderTrendChart() {
    const ctx = document.getElementById('revenueTrendChart').getContext('2d');
    if (mainTrendChart) mainTrendChart.destroy();

    const mode = document.getElementById('trendScale').value;
    const monthInput = document.getElementById('trendMonth');
    const selectedMonthStr = monthInput ? monthInput.value : '';
    
    const groupedData = {};
    let chartPayments = allPayments.filter(p => isDateInRange(p.created || p.payment_date));
    
    if (selectedMonthStr) {
        const [yyyy, mm] = selectedMonthStr.split('-');
        chartPayments = chartPayments.filter(p => {
            const d = new Date(p.created || p.payment_date);
            return d.getFullYear() === parseInt(yyyy, 10) && (d.getMonth() + 1) === parseInt(mm, 10);
        });
    }

    chartPayments.forEach(p => {
        if (p.status !== 'Paid' && p.status !== 'Partial') return;
        const d = new Date(p.created || p.payment_date);
        let label;
        if (mode === 'daily') {
            label = d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
        } else {
            label = d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
        }
        if (!groupedData[label]) groupedData[label] = 0;
        groupedData[label] += parseFloat(p.amount || 0);
    });

    const labels = Object.keys(groupedData).reverse(); // Oldest first
    const dataPoints = Object.values(groupedData).reverse();

    if (labels.length === 0) {
        labels.push('No Data');
        dataPoints.push(0);
    }

    const gradient = ctx.createLinearGradient(0, 0, 0, 400);
    gradient.addColorStop(0, 'rgba(239, 68, 68, 0.4)');
    gradient.addColorStop(1, 'rgba(239, 68, 68, 0.0)');

    mainTrendChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Revenue',
                data: dataPoints,
                borderColor: '#ef4444',
                backgroundColor: gradient,
                borderWidth: 3,
                pointBackgroundColor: '#ef4444',
                pointBorderColor: '#fff',
                pointBorderWidth: 2,
                pointRadius: 6,
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (ctx) => ' LKR ' + ctx.parsed.y.toLocaleString('en-US')
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    border: { display: false },
                    grid: { color: '#f8fafc' },
                    ticks: { callback: (val) => 'LKR ' + (val/1000) + 'K', color: '#64748b', font: {size: 11, weight: '600'} }
                },
                x: {
                    grid: { display: false },
                    ticks: { color: '#64748b', font: {size: 12, weight: '600'} }
                }
            }
        }
    });
}

function renderDonutChart() {
    const ctx = document.getElementById('revenueClassChart');
    if (classDonutChart) classDonutChart.destroy();

    let donutTotal = 0;
    const classRev = {};
    const filteredPayments = allPayments.filter(p => isDateInRange(p.created || p.payment_date));
    filteredPayments.forEach(p => {
        if (p.status !== 'Paid' && p.status !== 'Partial') return;
        const cId = p.class_id;
        if (!classRev[cId]) classRev[cId] = 0;
        const amt = parseFloat(p.amount || 0);
        classRev[cId] += amt;
        donutTotal += amt;
    });

    const colors = ['#ef4444', '#3b82f6', '#22c55e', '#eab308', '#a855f7'];
    const labels = [];
    const dataVals = [];
    
    const legendContainer = document.getElementById('donutLegend');
    legendContainer.innerHTML = '';

    let i = 0;
    for (const [cId, rev] of Object.entries(classRev)) {
        if (rev === 0) continue;
        const cls = allClasses.find(c => String(c.id) === String(cId));
        const cName = cls ? cls.name : 'Unknown';
        labels.push(cName);
        dataVals.push(rev);
        
        const color = colors[i % colors.length];
        const pct = donutTotal > 0 ? ((rev / donutTotal) * 100).toFixed(1) : 0;

        legendContainer.innerHTML += `
            <div class="legend-item">
                <div class="legend-label">
                    <div class="legend-dot" style="background: ${color}"></div>
                    ${cName}
                </div>
                <div>
                    <span class="legend-value">LKR ${rev.toLocaleString()}</span>
                    <span class="legend-pct">(${pct}%)</span>
                </div>
            </div>
        `;
        i++;
    }

    document.getElementById('donutTotal').textContent = `LKR ${donutTotal.toLocaleString()}`;

    classDonutChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: dataVals.length ? dataVals : [1],
                backgroundColor: dataVals.length ? colors : ['#e2e8f0'],
                borderWidth: 0,
                cutout: '75%'
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false }, tooltip: { enabled: dataVals.length > 0 } }
        }
    });
}

function renderTable() {
    const listEl = document.getElementById('txnList');
    const searchEl = document.getElementById('tableSearch');
    const search = searchEl ? searchEl.value.toLowerCase() : '';

    // Filter
    const filtered = tableTransactions.filter(t => {
        const student = allStudents.find(s => String(s.id) === String(t.student_id));
        const sName = (student ? student.student_name : '').toLowerCase();
        const cls = allClasses.find(c => String(c.id) === String(t.class_id));
        const cName = (cls ? cls.name : '').toLowerCase();
        return sName.includes(search) || cName.includes(search);
    });

    const totalRows = filtered.length;
    const totalPages = Math.ceil(totalRows / rowsPerPage) || 1;
    if (currentPage > totalPages) currentPage = totalPages;

    const startIdx = (currentPage - 1) * rowsPerPage;
    const endIdx = startIdx + rowsPerPage;
    const paginated = filtered.slice(startIdx, endIdx);

    listEl.innerHTML = '';

    if (paginated.length === 0) {
        listEl.innerHTML = `<div class="txn-empty">No transactions found.</div>`;
    } else {
        paginated.forEach((t, i) => {
            const student = allStudents.find(s => String(s.id) === String(t.student_id));
            const sName = student ? student.student_name : 'Unknown';
            const sImg = student && student.student_photo ? student.student_photo : './assets/img/student-blank-image.jpg';

            const cls = allClasses.find(c => String(c.id) === String(t.class_id));
            const cName = cls ? cls.name : 'Unknown';

            const d = new Date(t.created || t.payment_date);
            const dateStr = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

            const amount = parseFloat(t.amount || 0);
            const isPaid = (t.status === 'Paid' || t.status === 'Partial');
            const badgeClass = isPaid ? 'badge-paid' : 'badge-pending';
            const badgeLabel = t.status || 'Paid';

            listEl.innerHTML += `
                <div class="txn-row">
                    <span class="txn-num">${startIdx + i + 1}</span>
                    <span class="txn-date">${dateStr}</span>
                    <div class="txn-avatar">
                        <img src="${sImg}" alt="${sName}" onerror="this.onerror=null; this.src='./assets/img/student-blank-image.jpg'">
                    </div>
                    <div class="txn-student-info">
                        <div class="txn-student-name">${sName}</div>
                        <div class="txn-class-name">${cName}</div>
                    </div>
                    <span class="txn-badge ${badgeClass}">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                        ${badgeLabel}
                    </span>
                    <span class="txn-amount">LKR ${amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                    <span class="txn-chevron">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                    </span>
                </div>
            `;
        });
    }

    // Update Pagination UI
    document.getElementById('pageInfo').textContent =
        `Showing ${totalRows === 0 ? 0 : startIdx + 1} to ${Math.min(endIdx, totalRows)} of ${totalRows} transactions`;

    const controls = document.getElementById('pageControls');
    controls.innerHTML = `
        <button class="page-btn" ${currentPage === 1 ? 'disabled' : ''} onclick="window.changePage(-1)">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
    `;

    for (let p = 1; p <= Math.min(totalPages, 5); p++) {
        controls.innerHTML += `<button class="page-btn ${p === currentPage ? 'active' : ''}" onclick="window.goToPage(${p})">${p}</button>`;
    }

    controls.innerHTML += `
        <button class="page-btn" ${currentPage === totalPages ? 'disabled' : ''} onclick="window.changePage(1)">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
    `;
}

window.changePage = function (dir) {
    currentPage += dir;
    renderTable();
};
window.goToPage = function (p) {
    currentPage = p;
    renderTable();
};

document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('tableSearch');
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            currentPage = 1;
            renderTable();
        });
    }
    document.getElementById('trendScale').addEventListener('change', renderTrendChart);
    
    const trendMonthInput = document.getElementById('trendMonth');
    if (trendMonthInput) {
        trendMonthInput.addEventListener('change', renderTrendChart);
    }
    
    const exportBtn = document.getElementById('exportReportBtn');
    if (exportBtn) {
        exportBtn.addEventListener('click', exportToCSV);
    }
    
    const dateBtn = document.getElementById('dateRangeBtn');
    const dateModal = document.getElementById('dateFilterModal');
    const closeBtn = document.getElementById('closeDateModal');
    const presetBtns = document.querySelectorAll('.preset-card');
    const applyBtn = document.getElementById('applyDateFilterBtn');
    const customSection = document.getElementById('customRangeSection');
    
    let tempType = 'all';

    if (dateBtn && dateModal) {
        dateBtn.addEventListener('click', () => dateModal.style.display = 'flex');
        closeBtn.addEventListener('click', () => dateModal.style.display = 'none');
        
        presetBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const targetBtn = e.currentTarget;
                presetBtns.forEach(b => b.classList.remove('active'));
                targetBtn.classList.add('active');
                tempType = targetBtn.dataset.range;
                
                if (tempType === 'custom') {
                    customSection.style.display = 'flex';
                } else {
                    customSection.style.display = 'none';
                }
            });
        });
        
        applyBtn.addEventListener('click', () => {
            globalDateRange.type = tempType;
            if (tempType === 'custom') {
                globalDateRange.start = document.getElementById('customStartDate').value;
                globalDateRange.end = document.getElementById('customEndDate').value;
                document.getElementById('dateRangeLabel').textContent = 'Custom Range';
            } else {
                const activeBtn = document.querySelector('.preset-card.active');
                if (activeBtn) {
                    const titleEl = activeBtn.querySelector('h3');
                    if (titleEl) document.getElementById('dateRangeLabel').textContent = titleEl.textContent;
                }
            }
            dateModal.style.display = 'none';
            processDashboard();
        });
    }

    loadData();
});

function exportToCSV() {
    if (!tableTransactions || tableTransactions.length === 0) {
        alert("No data to export");
        return;
    }

    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Date,Student,Class,Invoice No.,Status,Amount,Payment Method\n";

    tableTransactions.forEach(t => {
        const student = allStudents.find(s => String(s.id) === String(t.student_id));
        const sName = student ? student.student_name : 'Unknown';
        const cls = allClasses.find(c => String(c.id) === String(t.class_id));
        const cName = cls ? cls.name : 'Unknown';
        const d = new Date(t.created || t.payment_date);
        const dateStr = d.toLocaleDateString('en-GB', {day:'numeric', month:'short', year:'numeric'});
        const amount = parseFloat(t.amount || 0);
        const invoiceNo = `INV-${d.getFullYear()}-${String(t.id).padStart(4, '0').slice(-4)}`;
        const status = t.status || 'Paid';
        const method = t.payment_type || 'Cash';

        csvContent += `"${dateStr}","${sName}","${cName}","${invoiceNo}","${status}","${amount}","${method}"\n`;
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "revenue_report.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

window.addEventListener('storage', (e) => {
    if (e.key === 'payment_updated') {
        loadData();
    }
});
