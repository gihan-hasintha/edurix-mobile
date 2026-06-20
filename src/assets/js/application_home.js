const API_URL = window.api?.env?.BASE_API_URL;
const X_API_KEY = window.api?.env?.X_API_KEY;

const activationDiv = document.getElementById('activation');
const dashboardNav = document.getElementById('navbar-for-application-content-righ-for-showing-visibilityof-logged-software');
const mainApplication = document.getElementById('main-application');
const schoolNameDisplay = document.getElementById('navbar-for-application-content-left-school-name');
const keyInput = document.getElementById('teacherKeyInput');
const activateBtn = document.getElementById('activateBtn');

// Check activation status on load
function checkActivation() {
    const activatedData = localStorage.getItem('Activated_Teacher') || localStorage.getItem('Activated_Institution');
    const loginWindow = document.getElementById('user-login-window');
    const loggedInUser = localStorage.getItem('LoggedInUser');

    if (activatedData) {
        activationDiv.style.display = 'none';
        
        if (loggedInUser) {
            // Logged in
            if (loginWindow) loginWindow.style.display = 'none';
            dashboardNav.style.display = 'block';
            if (mainApplication) mainApplication.style.display = 'block';
            
            try {
                const user = JSON.parse(loggedInUser);
                const dashUserName = document.getElementById('dash-user-name');
                if (dashUserName) dashUserName.textContent = user.name;
                
                const navName = document.querySelector('.navbar-for-application-content-righ-section-for-show-logged-user-name');
                if (navName) navName.textContent = user.name;
            } catch (e) {}
        } else {
            // Activated but not logged in
            if (loginWindow) loginWindow.style.display = 'block'; // or 'flex' depending on CSS
            dashboardNav.style.display = 'none';
            if (mainApplication) mainApplication.style.display = 'none';
        }
    } else {
        // Not activated
        activationDiv.style.display = 'flex';
        if (loginWindow) loginWindow.style.display = 'none';
        dashboardNav.style.display = 'none';
        if (mainApplication) mainApplication.style.display = 'none';
        schoolNameDisplay.textContent = 'Activation Required';
    }
}

async function handleActivation() {
    const key = keyInput.value.trim();
    if (!key) {
        alert('Please enter a Teacher Access KEY');
        return;
    }

    activateBtn.disabled = true;
    activateBtn.textContent = 'Verifying...';

    try {
        const response = await fetch(`${API_URL}/teachers`, {
            headers: { 'x-api-key': X_API_KEY }
        });

        if (!response.ok) throw new Error('Failed to fetch teachers');

        const data = await response.json();
        const teachers = Array.isArray(data) ? data : (data.items || []);

        const targetTeacher = teachers.find(t => t.TeacherKEY === key);

        if (targetTeacher) {
            const activationDetails = {
                teacher_id: targetTeacher.teacher_id,
                TeacherKEY: targetTeacher.TeacherKEY,
                teacher_shortcode: targetTeacher.teacher_shortcode
            };
            localStorage.setItem('Activated_Teacher', JSON.stringify(activationDetails));
            alert('Software Activated Successfully!');
            location.reload();
        } else {
            alert('Invalid Teacher Access KEY. Please check and try again.');
        }
    } catch (error) {
        console.error('Activation error:', error);
        alert('Verification failed. Please check your internet connection.');
    } finally {
        activateBtn.disabled = false;
        activateBtn.textContent = 'Activate now';
    }
}

activateBtn.addEventListener('click', handleActivation);

// Logout functionality
document.getElementById('logout-btn').addEventListener('click', async () => {
    if (await window.customConfirm('Are you sure you want to logout?')) {
        localStorage.removeItem('LoggedInUser');
        location.reload();
    }
});

// Allow activation on Enter key
keyInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleActivation();
});

// Initialize
checkActivation();

// --- Login Window Logic ---
const loginRoleSelect = document.getElementById('loginRoleSelect');
const loginUserSelect = document.getElementById('loginUserSelect');
const roleDropdownWrapper = document.getElementById('roleDropdownWrapper');
const userDropdownWrapper = document.getElementById('userDropdownWrapper');
const userDropdownOptions = document.getElementById('userDropdownOptions');
const userSelectedLabel = document.getElementById('userSelectedLabel')?.querySelector('span');
const roleSelectedLabel = document.getElementById('roleSelectedLabel')?.querySelector('span');
const SYSTEM_USERS_API = `${API_URL}/system_users`;

