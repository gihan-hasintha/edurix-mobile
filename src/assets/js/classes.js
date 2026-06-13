const API_URL_BASE = window.api.env.API_URL.replace('/students', '');
const STUDENTS_API = window.api.env.API_URL;
const CLASSES_API = `${API_URL_BASE}/classes`;
const CLASS_STUDENTS_API = `${API_URL_BASE}/class_students`;
const X_API_KEY = '996de2d470a0f1e9794b7778e216c193258aac001b36813f9ad1d3f957cc7ee7';

let allClasses = [];
let allEnrollments = [];
let allStudents = [];
let editingClassId = null;

// Get activated teacher/institution ID
function getActivatedId() {
    const activatedData = localStorage.getItem('Activated_Teacher') || localStorage.getItem('Activated_Institution');
    if (!activatedData) return null;
    const stored = JSON.parse(activatedData);
    return stored.teacher_id || stored.institution_id;
}

async function fetchClasses() {
    const currentId = getActivatedId();
    if (!currentId) {
        document.getElementById('main-application').innerHTML = `
            <div style="padding: 40px; text-align: center;">
                <h2>Activation Required</h2>
                <p>Please activate your account to view class data.</p>
            </div>
        `;
        return;
    }

    try {
        // Show loader if hidden
        document.getElementById('loader').classList.remove('hidden');
        
        // Fetch classes, enrollments, and students in parallel
        const [classesRes, enrollmentsRes, studentsRes] = await Promise.all([
            fetch(CLASSES_API, { headers: { 'x-api-key': X_API_KEY } }),
            fetch(CLASS_STUDENTS_API, { headers: { 'x-api-key': X_API_KEY } }),
            fetch(STUDENTS_API, { headers: { 'x-api-key': X_API_KEY } })
        ]);

        if (!classesRes.ok || !enrollmentsRes.ok || !studentsRes.ok) throw new Error('Failed to fetch data');

        const classesData = await classesRes.json();
        const enrollmentsData = await enrollmentsRes.json();
        const studentsData = await studentsRes.json();

        const classesItems = Array.isArray(classesData) ? classesData : (classesData.items || []);
        allClasses = classesItems.filter(cls => cls.teacher_id === currentId);
        
        allEnrollments = Array.isArray(enrollmentsData) ? enrollmentsData : (enrollmentsData.items || []);
        allStudents = Array.isArray(studentsData) ? studentsData : (studentsData.items || []);

        populateLocationFilter();
        renderClasses(allClasses);
        
        // Check if we need to open edit modal from URL
        const urlParams = new URLSearchParams(window.location.search);
        const editClassId = urlParams.get('edit');
        if (editClassId) {
            // Slight timeout to ensure modal elements are ready
            setTimeout(() => {
                openEditModal(editClassId);
                // Remove param from URL
                window.history.replaceState({}, document.title, window.location.pathname);
            }, 100);
        }
    } catch (error) {
        console.error('Error fetching data:', error);
        document.getElementById('classesListContainer').innerHTML = '<div style="text-align: center; padding: 20px; color: red;">Failed to load classes.</div>';
    } finally {
        document.getElementById('loader').classList.add('hidden');
    }
}

