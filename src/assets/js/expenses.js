const API_URL_BASE = window.api?.env?.API_URL ? window.api.env.API_URL.replace('/students', '') : 'https://api.edurix.imatap.com';
const EXPENSES_API = `${API_URL_BASE}/expenses`;
const X_API_KEY = window.api?.env?.X_API_KEY || '996de2d470a0f1e9794b7778e216c193258aac001b36813f9ad1d3f957cc7ee7';

let allExpenses = [];

function getActivatedData() {
    const activatedData = localStorage.getItem('Activated_Teacher') || localStorage.getItem('Activated_Institution');
    if (!activatedData) return null;
    return JSON.parse(activatedData);
}

function getTeacherId() {
    const data = getActivatedData();
    return data ? (data.teacher_id || data.institution_id) : null;
}

async function loadExpenses() {
    const teacherId = getTeacherId();
    if (!teacherId) {
        document.getElementById('loader').innerHTML = '<p style="color: red;">Activation required to view expenses.</p>';
        return;
    }

    try {
        const response = await fetch(`${EXPENSES_API}?teacher_id=${teacherId}`, {
            headers: { 'x-api-key': X_API_KEY }
        });

        if (response.ok) {
            const data = await response.json();
            allExpenses = Array.isArray(data) ? data : (data.items || []);
        } else {
            console.error('Failed to load expenses from API');
            allExpenses = [];
        }

        let totalExpenses = 0;
        
        allExpenses.forEach(exp => {
            totalExpenses += parseFloat(exp.amount || 0);
        });

        // Sort expenses by date descending
        allExpenses.sort((a, b) => new Date(b.date) - new Date(a.date));

        // Update UI Summary
        document.getElementById('cardTotalExpensesVal').textContent = `LKR ${totalExpenses.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;

        renderTable();
        
        document.getElementById('loader').classList.add('hidden');
        document.getElementById('mainContainer').classList.remove('hidden');

    } catch (err) {
        console.error('Failed to load expenses', err);
        document.getElementById('loader').innerHTML = '<p style="color: red;">Error loading expenses.</p>';
    }
}

function renderTable() {
    const listEl = document.getElementById('expenseList');
    listEl.innerHTML = '';

    if (allExpenses.length === 0) {
        listEl.innerHTML = `<div class="txn-empty" style="text-align:center; padding:20px; color:#64748b;">No expenses found. Add one above!</div>`;
    } else {
        allExpenses.forEach((exp, i) => {
            const d = new Date(exp.date);
            const dateStr = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
            const amount = parseFloat(exp.amount || 0);

            listEl.innerHTML += `
                <div class="txn-row" style="flex-wrap: wrap;">
                    <span class="txn-num">${i + 1}</span>
                    <span class="txn-date" style="flex:1;">${dateStr}</span>
                    <div class="txn-student-info" style="flex:2;">
                        <div class="txn-student-name">${exp.category}</div>
                        <div class="expense-desc">${exp.description || 'No description'}</div>
                    </div>
                    <span class="txn-amount text-red" style="flex:1; text-align:right;">LKR ${amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                </div>
            `;
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const addBtn = document.getElementById('addExpenseBtn');
    const modal = document.getElementById('addExpenseModal');
    const closeBtn = document.getElementById('closeExpenseModal');
    const saveBtn = document.getElementById('saveExpenseBtn');
    
    if (addBtn && modal) {
        addBtn.addEventListener('click', () => {
            // Set default date to today
            document.getElementById('expenseDate').value = new Date().toISOString().split('T')[0];
            document.getElementById('expenseAmount').value = '';
            document.getElementById('expenseDescription').value = '';
            modal.style.display = 'flex';
        });
        
        closeBtn.addEventListener('click', () => {
            modal.style.display = 'none';
        });

        saveBtn.addEventListener('click', async () => {
            const teacherId = getTeacherId();
            if (!teacherId) return;

            const dateInput = document.getElementById('expenseDate').value;
            const category = document.getElementById('expenseCategory').value;
            const amount = parseFloat(document.getElementById('expenseAmount').value);
            const description = document.getElementById('expenseDescription').value;

            if (!dateInput || isNaN(amount) || amount <= 0) {
                alert("Please provide a valid date and amount.");
                return;
            }

            // Convert date to ISO string for the backend API
            const dateISO = new Date(dateInput).toISOString();
            const now = new Date().toISOString();

            saveBtn.disabled = true;
            saveBtn.innerHTML = 'Saving...';

            const payload = {
                teacher_id: String(teacherId),
                date: dateISO,
                category: category,
                amount: amount,
                description: description,
                created: now,
                updated: now
            };

            try {
                const response = await fetch(EXPENSES_API, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-api-key': X_API_KEY
                    },
                    body: JSON.stringify(payload)
                });

                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }

                modal.style.display = 'none';
                saveBtn.disabled = false;
                saveBtn.innerHTML = `
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
                        <polyline points="17 21 17 13 7 13 7 21"></polyline>
                        <polyline points="7 3 7 8 15 8"></polyline>
                    </svg>
                    Save Expense`;
                
                // Reload expenses
                document.getElementById('loader').classList.remove('hidden');
                document.getElementById('mainContainer').classList.add('hidden');
                loadExpenses();
                
            } catch (err) {
                console.error("Error adding expense: ", err);
                alert("Failed to save expense. Please try again.");
                saveBtn.disabled = false;
                saveBtn.innerHTML = 'Save Expense';
            }
        });
    }

    loadExpenses();
});
