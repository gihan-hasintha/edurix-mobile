
        const API_URL = window.api.env.API_URL;
        const CLASS_STUDENTS_API = API_URL.replace('/students', '/class_students');
        const CLASSES_API = API_URL.replace('/students', '/classes');
        let allStudents = [];
        let allClasses = [];
        let allEnrollments = [];

        async function fetchStudents() {
            const activatedData = localStorage.getItem('Activated_Teacher') || localStorage.getItem('Activated_Institution');
            if (!activatedData) {
                const studentTableContainer = document.getElementById('studentTableContainer');
                studentTableContainer.innerHTML = `
                <div style="padding: 40px; text-align: center; color: var(--text-secondary);">
                    <h2> activation required</h2>
                    <p>Please activate your account to view student data.</p>
                </div>
            `;
                return;
            }
            const tableBody = document.getElementById('studentTableBody');
            const loader = document.getElementById('loader');
            const errorMessage = document.getElementById('errorMessage');
            const studentCount = document.getElementById('studentCount');

            try {
                const response = await fetch(API_URL, {
                    headers: { 'x-api-key': '996de2d470a0f1e9794b7778e216c193258aac001b36813f9ad1d3f957cc7ee7' }
                });
                if (!response.ok) throw new Error('Failed to fetch');

                const data = await response.json();
                
                // Filter students by current teacher ID
                const stored = JSON.parse(activatedData);
                const currentId = stored.teacher_id || stored.institution_id;
                allStudents = data.filter(student => (student.teacher_id === currentId) || (student.institution_id === currentId));

                // Fetch classes and enrollments for filtering and viewing
                try {
                    const [classesRes, enrollmentsRes] = await Promise.all([
                        fetch(CLASSES_API, { headers: { 'x-api-key': '996de2d470a0f1e9794b7778e216c193258aac001b36813f9ad1d3f957cc7ee7' } }),
                        fetch(CLASS_STUDENTS_API, { headers: { 'x-api-key': '996de2d470a0f1e9794b7778e216c193258aac001b36813f9ad1d3f957cc7ee7' } })
                    ]);
                    if (classesRes.ok && enrollmentsRes.ok) {
                        const classesData = await classesRes.json();
                        const enrollmentsData = await enrollmentsRes.json();
                        allClasses = Array.isArray(classesData) ? classesData : (classesData.items || []);
                        allEnrollments = Array.isArray(enrollmentsData) ? enrollmentsData : (enrollmentsData.items || []);
                        
                        // Filter classes by teacher
                        allClasses = allClasses.filter(c => c.teacher_id === currentId || c.institution_id === currentId);
                        populateClassFilter();
                    }
                } catch (e) {
                    console.error('Failed to load class data for filters');
                }

                loader.classList.add('hidden');
                errorMessage.classList.add('hidden');
                applyFilters();
            } catch (error) {
                console.error('Error fetching students:', error);
                loader.classList.add('hidden');
                errorMessage.classList.remove('hidden');
            }
        }

        function renderStudents(students) {
            const container = document.getElementById('studentCardsContainer');
            if (!container) return;
            container.innerHTML = '';

            if (students.length === 0) {
                container.innerHTML = '<div style="text-align: center; padding: 30px; color: #64748b;">No students found.</div>';
                return;
            }

            students.forEach(student => {
                const photoHtml = student.student_photo
                    ? `<img src="${student.student_photo}" onerror="this.src='./assets/img/student-blank-image.jpg'" style="width: 100%; height: 100%; object-fit: cover; display: block;">`
                    : `<img src="./assets/img/student-blank-image.jpg" style="width: 100%; height: 100%; object-fit: cover; display: block;">`;

                const birthday = student.birthday ? new Date(student.birthday).toLocaleDateString() : 'N/A';
                
                let typeColor = student.class_type === 'Online' ? '#3b82f6' : (student.class_type === 'Both' ? '#8b5cf6' : '#10b981');
                let classTypeHtml = student.class_type ? `<span style="background: ${typeColor}20; color: ${typeColor}; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: bold; margin-left: 8px;">${student.class_type.toUpperCase()}</span>` : '';

                const card = document.createElement('div');
                card.style.cssText = 'background: white; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; display: flex; flex-direction: column; gap: 10px; box-shadow: 0 1px 3px rgba(0,0,0,0.02);';
                
                card.innerHTML = `
                    <div style="display: flex; align-items: flex-start; justify-content: space-between;">
                        <div style="display: flex; align-items: center; gap: 12px; overflow: hidden;">
                            <div style="width: 48px; height: 48px; min-width: 48px; flex-shrink: 0; border-radius: 50%; overflow: hidden; background: #e2e8f0;">
                                ${photoHtml}
                            </div>
                            <div style="display: flex; flex-direction: column; gap: 4px; overflow: hidden;">
                                <span style="background: #f1f5f9; color: #64748b; font-size: 11px; padding: 2px 6px; border-radius: 4px; align-self: flex-start; font-weight: 600;">${student.student_id || 'N/A'}</span>
                                <span style="font-weight: 600; font-size: 14px; color: #1e293b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${student.student_name || 'N/A'}${classTypeHtml}</span>
                            </div>
                        </div>
                        <div style="display: flex; align-items: center; gap: 6px; padding-top: 4px; flex-shrink: 0;">
                            <button class="action-btn" onclick="viewStudentClasses('${student.id}')" title="View Joined Classes" style="color: #10b981; padding: 4px; border: none; background: none; cursor: pointer;">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path></svg>
                            </button>
                            <button class="action-btn edit-btn" onclick="editStudent('${student.id}')" title="Edit Student" style="color: #3b82f6; padding: 4px; border: none; background: none; cursor: pointer;">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                            </button>
                            <button class="action-btn delete-btn" onclick="deleteStudent('${student.id}')" title="Delete Student" style="color: #ef4444; padding: 4px; border: none; background: none; cursor: pointer;">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                            </button>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-left: 4px;"><polyline points="9 18 15 12 9 6"></polyline></svg>
                        </div>
                    </div>
                    <div style="display: flex; align-items: center; gap: 8px; margin-top: 4px; margin-left: 60px;">
                        <div style="display: flex; align-items: center; gap: 4px; flex: 1; overflow: hidden;">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0;"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
                            <span style="color: #3b82f6; font-size: 12px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${student.phone_number || 'N/A'}</span>
                        </div>
                        <div style="width: 1px; height: 12px; background: #e2e8f0; flex-shrink: 0;"></div>
                        <div style="display: flex; align-items: center; gap: 4px; flex: 1; overflow: hidden;">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0;"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                            <span style="color: #64748b; font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${student.parent_name || 'N/A'}</span>
                        </div>
                        <div style="width: 1px; height: 12px; background: #e2e8f0; flex-shrink: 0;"></div>
                        <div style="display: flex; align-items: center; gap: 4px; flex: 1; overflow: hidden;">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0;"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                            <span style="color: #64748b; font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${birthday}</span>
                        </div>
                    </div>
                `;
                container.appendChild(card);
            });
        }

        function populateClassFilter() {
            const classFilter = document.getElementById('classFilter');
            if (!classFilter) return;
            classFilter.innerHTML = '<option value="All">All Classes</option>';
            
            const sortedClasses = [...allClasses].sort((a,b) => (a.name || '').localeCompare(b.name || ''));
            sortedClasses.forEach(c => {
                const option = document.createElement('option');
                option.value = c.id;
                option.textContent = c.name;
                classFilter.appendChild(option);
            });
        }

        // Filtering & Sorting functionality
        function applyFilters() {
            const searchTerm = document.getElementById('searchInput').value.toLowerCase();
            const classFilter = document.getElementById('classFilter') ? document.getElementById('classFilter').value : 'All';
            const statusFilter = document.getElementById('statusFilter').value;
            const typeFilter = document.getElementById('typeFilter') ? document.getElementById('typeFilter').value : 'All';
            const sortFilter = document.getElementById('sortFilter').value;

            let filtered = allStudents.filter(student => {
                const matchSearch = !searchTerm ||
                    (student.student_name && student.student_name.toLowerCase().includes(searchTerm)) ||
                    (student.phone_number && student.phone_number.includes(searchTerm)) ||
                    (student.parent_name && student.parent_name.toLowerCase().includes(searchTerm)) ||
                    (student.nfc_number && student.nfc_number.toLowerCase().includes(searchTerm));
                
                let status = student.student_status || 'Active';
                let matchStatus = status === statusFilter;

                let matchClass = true;
                if (classFilter !== 'All') {
                    matchClass = allEnrollments.some(e => String(e.student_id) === String(student.id) && String(e.class_id) === classFilter);
                }
                
                let matchType = true;
                if (typeFilter !== 'All' && typeFilter !== 'all') {
                    let studentType = student.class_type || 'Physical';
                    matchType = studentType === typeFilter;
                }

                return matchSearch && matchStatus && matchClass && matchType;
            });

            if (sortFilter === 'Name') {
                filtered.sort((a, b) => {
                    const nameA = (a.student_name || '').toLowerCase();
                    const nameB = (b.student_name || '').toLowerCase();
                    return nameA.localeCompare(nameB);
                });
            } else if (sortFilter === 'Recent') {
                // Sort by ID descending to show newest first
                filtered.sort((a, b) => {
                    const idA = a.student_id || '';
                    const idB = b.student_id || '';
                    return idB.localeCompare(idA);
                });
            }

            renderStudents(filtered);
            document.getElementById('studentCount').textContent = `Total Students: ${filtered.length}`;
        }

        document.getElementById('searchInput').addEventListener('input', function(e) {
            applyFilters();
            const clearBtn = document.getElementById('clearSearchBtn');
            if (clearBtn) {
                clearBtn.style.display = e.target.value.length > 0 ? 'flex' : 'none';
            }
        });

        window.clearSearch = function() {
            const input = document.getElementById('searchInput');
            if (input) {
                input.value = '';
                applyFilters();
            }
            const clearBtn = document.getElementById('clearSearchBtn');
            if (clearBtn) {
                clearBtn.style.display = 'none';
            }
            if (input) input.focus();
        };

        if(document.getElementById('classFilter')) document.getElementById('classFilter').addEventListener('change', applyFilters);
        document.getElementById('statusFilter').addEventListener('change', applyFilters);
        if(document.getElementById('typeFilter')) document.getElementById('typeFilter').addEventListener('change', applyFilters);
        document.getElementById('sortFilter').addEventListener('change', applyFilters);

        // Initialize
        fetchStudents();

        window.viewStudentClasses = async function(id) {
            const student = allStudents.find(s => String(s.id) === String(id));
            if (!student) return;

            document.getElementById('viewStudentName').innerText = `Enrolled Classes: ${student.student_name || 'Student'}`;
            const modal = document.getElementById('viewClassesModal');
            const list = document.getElementById('enrolledClassesList');
            const loader = document.getElementById('viewLoader');

            modal.style.display = 'flex';
            list.innerHTML = '';
            document.getElementById('enrolledClassesCount').innerText = 'Total Enrolled: 0';

            // Use globally fetched enrollments and classes
            const studentEnrollments = allEnrollments.filter(e => String(e.student_id) === String(id));
            
            document.getElementById('enrolledClassesCount').innerText = `Total Enrolled: ${studentEnrollments.length}`;

            if (studentEnrollments.length === 0) {
                list.innerHTML = '<div style="text-align: center; color: #888; padding: 20px;">Not enrolled in any classes.</div>';
                return;
            }

            studentEnrollments.forEach(enrollment => {
                const cls = allClasses.find(c => String(c.id) === String(enrollment.class_id));
                if (!cls) return;

                const item = document.createElement('div');
                item.style.cssText = 'display: flex; justify-content: space-between; align-items: center; padding: 12px; border: 1px solid #eee; border-radius: 6px; margin-bottom: 8px; background: #fff;';
                item.innerHTML = `
                    <div style="display: flex; flex-direction: column;">
                        <span style="font-weight: 600; font-size: 14px; color: #333;">${cls.name}</span>
                        <span style="font-size: 12px; color: #888;">${cls.classdate} ${cls.classtime}</span>
                    </div>
                    <span style="background: #d1fae5; color: #065f46; padding: 4px 8px; border-radius: 4px; font-size: 10px; font-weight: bold; letter-spacing: 0.5px;">ENROLLED</span>
                `;
                list.appendChild(item);
            });
        };

        window.scancardfunbt = function() {
            const nfcWindow = document.getElementById('nfc-scanning-window');
            if (nfcWindow) {
                nfcWindow.style.display = 'block';
                nfcWindow.onclick = () => {
                    const n = document.getElementById('nfc-number');
                    if (n) n.focus();
                };
            }
            const nfcInput = document.getElementById('nfc-number');
            if (nfcInput) {
                nfcInput.value = '';
                setTimeout(() => { nfcInput.focus(); }, 50);
            }
        };

        window.closeNfcScanner = function() {
            const nfcWindow = document.getElementById('nfc-scanning-window');
            if (nfcWindow) {
                nfcWindow.style.display = 'none';
            }
        };

        const nfcInput = document.getElementById('nfc-number');
        if (nfcInput) {
            nfcInput.addEventListener('input', function(e) {
                const val = e.target.value.trim();
                if (val.length >= 8) {
                    closeNfcScanner();
                    document.getElementById('searchInput').value = val;
                    const clearBtn = document.getElementById('clearSearchBtn');
                    if (clearBtn) clearBtn.style.display = 'flex';
                    applyFilters();
                    e.target.value = '';
                }
            });
        }

        window.closeViewModal = function() {
            document.getElementById('viewClassesModal').style.display = 'none';
        };

        window.editStudent = function(id) {
            console.log('Edit student:', id);
            window.open(`student-details-edit.html?id=${id}`, '_blank');
        };

        window.deleteStudent = async function(id) {
            console.log('Delete student:', id);
            if(await window.customConfirm('Are you sure you want to delete this student?')) {
                // Implement delete logic here
            }
        };