function renderClasses(classes) {
    const listContainer = document.getElementById('classesListContainer');
    listContainer.innerHTML = '';

    if (classes.length === 0) {
        listContainer.innerHTML = '<div style="text-align: center; padding: 20px; color: #666;">No classes found.</div>';
        return;
    }

    classes.forEach(cls => {
        // Count enrolled students for this class
        const count = allEnrollments.filter(r => String(r.class_id) === String(cls.id)).length;

        // Removed icon logic as requested

        const card = document.createElement('div');
        card.className = 'mobile-class-card';
        card.innerHTML = `
            <div class="card-main-content">
                <div class="card-left-section">
                    <div class="card-details">
                        <h3>${cls.name || 'N/A'}</h3>
                        <p class="location-text">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
                            ${cls.location || 'N/A'}
                        </p>
                        <div><span class="day-pill">${(cls.classdate || 'N/A').toUpperCase()}</span></div>
                    </div>
                </div>
                
                <div class="card-middle">
                    <div class="time-block">
                        <span class="time-pill start">${cls.classtime || 'N/A'}</span>
                        <span class="time-sep">-</span>
                        <span class="time-pill end">${cls.class_endtime || 'N/A'}</span>
                    </div>
                    <div class="students-count" onclick="viewStudents('${cls.id}', '${cls.name}')">
                        ${count} Students
                    </div>
                </div>

                <div class="fee-col">
                    <div class="fee-amount">${cls.fee_amount ? parseFloat(cls.fee_amount).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2}) : '0.00'}</div>
                    <div class="fee-type">${cls.payment_type || 'N/A'}</div>
                </div>
            </div>
            
            <div class="card-actions-bottom">
                <button class="btn-grid btn-edit" onclick="openEditModal('${cls.id}')">Edit</button>
                <button class="btn-grid btn-view" onclick="viewStudents('${cls.id}', '${cls.name}')">View</button>
                <button class="btn-grid btn-enroll" onclick="manageStudents('${cls.id}')">Enroll</button>
                <button class="btn-grid btn-delete" onclick="deleteClass('${cls.id}')">Delete</button>
            </div>
        `;
        listContainer.appendChild(card);
    });
}

function viewStudents(classId, className) {
    const modal = document.getElementById('viewStudentsModal');
    const title = document.getElementById('viewClassName');
    const list = document.getElementById('enrolledStudentsList');
    
    title.textContent = `Enrolled in: ${className}`;
    modal.style.display = 'flex';
    list.innerHTML = '<div class="loader"></div>';

    // Filter enrollments for this class
    const classEnrollments = allEnrollments.filter(r => String(r.class_id) === String(classId));
    
    // Match with student names
    const enrolledStudents = classEnrollments.map(enrollment => {
        const student = allStudents.find(s => String(s.id) === String(enrollment.student_id));
        return student || { student_name: 'Unknown Student', student_id: enrollment.student_id };
    });

    setTimeout(() => {
        list.innerHTML = '';
        if (enrolledStudents.length === 0) {
            list.innerHTML = '<p style="text-align: center; color: #999;">No students enrolled in this class.</p>';
            return;
        }

        enrolledStudents.forEach(s => {
            const div = document.createElement('div');
            div.className = 'mini-student-item';
            div.innerHTML = `
                <div class="mini-student-info">
                    <img src="${s.student_photo || './assets/img/student-blank-image.jpg'}" class="mini-student-img" onerror="this.src='./assets/img/student-blank-image.jpg'">
                    <div class="mini-student-details">
                        <strong>${s.student_name}</strong>
                        <small>ID: ${s.student_id || 'N/A'}</small>
                    </div>
                </div>
                <span class="enrolled-status">Enrolled</span>
            `;
            list.appendChild(div);
        });
    }, 300);
}

function closeViewModal() {
    document.getElementById('viewStudentsModal').style.display = 'none';
}

// Modal functions
function openModal() {
    editingClassId = null;
    document.getElementById('classForm').reset();
    
    // Sync custom dropdowns to default state
    updateCustomSelectDisplay('classdate', '');
    updateCustomSelectDisplay('payment_type', 'Monthly');

    document.querySelector('#classModal .modal-header h2').textContent = 'Add New Class';
    document.getElementById('saveBtn').textContent = 'Save Class';
    document.getElementById('classModal').style.display = 'flex';
}

function openEditModal(classId) {
    const cls = allClasses.find(c => String(c.id) === String(classId));
    if (!cls) return;

    editingClassId = cls.id;
    
    document.getElementById('name').value = cls.name || '';
    document.getElementById('location').value = cls.location || '';
    document.getElementById('classdate').value = cls.classdate || '';
    document.getElementById('classtime').value = cls.classtime || '';
    document.getElementById('class_endtime').value = cls.class_endtime || '';
    document.getElementById('fee_amount').value = cls.fee_amount || '';
    document.getElementById('payment_type').value = cls.payment_type || 'Monthly';

    // Sync custom dropdowns with loaded data
    updateCustomSelectDisplay('classdate', cls.classdate || '');
    updateCustomSelectDisplay('payment_type', cls.payment_type || 'Monthly');

    document.querySelector('#classModal .modal-header h2').textContent = 'Edit Class';
    document.getElementById('saveBtn').textContent = 'Update Class';
    
    document.getElementById('classModal').style.display = 'flex';
}