// Custom Dropdown UI Logic
function setupCustomDropdown(wrapper, selectElement, labelSpan) {
    if (!wrapper || !selectElement || !labelSpan) return;
    
    wrapper.addEventListener('click', (e) => {
        // Close others
        document.querySelectorAll('.custom-dropdown-wrapper').forEach(w => {
            if (w !== wrapper) w.classList.remove('open');
        });
        wrapper.classList.toggle('open');
        e.stopPropagation();
    });
    
    wrapper.querySelector('.custom-dropdown-options').addEventListener('click', (e) => {
        const optionDiv = e.target.closest('.custom-dropdown-option');
        if (!optionDiv || optionDiv.style.pointerEvents === 'none') return;
        
        // Update selected visual state
        wrapper.querySelectorAll('.custom-dropdown-option').forEach(opt => opt.classList.remove('selected'));
        optionDiv.classList.add('selected');
        
        const value = optionDiv.dataset.value;
        // Text is mostly from text node, avoiding innerHTML if it contains SVG
        const text = optionDiv.textContent.trim();
        
        labelSpan.textContent = text;
        selectElement.value = value;
        
        // Trigger change
        selectElement.dispatchEvent(new Event('change'));
    });
}

// Close dropdowns on outside click
document.addEventListener('click', () => {
    document.querySelectorAll('.custom-dropdown-wrapper').forEach(w => w.classList.remove('open'));
});

if (roleDropdownWrapper) setupCustomDropdown(roleDropdownWrapper, loginRoleSelect, roleSelectedLabel);
if (userDropdownWrapper) setupCustomDropdown(userDropdownWrapper, loginUserSelect, userSelectedLabel);

