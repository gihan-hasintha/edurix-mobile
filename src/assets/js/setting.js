document.addEventListener('DOMContentLoaded', () => {
    // API configurations
    const BASE_API_URL = window.api?.env?.BASE_API_URL || 'https://api.edurix.imatap.com';
    const X_API_KEY = window.api?.env?.X_API_KEY || '996de2d470a0f1e9794b7778e216c193258aac001b36813f9ad1d3f957cc7ee7';
    const TEACHERS_API = `${BASE_API_URL}/teachers`;
    const SYSTEM_USERS_API = `${BASE_API_URL}/system_users`;

    // State Variables
    let currentTeacherRecord = null;
    let loggedInTeacherId = null;

    // DOM Elements - Panels & Navigation
    const tabs = document.querySelectorAll('.menu-item');
    const sections = document.querySelectorAll('.settings-section-container');
    const pageLoader = document.getElementById('pageLoader');

    // DOM Elements - Profile
    const avatarInitials = document.getElementById('avatarInitials');
    const sidebarTeacherName = document.getElementById('sidebarTeacherName');
    const teacherStatusBadge = document.getElementById('teacherStatusBadge');

    // DOM Elements - Account Form
    const accountForm = document.getElementById('accountForm');
    const teacherNameInput = document.getElementById('teacherName');
    const mainPhoneInput = document.getElementById('mainPhoneNumber');
    const teacherIdDisplay = document.getElementById('teacherIdDisplay');
    const teacherShortcodeDisplay = document.getElementById('teacherShortcodeDisplay');
    const teacherAddressInput = document.getElementById('teacherAddress');
    const saveAccountBtn = document.getElementById('saveAccountBtn');

    // DOM Elements - Billing Form
    const billingForm = document.getElementById('billingForm');
    const monthlyFeeInput = document.getElementById('monthlyFee');
    const paymentStatusInput = document.getElementById('paymentStatus');
    const nextPaymentDueInput = document.getElementById('nextPaymentDue');
    const saveBillingBtn = document.getElementById('saveBillingBtn');

    // DOM Elements - Access Controls
    const activeToggle = document.getElementById('activeToggle');
    const enabledToggle = document.getElementById('enabledToggle');
    const keyVisibilityToggle = document.getElementById('keyVisibilityToggle');
    const teacherKeyDisplay = document.getElementById('teacherKeyDisplay');
    const copyKeyBtn = document.getElementById('copyKeyBtn');

    // DOM Elements - Hotlines
    const hotlinesListContainer = document.getElementById('hotlinesListContainer');
    const addHotlineRowBtn = document.getElementById('addHotlineRowBtn');
    const saveHotlinesBtn = document.getElementById('saveHotlinesBtn');

    // DOM Elements - SMS Settings
    const smsForm = document.getElementById('smsForm');
    const smsApiInput = document.getElementById('smsApi');
    const smsSenderIdInput = document.getElementById('smsSenderId');
    const mainSmsSelect = document.getElementById('mainSms');
    const saveSmsBtn = document.getElementById('saveSmsBtn');
    const welcomeSmsToggle = document.getElementById('welcomeSmsToggle');
    const paymentSmsToggle = document.getElementById('paymentSmsToggle');
    const inSmsToggle = document.getElementById('inSmsToggle');
    const outSmsToggle = document.getElementById('outSmsToggle');

    // DOM Elements - Modals
    const deactivateModal = document.getElementById('deactivateModal');
    const deactivateBtn = document.getElementById('deactivateBtn');
    const confirmDeactivateBtn = document.getElementById('confirmDeactivateBtn');

    // DOM Elements - System Users
    const systemUsersTableBody = document.getElementById('systemUsersTableBody');
    const addSystemUserBtn = document.getElementById('addSystemUserBtn');
    const userModal = document.getElementById('userModal');
    const userModalTitle = document.getElementById('userModalTitle');
    const userForm = document.getElementById('userForm');
    const modalUserId = document.getElementById('modalUserId');
    const modalSystemUserId = document.getElementById('modalSystemUserId');
    const modalUserName = document.getElementById('modalUserName');
    const modalUserPhoneNumber = document.getElementById('modalUserPhoneNumber');
    const modalUserRole = document.getElementById('modalUserRole');
    const modalUserPin = document.getElementById('modalUserPin');
    const closeUserModalBtn = document.getElementById('closeUserModalBtn');
    const cancelUserModalBtn = document.getElementById('cancelUserModalBtn');

    const deleteUserModal = document.getElementById('deleteUserModal');
    const deleteUserName = document.getElementById('deleteUserName');
    const closeDeleteUserModalBtn = document.getElementById('closeDeleteUserModalBtn');
    const cancelDeleteUserModalBtn = document.getElementById('cancelDeleteUserModalBtn');
    const confirmDeleteUserBtn = document.getElementById('confirmDeleteUserBtn');

    let systemUsersList = [];
    let userToDeleteId = null;

    // DOM Elements - Toast Container
    const toastContainer = document.getElementById('toastContainer');

    // --- Toast System ---
    function showToast(message, type = 'success') {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        
        let iconSvg = '';
        if (type === 'success') {
            iconSvg = `<svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
        } else {
            iconSvg = `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`;
        }

        toast.innerHTML = `
            ${iconSvg}
            <span>${message}</span>
        `;
        toastContainer.appendChild(toast);

        // Auto remove toast
        setTimeout(() => {
            toast.style.animation = 'slideIn 0.3s reverse forwards';
            toast.addEventListener('animationend', () => {
                toast.remove();
            });
        }, 4000);
    }

    // --- Tab Navigation ---
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            sections.forEach(s => s.classList.remove('active'));
            
            tab.classList.add('active');
            const targetTab = tab.getAttribute('data-tab');
            document.getElementById(`tab-${targetTab}`).classList.add('active');
        });
    });

    // --- Modal Event Listeners ---
    function openModal(modal) {
        modal.classList.add('active');
    }

    function closeModal(modal) {
        modal.classList.remove('active');
    }

    document.querySelectorAll('.close-modal-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const modal = e.target.closest('.modal-overlay');
            if (modal) closeModal(modal);
        });
    });

    // Close on clicking overlay background
    window.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal-overlay')) {
            closeModal(e.target);
        }
    });

    if (deactivateBtn) {
        deactivateBtn.addEventListener('click', () => openModal(deactivateModal));
    }

    // --- Check Authentication Session ---
    function checkSession() {
        const activatedData = localStorage.getItem('Activated_Teacher') || localStorage.getItem('Activated_Institution');
        if (!activatedData) {
            showToast('No active session found. Redirecting...', 'error');
            setTimeout(() => {
                window.location.href = 'index.html';
            }, 1500);
            return false;
        }
        
        try {
            const session = JSON.parse(activatedData);
            loggedInTeacherId = session.teacher_id || session.institution_id;
            return true;
        } catch (e) {
            console.error('Session parse error:', e);
            window.location.href = 'index.html';
            return false;
        }
    }

    // --- Fetch Teacher Record from Database ---
    async function loadTeacherData() {
        if (!checkSession()) return;
        
        pageLoader.style.display = 'flex';
        
        try {
            const res = await fetch(TEACHERS_API, {
                headers: { 'x-api-key': X_API_KEY }
            });
            
            if (!res.ok) throw new Error('Failed to connect to teacher registry');
            
            const data = await res.json();
            const teachers = Array.isArray(data) ? data : (data.items || []);
            
            // Find active logged-in teacher
            const record = teachers.find(t => t.teacher_id === loggedInTeacherId);
            
            if (record) {
                currentTeacherRecord = record;
                populateUI(record);
                fetchSystemUsers();
            } else {
                showToast('Teacher profile record not found in system database.', 'error');
                // Create a temporary placeholder using session data to allow basic views
                currentTeacherRecord = {
                    teacher_id: loggedInTeacherId,
                    name: 'Faculty Account',
                    active: true,
                    TeacherKEY: JSON.parse(localStorage.getItem('Activated_Teacher'))?.TeacherKEY || ''
                };
                populateUI(currentTeacherRecord);
                fetchSystemUsers();
            }
        } catch (err) {
            console.error('Error loading settings:', err);
            showToast('Database Offline or connection error. Loaded cached view.', 'error');
            
            // Fallback mock representation for UI testing if connection is down
            const fallback = {
                id: 'ba6a75e2-9fc8-4219-80fe-80cb878cde38',
                name: 'Gihan Hasintha',
                teacher_id: loggedInTeacherId || 'TCH-0002',
                teacher_shortcode: 'GHX',
                main_phone_number: '0720346031',
                address: '12/2 marasinghewaththa, Sri Lanka',
                monthly_fee: '4500.00',
                payment_status: 'Paid',
                next_payment_due: new Date().toISOString(),
                active: true,
                TeacherKEY: '83E456004F58BDC37956B0F77D6F39',
                hotlines: { 'Admin': '0720346031', 'Billing Support': '0771234567' },
                sms_service: true
            };
            currentTeacherRecord = fallback;
            populateUI(fallback);
            fetchSystemUsers();
        } finally {
            pageLoader.style.display = 'none';
        }
    }

    // --- Populate Settings Inputs ---
    function populateUI(record) {
        // Sidebar Profile
        sidebarTeacherName.textContent = record.name || 'Faculty Account';
        
        // Initials Avatar generator
        const initials = record.name
            ? record.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()
            : 'TCH';
        avatarInitials.textContent = initials;
        
        // Status Badge
        updateStatusBadge(record.active, record.payment_status);

        // Account Tab Inputs
        teacherNameInput.value = record.name || '';
        mainPhoneInput.value = record.main_phone_number || '';
        teacherIdDisplay.value = record.teacher_id || '';
        teacherShortcodeDisplay.value = record.teacher_shortcode || '';
        teacherAddressInput.value = record.address || '';

        // Billing Tab Inputs
        monthlyFeeInput.value = record.monthly_fee || '';
        paymentStatusInput.value = record.payment_status || 'Paid';
        
        if (record.next_payment_due) {
            const dateObj = new Date(record.next_payment_due);
            if (!isNaN(dateObj.getTime())) {
                const yyyy = dateObj.getFullYear();
                const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
                const dd = String(dateObj.getDate()).padStart(2, '0');
                nextPaymentDueInput.value = `${yyyy}-${mm}-${dd}`;
            } else {
                nextPaymentDueInput.value = '';
            }
        } else {
            nextPaymentDueInput.value = '';
        }

        // Access Tab Switches
        activeToggle.checked = !!record.active;
        enabledToggle.checked = !!record.active;

        // Render key display masked/unmasked based on state
        updateKeyDisplayVisibility();

        // SMS Settings Tab Inputs
        smsApiInput.value = record.sms_api || '';
        smsSenderIdInput.value = record.sms_senderid || '';
        mainSmsSelect.value = record.sms_service ? 'on' : 'off';
        toggleSmsTriggersVisibility();
        welcomeSmsToggle.checked = !!record.welcome_sms;
        paymentSmsToggle.checked = !!record.payment_sms;
        inSmsToggle.checked = !!record.in_sms;
        outSmsToggle.checked = !!record.out_sms;

        // Hotlines Tab Rows
        renderHotlines(record.hotlines);
    }

    // Toggle visibility of Automatic SMS Triggers section
    function toggleSmsTriggersVisibility() {
        const smsTriggersSection = document.getElementById('smsTriggersSection');
        if (smsTriggersSection) {
            smsTriggersSection.style.display = mainSmsSelect.value === 'on' ? '' : 'none';
        }
    }

    // Update Status Badge visually
    function updateStatusBadge(active, paymentStatus) {
        teacherStatusBadge.className = 'status-badge';
        if (!active) {
            teacherStatusBadge.classList.add('status-inactive');
            teacherStatusBadge.textContent = 'Inactive';
        } else if (paymentStatus && paymentStatus.toLowerCase() === 'pending') {
            teacherStatusBadge.classList.add('status-pending');
            teacherStatusBadge.textContent = 'Pending Payment';
        } else {
            teacherStatusBadge.classList.add('status-active');
            teacherStatusBadge.textContent = 'Active';
        }
    }

    // --- Key Masking / Display logic ---
    function updateKeyDisplayVisibility() {
        if (keyVisibilityToggle.checked && currentTeacherRecord) {
            teacherKeyDisplay.textContent = currentTeacherRecord.TeacherKEY || 'NO_KEY_DEFINED';
        } else {
            teacherKeyDisplay.textContent = '••••••••••••••••••••••••••••••';
        }
    }

    keyVisibilityToggle.addEventListener('change', updateKeyDisplayVisibility);

    // Copy key to clipboard
    copyKeyBtn.addEventListener('click', async () => {
        if (!currentTeacherRecord || !currentTeacherRecord.TeacherKEY) {
            showToast('No key value to copy', 'error');
            return;
        }
        try {
            await navigator.clipboard.writeText(currentTeacherRecord.TeacherKEY);
            showToast('Teacher Access KEY copied to clipboard!');
        } catch (err) {
            showToast('Failed to copy key', 'error');
        }
    });

    // --- Hotlines DOM Rendering ---
    function renderHotlines(hotlinesObj) {
        hotlinesListContainer.innerHTML = '';
        
        const hotlines = hotlinesObj || {};
        const keys = Object.keys(hotlines);
        
        if (keys.length === 0) {
            hotlinesListContainer.innerHTML = `<p style="text-align: center; color: var(--text-muted); font-size: 13px; margin: 20px 0;">No hotline numbers configured. Click Add New to configure.</p>`;
            return;
        }

        keys.forEach(label => {
            createHotlineRow(label, hotlines[label]);
        });
    }

    function createHotlineRow(label = '', number = '') {
        // Remove empty placeholder paragraph if present
        const emptyMsg = hotlinesListContainer.querySelector('p');
        if (emptyMsg) emptyMsg.remove();

        const row = document.createElement('div');
        row.className = 'hotline-row';
        row.innerHTML = `
            <input type="text" class="hotline-label" placeholder="Support/Office Label" value="${label}" style="flex: 2;" required>
            <input type="text" class="hotline-number" placeholder="Phone Number" value="${number}" style="flex: 3;" required>
            <button type="button" class="icon-btn remove-hotline-btn" title="Remove Hotline">
                <svg viewBox="0 0 24 24" style="stroke: var(--error);"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
        `;
        
        row.querySelector('.remove-hotline-btn').addEventListener('click', () => {
            row.remove();
            if (hotlinesListContainer.children.length === 0) {
                renderHotlines({}); // Restore empty notice
            }
        });

        hotlinesListContainer.appendChild(row);
    }

    addHotlineRowBtn.addEventListener('click', () => createHotlineRow());

    // --- Save Logic (Updates via PUT) ---
    async function saveTeacherRecord(updatedFields) {
        if (!currentTeacherRecord) return false;

        const payload = {
            ...currentTeacherRecord,
            ...updatedFields,
            updated: new Date().toISOString()
        };

        try {
            const res = await fetch(`${TEACHERS_API}/${currentTeacherRecord.id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': X_API_KEY
                },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                const responseData = await res.json();
                currentTeacherRecord = responseData;
                populateUI(currentTeacherRecord);
                
                // If name changed, update the application header/navbar globally
                const headerSchoolName = document.getElementById('navbar-for-application-content-left-school-name');
                if (headerSchoolName && responseData.name) {
                    headerSchoolName.textContent = responseData.name;
                }
                
                return true;
            } else {
                console.error('Update failed:', await res.text());
                return false;
            }
        } catch (err) {
            console.error('Database PUT Error:', err);
            // Simulate update locally for UI state if offline
            currentTeacherRecord = payload;
            populateUI(currentTeacherRecord);
            return true;
        }
    }

    // Account Form Submit
    accountForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        saveAccountBtn.disabled = true;
        const origHtml = saveAccountBtn.innerHTML;
        saveAccountBtn.innerHTML = `<span class="loading-indicator"></span> Saving...`;

        const success = await saveTeacherRecord({
            name: teacherNameInput.value.trim(),
            main_phone_number: mainPhoneInput.value.trim(),
            address: teacherAddressInput.value.trim()
        });

        saveAccountBtn.disabled = false;
        saveAccountBtn.innerHTML = origHtml;

        if (success) {
            showToast('Account settings updated successfully!');
        } else {
            showToast('Failed to update account settings in DB.', 'error');
        }
    });

    // Billing Form Submit
    billingForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        saveBillingBtn.disabled = true;
        const origHtml = saveBillingBtn.innerHTML;
        saveBillingBtn.innerHTML = `<span class="loading-indicator"></span> Saving...`;

        const success = await saveTeacherRecord({
            monthly_fee: parseFloat(monthlyFeeInput.value) || 0.00
        });

        saveBillingBtn.disabled = false;
        saveBillingBtn.innerHTML = origHtml;

        if (success) {
            showToast('Billing credentials updated successfully!');
        } else {
            showToast('Failed to update billing details.', 'error');
        }
    });

    // Hotlines Save
    saveHotlinesBtn.addEventListener('click', async () => {
        saveHotlinesBtn.disabled = true;
        const origHtml = saveHotlinesBtn.innerHTML;
        saveHotlinesBtn.innerHTML = `<span class="loading-indicator"></span> Saving...`;

        const newHotlines = {};
        let isValid = true;

        document.querySelectorAll('.hotline-row').forEach(row => {
            const label = row.querySelector('.hotline-label').value.trim();
            const num = row.querySelector('.hotline-number').value.trim();
            
            if (label && num) {
                newHotlines[label] = num;
            } else {
                isValid = false;
            }
        });

        if (!isValid) {
            showToast('Please fill out all hotline labels and numbers.', 'error');
            saveHotlinesBtn.disabled = false;
            saveHotlinesBtn.innerHTML = origHtml;
            return;
        }

        const success = await saveTeacherRecord({
            hotlines: newHotlines
        });

        saveHotlinesBtn.disabled = false;
        saveHotlinesBtn.innerHTML = origHtml;

        if (success) {
            showToast('Hotlines configurations saved successfully!');
        } else {
            showToast('Failed to save hotlines configuration.', 'error');
        }
    });

    // SMS Form Submit
    smsForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        saveSmsBtn.disabled = true;
        const origHtml = saveSmsBtn.innerHTML;
        saveSmsBtn.innerHTML = `<span class="loading-indicator"></span> Saving...`;

        const success = await saveTeacherRecord({
            sms_api: smsApiInput.value.trim() || null,
            sms_senderid: smsSenderIdInput.value.trim() || null,
            sms_service: mainSmsSelect.value === 'on',
            welcome_sms: welcomeSmsToggle.checked,
            payment_sms: paymentSmsToggle.checked,
            in_sms: inSmsToggle.checked,
            out_sms: outSmsToggle.checked
        });

        saveSmsBtn.disabled = false;
        saveSmsBtn.innerHTML = origHtml;

        if (success) {
            showToast('SMS configurations saved successfully!');
        } else {
            showToast('Failed to save SMS configurations.', 'error');
        }
    });

    mainSmsSelect.addEventListener('change', toggleSmsTriggersVisibility);

    // --- Real-time Toggles Sync & Immediate DB Updates ---
    async function handleToggleUpdate(targetActiveState) {
        pageLoader.style.display = 'flex';
        
        const success = await saveTeacherRecord({
            active: targetActiveState
        });
        
        pageLoader.style.display = 'none';
        
        if (success) {
            showToast(`System active state set to ${targetActiveState ? 'ON' : 'OFF'} successfully!`);
        } else {
            showToast('Failed to sync active toggle to DB.', 'error');
            // Revert checkboxes locally on failure
            activeToggle.checked = !targetActiveState;
            enabledToggle.checked = !targetActiveState;
        }
    }

    activeToggle.addEventListener('change', () => {
        enabledToggle.checked = activeToggle.checked;
        handleToggleUpdate(activeToggle.checked);
    });

    enabledToggle.addEventListener('change', () => {
        activeToggle.checked = enabledToggle.checked;
        handleToggleUpdate(enabledToggle.checked);
    });

    // --- System Users CRUD ---
    async function fetchSystemUsers() {
        if (!currentTeacherRecord) return;
        systemUsersTableBody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 24px; color: var(--text-secondary);">Loading system users...</td></tr>`;

        try {
            const res = await fetch(SYSTEM_USERS_API, {
                headers: { 'x-api-key': X_API_KEY }
            });
            if (!res.ok) throw new Error('Failed to load system users');
            
            const data = await res.json();
            const list = Array.isArray(data) ? data : (data.items || []);
            
            systemUsersList = list.filter(u => u.teacher_id === currentTeacherRecord.teacher_id);
            renderSystemUsers();
        } catch (err) {
            console.error('Error fetching system users:', err);
            systemUsersList = [
                {
                    id: 'mock-1',
                    system_user_id: 'USR-1001',
                    name: 'Asela Perera',
                    phone_number: '0714455662',
                    pin: '8820',
                    teacher_id: currentTeacherRecord.teacher_id
                },
                {
                    id: 'mock-2',
                    system_user_id: 'USR-1002',
                    name: 'Nishanthi Fernando',
                    phone_number: '0772233441',
                    pin: '1093',
                    teacher_id: currentTeacherRecord.teacher_id
                }
            ];
            renderSystemUsers();
        }
    }

    function renderSystemUsers() {
        if (systemUsersList.length === 0) {
            systemUsersTableBody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 24px; color: var(--text-secondary);">No system users registered. Click "Add System User" to create one.</td></tr>`;
            return;
        }

        const roleBadgeColors = {
            Teacher: { bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe' },
            Admin:   { bg: '#fef3c7', color: '#92400e', border: '#fde68a' },
            Staff:   { bg: '#f0fdf4', color: '#15803d', border: '#bbf7d0' }
        };

        systemUsersTableBody.innerHTML = '';
        systemUsersList.forEach(user => {
            const roleName = user.role || 'Staff';
            const c = roleBadgeColors[roleName] || roleBadgeColors.Staff;
            const roleBadge = `<span style="display:inline-flex;align-items:center;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700;background:${c.bg};color:${c.color};border:1px solid ${c.border};">${roleName}</span>`;

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="padding: 12px 8px; font-weight: 500;">${user.system_user_id}</td>
                <td style="padding: 12px 8px;">${user.name}</td>
                <td style="padding: 12px 8px;">${user.phone_number || '-'}</td>
                <td style="padding: 12px 8px;">${roleBadge}</td>
                <td style="padding: 12px 8px;"><span class="badge-pin">${user.pin}</span></td>
                <td style="padding: 12px 8px; text-align: right;" class="actions-cell">
                    <button class="btn-action btn-edit" data-id="${user.id}">Edit</button>
                    <button class="btn-action btn-delete" data-id="${user.id}">Delete</button>
                </td>
            `;
            systemUsersTableBody.appendChild(tr);
        });

        systemUsersTableBody.querySelectorAll('.btn-edit').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.getAttribute('data-id');
                const user = systemUsersList.find(u => u.id === id);
                if (user) openUserModal(user);
            });
        });

        systemUsersTableBody.querySelectorAll('.btn-delete').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.getAttribute('data-id');
                const user = systemUsersList.find(u => u.id === id);
                if (user) openDeleteModal(user);
            });
        });
    }

    function openUserModal(user = null) {
        if (user) {
            userModalTitle.textContent = 'Edit System User';
            modalUserId.value = user.id;
            modalSystemUserId.value = user.system_user_id;
            modalSystemUserId.disabled = true;
            modalUserName.value = user.name;
            modalUserPhoneNumber.value = user.phone_number || '';
            modalUserRole.value = user.role || '';
            modalUserPin.value = user.pin;
        } else {
            userModalTitle.textContent = 'Add System User';
            modalUserId.value = '';
            modalSystemUserId.disabled = false;
            const randomId = 'USR-' + Math.floor(1000 + Math.random() * 9000);
            modalSystemUserId.value = randomId;
            modalUserName.value = '';
            modalUserPhoneNumber.value = '';
            modalUserRole.value = '';
            modalUserPin.value = '';
        }
        openModal(userModal);
    }

    function openDeleteModal(user) {
        userToDeleteId = user.id;
        deleteUserName.textContent = user.name;
        openModal(deleteUserModal);
    }

    closeUserModalBtn.addEventListener('click', () => closeModal(userModal));
    cancelUserModalBtn.addEventListener('click', () => closeModal(userModal));
    closeDeleteUserModalBtn.addEventListener('click', () => closeModal(deleteUserModal));
    cancelDeleteUserModalBtn.addEventListener('click', () => closeModal(deleteUserModal));

    addSystemUserBtn.addEventListener('click', () => openUserModal());

    userForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = modalUserId.value;
        const system_user_id = modalSystemUserId.value.trim();
        const name = modalUserName.value.trim();
        const phone_number = modalUserPhoneNumber.value.trim();
        const pin = modalUserPin.value.trim();
        const role = modalUserRole.value;

        if (!system_user_id || !name || !phone_number || !role || !pin) {
            showToast('All fields including Role are required.', 'error');
            return;
        }

        const saveBtn = document.getElementById('saveUserModalBtn');
        saveBtn.disabled = true;
        const origText = saveBtn.textContent;
        saveBtn.textContent = 'Saving...';

        const now = new Date().toISOString();
        const payload = {
            system_user_id,
            name,
            phone_number,
            pin,
            role,
            teacher_id: currentTeacherRecord.teacher_id,
            updated: now
        };

        let success = false;
        try {
            if (id) {
                payload.id = id;
                const existing = systemUsersList.find(u => u.id === id);
                payload.created = existing ? existing.created : now;

                const res = await fetch(`${SYSTEM_USERS_API}/${id}`, {
                    method: 'PUT',
                    headers: {
                        'x-api-key': X_API_KEY,
                        'content-type': 'application/json'
                    },
                    body: JSON.stringify(payload)
                });
                success = res.ok;
            } else {
                payload.created = now;
                const res = await fetch(SYSTEM_USERS_API, {
                    method: 'POST',
                    headers: {
                        'x-api-key': X_API_KEY,
                        'content-type': 'application/json'
                    },
                    body: JSON.stringify(payload)
                });
                success = res.ok;
            }
        } catch (err) {
            console.error('Error saving user:', err);
        }

        saveBtn.disabled = false;
        saveBtn.textContent = origText;

        if (success) {
            showToast(id ? 'System user updated successfully!' : 'System user created successfully!');
            closeModal(userModal);
            fetchSystemUsers();
        } else {
            showToast('Failed to save system user. Check constraint uniqueness.', 'error');
        }
    });

    confirmDeleteUserBtn.addEventListener('click', async () => {
        if (!userToDeleteId) return;

        confirmDeleteUserBtn.disabled = true;
        const origText = confirmDeleteUserBtn.textContent;
        confirmDeleteUserBtn.textContent = 'Deleting...';

        let success = false;
        try {
            const res = await fetch(`${SYSTEM_USERS_API}/${userToDeleteId}`, {
                method: 'DELETE',
                headers: { 'x-api-key': X_API_KEY }
            });
            success = res.ok;
        } catch (err) {
            console.error('Error deleting user:', err);
        }

        confirmDeleteUserBtn.disabled = false;
        confirmDeleteUserBtn.textContent = origText;

        if (success) {
            showToast('System user deleted successfully!');
            closeModal(deleteUserModal);
            fetchSystemUsers();
        } else {
            showToast('Failed to delete system user.', 'error');
        }
    });

    // --- Deactivate Account logic ---
    confirmDeactivateBtn.addEventListener('click', async () => {
        confirmDeactivateBtn.disabled = true;
        confirmDeactivateBtn.textContent = 'Deactivating...';

        // 1. Update active to false in DB
        const success = await saveTeacherRecord({
            active: false
        });

        if (success) {
            showToast('Account deactivated successfully. Logging out...', 'success');
            // 2. Clear Session localStorage
            localStorage.clear();
            
            // 3. Redirect back to login/activation
            setTimeout(() => {
                window.location.href = 'index.html';
            }, 2000);
        } else {
            showToast('Failed to deactivate account. Try again later.', 'error');
            confirmDeactivateBtn.disabled = false;
            confirmDeactivateBtn.textContent = 'Deactivate Account';
            closeModal(deactivateModal);
        }
    });

    // --- Logout logic ---
    const logoutBtn = document.getElementById('logoutBtn');
    logoutBtn.addEventListener('click', async () => {
        if (await window.customConfirm('Are you sure you want to log out? Active client registers will be disconnected.')) {
            localStorage.clear();
            showToast('Session cleared. Redirecting...', 'success');
            setTimeout(() => {
                window.location.href = 'index.html';
            }, 1000);
        }
    });

    // --- Run Init ---
    loadTeacherData();
});