function closeModal() {
    document.getElementById('classModal').style.display = 'none';
    document.getElementById('classForm').reset();
    editingClassId = null;
}

async function deleteClass(classId) {
    if (!(await window.customConfirm('Are you sure you want to delete this class? This action cannot be undone.'))) {
        return;
    }

    try {
        const response = await fetch(`${CLASSES_API}/${classId}`, {
            method: 'DELETE',
            headers: {
                'x-api-key': X_API_KEY
            }
        });

        if (!response.ok) throw new Error('Failed to delete class');

        fetchClasses();
    } catch (error) {
        console.error('Error deleting class:', error);
        alert('Failed to delete class. Please try again.');
    }
}

// Form submission
document.getElementById('classForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const currentId = getActivatedId();
    if (!currentId) return;

    const saveBtn = document.getElementById('saveBtn');
    saveBtn.disabled = true;
    saveBtn.textContent = editingClassId ? 'Updating...' : 'Saving...';

    const now = new Date().toISOString();

    const payload = {
        name: document.getElementById('name').value,
        location: document.getElementById('location').value,
        classdate: document.getElementById('classdate').value,
        classtime: document.getElementById('classtime').value,
        class_endtime: document.getElementById('class_endtime').value,
        fee_amount: parseFloat(document.getElementById('fee_amount').value),
        payment_type: document.getElementById('payment_type').value,
        teacher_id: currentId,
        updated: now
    };

    if (!editingClassId) {
        payload.created = now;
    } else {
        // If updating, preserve the original created date if available
        const cls = allClasses.find(c => String(c.id) === String(editingClassId));
        if (cls && cls.created) {
            payload.created = cls.created;
        }
    }

    try {
        const url = editingClassId ? `${CLASSES_API}/${editingClassId}` : CLASSES_API;
        const method = editingClassId ? 'PUT' : 'POST';

        const response = await fetch(url, {
            method: method,
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': X_API_KEY
            },
            body: JSON.stringify(payload)
        });

        if (response.ok) {
            closeModal();
            fetchClasses(); // Refresh list
        } else {
            alert('Failed to save class. Please try again.');
        }
    } catch (error) {
        console.error('Error saving class:', error);
        alert('Network error. Please check your connection.');
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = editingClassId ? 'Update Class' : 'Save Class';
    }
});

// Populate Location Filter dynamically
function populateLocationFilter() {
    const locationFilter = document.getElementById('locationFilter');
    if (!locationFilter) return;

    const currentSelection = locationFilter.value;
    
    // Group by case-insensitive and trimmed names
    const locationMap = new Map();
    allClasses.forEach(cls => {
        if (!cls.location) return;
        const trimmed = cls.location.trim();
        if (trimmed === '') return;
        const lower = trimmed.toLowerCase();
        if (!locationMap.has(lower)) {
            locationMap.set(lower, trimmed); // Keep original casing for display
        }
    });

    // Sort locations alphabetically case-insensitive
    const locations = Array.from(locationMap.values()).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

    locationFilter.innerHTML = '<option value="All">All Locations</option>';
    locations.forEach(loc => {
        const option = document.createElement('option');
        option.value = loc;
        option.textContent = loc;
        locationFilter.appendChild(option);
    });

    if (locations.includes(currentSelection)) {
        locationFilter.value = currentSelection;
    } else {
        const currentLower = (currentSelection || '').toLowerCase();
        if (locationMap.has(currentLower)) {
            locationFilter.value = locationMap.get(currentLower);
        }
    }
}