if (loginRoleSelect && loginUserSelect) {
    loginUserSelect.addEventListener('change', () => {
        const pwdInput = document.getElementById('loginPassword');
        if (pwdInput) {
            if (loginUserSelect.value) {
                pwdInput.disabled = false;
            } else {
                pwdInput.disabled = true;
                pwdInput.value = '';
            }
        }
    });

    loginRoleSelect.addEventListener('change', async (e) => {
        const selectedRole = e.target.value;
        
        // Reset the user select dropdown
        loginUserSelect.innerHTML = '<option value="">Select your name</option>';
        if (userSelectedLabel) userSelectedLabel.textContent = 'Loading users...';
        if (userDropdownOptions) userDropdownOptions.innerHTML = '<div class="custom-dropdown-option" style="color:#9ca3af; pointer-events:none;">Loading users...</div>';
        
        const pwdInput = document.getElementById('loginPassword');
        if (pwdInput) {
            pwdInput.disabled = true;
            pwdInput.value = '';
        }
        
        if (!selectedRole) {
            if (userSelectedLabel) userSelectedLabel.textContent = 'Select your name';
            if (userDropdownOptions) userDropdownOptions.innerHTML = '<div class="custom-dropdown-option" style="color:#9ca3af; pointer-events:none;">Select a role first</div>';
            return;
        }

        const activatedData = localStorage.getItem('Activated_Teacher') || localStorage.getItem('Activated_Institution');
        if (!activatedData) {
            if (userSelectedLabel) userSelectedLabel.textContent = 'System not activated';
            if (userDropdownOptions) userDropdownOptions.innerHTML = '<div class="custom-dropdown-option" style="color:#9ca3af; pointer-events:none;">System not activated</div>';
            return;
        }

        try {
            const session = JSON.parse(activatedData);
            const teacherId = session.teacher_id || session.institution_id;
            
            const res = await fetch(SYSTEM_USERS_API, {
                headers: { 'x-api-key': X_API_KEY }
            });
            
            if (!res.ok) throw new Error('Failed to load system users');
            
            const data = await res.json();
            const allUsers = Array.isArray(data) ? data : (data.items || []);
            
            // Filter users by teacher_id and the selected role
            const filteredUsers = allUsers.filter(u => 
                u.teacher_id === teacherId && 
                u.role === selectedRole
            );
            
            if (userSelectedLabel) userSelectedLabel.textContent = 'Select your name';
            if (userDropdownOptions) userDropdownOptions.innerHTML = '';
            
            if (filteredUsers.length === 0) {
                if (userDropdownOptions) userDropdownOptions.innerHTML = `<div class="custom-dropdown-option" style="color:#9ca3af; pointer-events:none;">No ${selectedRole}s found</div>`;
            } else {
                filteredUsers.forEach(user => {
                    const val = user.system_user_id || user.id;
                    
                    // Native option
                    const option = document.createElement('option');
                    option.value = val;
                    option.textContent = user.name;
                    option.dataset.pin = user.pin;
                    loginUserSelect.appendChild(option);
                    
                    // Custom option
                    if (userDropdownOptions) {
                        const div = document.createElement('div');
                        div.className = 'custom-dropdown-option';
                        div.dataset.value = val;
                        div.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg> ${user.name}`;
                        userDropdownOptions.appendChild(div);
                    }
                });
            }
            
        } catch (err) {
            console.error('Error loading users for login:', err);
            if (userSelectedLabel) userSelectedLabel.textContent = 'Failed to load users';
            if (userDropdownOptions) userDropdownOptions.innerHTML = '<div class="custom-dropdown-option" style="color:#ef4444; pointer-events:none;">Error loading users</div>';
        }
    });
}

// --- Toggle Password Visibility ---
const togglePasswordVisibility = document.getElementById('togglePasswordVisibility');
const loginPassword = document.getElementById('loginPassword');

if (togglePasswordVisibility && loginPassword) {
    togglePasswordVisibility.addEventListener('click', () => {
        // Toggle the type attribute
        const type = loginPassword.getAttribute('type') === 'password' ? 'text' : 'password';
        loginPassword.setAttribute('type', type);
        
        // Toggle the eye icon visually
        if (type === 'text') {
            togglePasswordVisibility.innerHTML = `
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                <line x1="1" y1="1" x2="23" y2="23"></line>
            `;
        } else {
            togglePasswordVisibility.innerHTML = `
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                <circle cx="12" cy="12" r="3"></circle>
            `;
        }
    });
}

// --- Login Button Click Logic ---
const loginBtn = document.getElementById('loginBtn');
if (loginBtn && loginPassword && loginUserSelect && loginRoleSelect) {
    loginBtn.addEventListener('click', () => {
        const selectedUserId = loginUserSelect.value;
        const enteredPassword = loginPassword.value;
        
        if (!selectedUserId) {
            if (window.customAlert) window.customAlert('Please select a user name first.', 'error');
            else alert('Please select a user name first.');
            return;
        }
        
        if (!enteredPassword) {
            if (window.customAlert) window.customAlert('Please enter your password.', 'error');
            else alert('Please enter your password.');
            return;
        }
        
        // Get the selected option element from the native select to check the stored PIN
        const selectedOption = loginUserSelect.options[loginUserSelect.selectedIndex];
        const storedPin = selectedOption.dataset.pin;
        const userName = selectedOption.textContent;
        const role = loginRoleSelect.value;
        
        if (enteredPassword === storedPin) {
            // Correct Password
            const userData = {
                id: selectedUserId,
                name: userName,
                role: role
            };
            
            localStorage.setItem('LoggedInUser', JSON.stringify(userData));
            
            // Hide login window and show application
            const loginWindow = document.getElementById('user-login-window');
            if (loginWindow) loginWindow.style.display = 'none';
            
            if (typeof dashboardNav !== 'undefined') dashboardNav.style.display = 'block';
            if (typeof mainApplication !== 'undefined') mainApplication.style.display = 'block';
            
            const dashUserName = document.getElementById('dash-user-name');
            if (dashUserName) dashUserName.textContent = userName;
            
            const navName = document.querySelector('.navbar-for-application-content-righ-section-for-show-logged-user-name');
            if (navName) navName.textContent = userName;
            
            if (window.customAlert) window.customAlert('Login successful! Welcome back.', 'success');
        } else {
            // Incorrect Password
            if (window.customAlert) window.customAlert('Incorrect password. Please try again.', 'error');
            else alert('Incorrect password. Please try again.');
            loginPassword.value = ''; // Clear password field
        }
    });
    
    // Allow pressing Enter in password field to login
    loginPassword.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            loginBtn.click();
        }
    });
}

// Mobile Sidebar Toggle
const mobileMenuToggle = document.getElementById('mobileMenuToggle');
const mobileSidebar = document.getElementById('mobileSidebar');

if (mobileMenuToggle && mobileSidebar) {
    // Create overlay dynamically
    let sidebarOverlay = document.getElementById('sidebarOverlay');
    if (!sidebarOverlay) {
        sidebarOverlay = document.createElement('div');
        sidebarOverlay.id = 'sidebarOverlay';
        sidebarOverlay.className = 'sidebar-overlay';
        document.body.appendChild(sidebarOverlay);
    }

    mobileMenuToggle.addEventListener('click', () => {
        mobileSidebar.classList.toggle('open');
        sidebarOverlay.classList.toggle('active');
    });

    // Close sidebar when clicking outside
    document.addEventListener('click', (e) => {
        if (!mobileMenuToggle.contains(e.target) && !mobileSidebar.contains(e.target)) {
            mobileSidebar.classList.remove('open');
            sidebarOverlay.classList.remove('active');
        }
    });
}