// Search and Filter functionality
function applyFilters() {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();
    const locationFilter = document.getElementById('locationFilter') ? document.getElementById('locationFilter').value : 'All';
    const weekdayFilter = document.getElementById('weekdayFilter') ? document.getElementById('weekdayFilter').value : 'All';
    const paymentTypeFilter = document.getElementById('paymentTypeFilter') ? document.getElementById('paymentTypeFilter').value : 'All';

    const filtered = allClasses.filter(cls => {
        const matchesSearch = !searchTerm || (cls.name && cls.name.toLowerCase().includes(searchTerm));
        
        let matchesLocation = true;
        if (locationFilter !== 'All') {
            const loc = (cls.location || '').trim().toLowerCase();
            matchesLocation = loc === locationFilter.toLowerCase();
        }

        const matchesWeekday = weekdayFilter === 'All' || cls.classdate === weekdayFilter;
        const matchesPayment = paymentTypeFilter === 'All' || cls.payment_type === paymentTypeFilter;
        
        return matchesSearch && matchesLocation && matchesWeekday && matchesPayment;
    });

    renderClasses(filtered);
}

document.getElementById('searchInput').addEventListener('input', applyFilters);
if (document.getElementById('locationFilter')) {
    document.getElementById('locationFilter').addEventListener('change', applyFilters);
}
if (document.getElementById('weekdayFilter')) {
    document.getElementById('weekdayFilter').addEventListener('change', applyFilters);
}
if (document.getElementById('paymentTypeFilter')) {
    document.getElementById('paymentTypeFilter').addEventListener('change', applyFilters);
}

// Navigate to student management
function manageStudents(classId) {
    window.location.href = `class-attendance.html?class_id=${classId}`;
}

// Initialize
fetchClasses();

// --- Custom Select Logic ---
function toggleDropdown(dropdownId) {
    const dropdown = document.getElementById(dropdownId);
    if (!dropdown) return;
    const trigger = dropdown.previousElementSibling;
    
    // Close others
    document.querySelectorAll('.custom-select-dropdown').forEach(el => {
        if (el.id !== dropdownId) {
            el.classList.remove('show');
            el.previousElementSibling.classList.remove('active');
        }
    });

    dropdown.classList.toggle('show');
    trigger.classList.toggle('active');
}

function selectOption(selectId, value, text, optionElement) {
    // Update hidden select
    const select = document.getElementById(selectId);
    if (select) {
        select.value = value;
    }
    
    // Update display text
    const display = document.getElementById(selectId + '-display');
    if (display) {
        display.textContent = text;
        display.parentElement.classList.remove('placeholder-text');
    }
    
    // Update selected class
    const dropdown = document.getElementById(selectId + '-dropdown');
    if (dropdown) {
        dropdown.querySelectorAll('.custom-option').forEach(opt => opt.classList.remove('selected'));
        optionElement.classList.add('selected');
        
        // Close dropdown
        dropdown.classList.remove('show');
        dropdown.previousElementSibling.classList.remove('active');
    }
}

// Close dropdowns on outside click
document.addEventListener('click', function(e) {
    if (!e.target.closest('.custom-select-container')) {
        document.querySelectorAll('.custom-select-dropdown').forEach(el => {
            el.classList.remove('show');
            el.previousElementSibling.classList.remove('active');
        });
    }
});

function updateCustomSelectDisplay(selectId, value) {
    const select = document.getElementById(selectId);
    if (!select) return;
    
    const display = document.getElementById(selectId + '-display');
    const dropdown = document.getElementById(selectId + '-dropdown');
    
    if (!display || !dropdown) return;
    
    if (value) {
        display.textContent = value;
        display.parentElement.classList.remove('placeholder-text');
        
        dropdown.querySelectorAll('.custom-option').forEach(opt => {
            if (opt.getAttribute('data-value') === value) {
                opt.classList.add('selected');
            } else {
                opt.classList.remove('selected');
            }
        });
    } else {
        if (selectId === 'classdate') {
            display.textContent = 'Select Weekday';
            display.parentElement.classList.add('placeholder-text');
            dropdown.querySelectorAll('.custom-option').forEach(opt => opt.classList.remove('selected'));
        }
    }
}

// Expose functions to global scope for HTML inline handlers
window.openModal = openModal;
if (typeof closeModal === 'function') window.closeModal = closeModal;
window.viewStudents = viewStudents;
window.closeViewModal = closeViewModal;
window.manageStudents = manageStudents;
if (typeof deleteClass === 'function') window.deleteClass = deleteClass;
if (typeof openEditModal === 'function') window.openEditModal = openEditModal;
window.toggleDropdown = toggleDropdown;
window.selectOption = selectOption;
