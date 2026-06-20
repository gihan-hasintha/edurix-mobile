const API_URL = window.api.env.API_URL;
const API_URL_BASE = API_URL.replace('/students', '');
const CLASSES_API = `${API_URL_BASE}/classes`;
const CLASS_STUDENTS_API = `${API_URL_BASE}/class_students`;
const X_API_KEY = '996de2d470a0f1e9794b7778e216c193258aac001b36813f9ad1d3f957cc7ee7';
const CLOUDINARY_URL = window.api.env.CLOUDINARY_URL;
const CLOUDINARY_PRESET = window.api.env.CLOUDINARY_PRESET;

let allStudents = [];
let allMyClasses = [];
let myEnrollments = [];

let cropper;
let croppedBlob = null;
let currentStudentData = null;
const urlParams = new URLSearchParams(window.location.search);
const editStudentId = urlParams.get('id');

async function fetchStudentDetails(id) {
    try {
        const res = await fetch(`${API_URL}/${id}`, {
            headers: { 'x-api-key': '996de2d470a0f1e9794b7778e216c193258aac001b36813f9ad1d3f957cc7ee7' }
        });
        if (!res.ok) throw new Error('Failed to fetch student details');
        const student = await res.json();
        currentStudentData = student;
        
        document.getElementById('student_name').value = student.student_name || '';
        document.getElementById('address').value = student.address || '';
        document.getElementById('phone_number').value = student.phone_number || '';
        document.getElementById('parent_name').value = student.parent_name || '';
        document.getElementById('parent_id_number').value = student.parent_id_number || '';
        document.getElementById('parent_phone_number').value = student.parent_phone_number || '';
        
        if (student.birthday) {
            const bdate = new Date(student.birthday);
            document.getElementById('birthday').value = bdate.toISOString().split('T')[0];
        }
        
        if (student.nfc_number) {
            document.getElementById('nfc-number').value = student.nfc_number;
            const btn = document.getElementById('nfcScanBtn');
            if (btn) {
                btn.style.backgroundColor = '#5500ffff';
                btn.style.border = 'none';
            }
            const btnTxt = document.getElementById('nfcScanBtnTxt');
            if (btnTxt) {
                btnTxt.innerText = 'Card Linked';
                btnTxt.style.color = '#ffffff';
            }
            const btnIcon = document.getElementById('nfcScanBtnIcon');
            if (btnIcon) btnIcon.src = './assets/img/checkas.png';
        } else {
            document.getElementById('nfc-number').value = '';
            const btn = document.getElementById('nfcScanBtn');
            if (btn) {
                btn.style.backgroundColor = '';
                btn.style.border = '';
            }
            const btnTxt = document.getElementById('nfcScanBtnTxt');
            if (btnTxt) {
                btnTxt.innerText = 'Scan Card';
                btnTxt.style.color = '';
            }
            const btnIcon = document.getElementById('nfcScanBtnIcon');
            if (btnIcon) btnIcon.src = './assets/img/contactless.png';
        }
        document.getElementById('free_card').checked = student.free_card || false;
        
        if (student.student_photo) {
            const preview = document.getElementById('photoPreview');
            const placeholder = document.getElementById('photoPlaceholder');
            preview.src = student.student_photo;
            preview.classList.remove('hidden');
            placeholder.classList.add('hidden');
        }
        
        document.getElementById('btnText').innerText = 'Update Student';
        
    } catch (err) {
        console.error(err);
        showStatus('error', 'Error', 'Failed to load student details.');
    } finally {
        document.getElementById('loading-window').style.display = 'none';
    }
}

window.pageloadimasoft = async function() {
    if (editStudentId) {
        await fetchStudentDetails(editStudentId);
    } else {
        document.getElementById('loading-window').style.display = 'none';
    }
    await fetchClassData();

    // Clear session storage on window close
    window.addEventListener('unload', () => {
        sessionStorage.clear();
    });
}

async function fetchClassData() {
    const activatedData = localStorage.getItem('Activated_Teacher') || localStorage.getItem('Activated_Institution');
    if (!activatedData) return;

    const stored = JSON.parse(activatedData);
    const teacherId = stored.teacher_id || stored.institution_id;

    try {
        const [classesRes, enrollmentsRes] = await Promise.all([
            fetch(CLASSES_API, { headers: { 'x-api-key': X_API_KEY } }),
            fetch(CLASS_STUDENTS_API, { headers: { 'x-api-key': X_API_KEY } })
        ]);

        if (classesRes.ok) {
            const data = await classesRes.json();
            const classes = Array.isArray(data) ? data : (data.items || []);
            allMyClasses = classes.filter(c => c.teacher_id === teacherId);
        }

        if (enrollmentsRes.ok) {
            const data = await enrollmentsRes.json();
            const enrollments = Array.isArray(data) ? data : (data.items || []);
            myEnrollments = enrollments.filter(e => e.student_id === editStudentId);
        }

        renderEnrolledClasses();
    } catch (err) {
        console.error('Error fetching class data:', err);
    }
}

function renderEnrolledClasses() {
    const container = document.getElementById('enrolledClassesContainer');
    const select = document.getElementById('new_class_select');
    
    container.innerHTML = '';
    select.innerHTML = '<option value="" disabled selected>Select a Class</option>';

    const enrolledClassIds = myEnrollments.map(e => e.class_id);

    if (myEnrollments.length === 0) {
        container.innerHTML = '<p style="color: #666; font-size: 13px;">Not enrolled in any classes.</p>';
    } else {
        myEnrollments.forEach(enrollment => {
            const cls = allMyClasses.find(c => c.id === enrollment.class_id);
            if (!cls) return;

            const div = document.createElement('div');
            div.style.cssText = 'display: flex; justify-content: space-between; align-items: center; padding: 10px; background: #f9f9f9; border: 1px solid #eee; border-radius: 4px; margin-bottom: 5px;';
            const locationStr = cls.location ? ` | ${cls.location}` : '';
            div.innerHTML = `
                <div>
                    <strong>${cls.name}</strong> <span style="color: #666; font-size: 12px; margin-left: 10px;">${cls.classdate} ${cls.classtime}${locationStr}</span>
                </div>
                <button type="button" onclick="removeFromClass('${enrollment.id}')" style="padding: 5px 10px; background: #dc3545; color: white; border: none; border-radius: 3px; cursor: pointer; font-size: 12px;">Remove</button>
            `;
            container.appendChild(div);
        });
    }

    let hasAvailable = false;
    allMyClasses.forEach(cls => {
        if (!enrolledClassIds.includes(cls.id)) {
            hasAvailable = true;
            const option = document.createElement('option');
            option.value = cls.id;
            const locStr = cls.location ? ` - ${cls.location}` : '';
            option.textContent = `${cls.name} (${cls.classdate} ${cls.classtime}${locStr})`;
            select.appendChild(option);
        }
    });
    
    if (!hasAvailable) {
        select.innerHTML = '<option value="" disabled>No more classes available</option>';
    }

    applyClassSearchFilter();
}

function applyClassSearchFilter() {
    const searchInput = document.getElementById('enrolledClassSearch');
    if (!searchInput) return;
    const term = searchInput.value.toLowerCase();
    const container = document.getElementById('enrolledClassesContainer');
    if (container) {
        const items = container.children;
        for (let i = 0; i < items.length; i++) {
            if (items[i].tagName.toLowerCase() === 'div') {
                const text = items[i].innerText.toLowerCase();
                if (text.includes(term)) {
                    items[i].style.display = 'flex';
                } else {
                    items[i].style.display = 'none';
                }
            }
        }
    }
}

async function enrollInClass() {
    const select = document.getElementById('new_class_select');
    const classId = select.value;
    if (!classId) return;

    select.disabled = true;

    const now = new Date().toISOString();
    try {
        const res = await fetch(CLASS_STUDENTS_API, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': X_API_KEY
            },
            body: JSON.stringify({
                class_id: classId,
                student_id: editStudentId,
                created: now,
                updated: now
            })
        });

        if (res.ok) {
            await fetchClassData();
        } else {
            throw new Error('Failed to enroll');
        }
    } catch (err) {
        console.error(err);
        showStatus('error', 'Error', 'Failed to enroll student in class.');
    } finally {
        select.disabled = false;
    }
}

async function removeFromClass(enrollmentId) {
    if (!(await window.customConfirm('Are you sure you want to remove the student from this class?'))) return;

    try {
        const res = await fetch(`${CLASS_STUDENTS_API}/${enrollmentId}`, {
            method: 'DELETE',
            headers: { 'x-api-key': X_API_KEY }
        });

        if (res.ok) {
            await fetchClassData();
        } else {
            throw new Error('Failed to remove');
        }
    } catch (err) {
        console.error(err);
        showStatus('error', 'Error', 'Failed to remove student from class.');
    }
}

        async function generateStudentID(teacherId) {
            try {
                // 1. Get Shortcode
                const activatedData = localStorage.getItem('Activated_Teacher');
                let shortcode = '';
                if (activatedData) {
                    const stored = JSON.parse(activatedData);
                    if (stored.teacher_shortcode) shortcode = stored.teacher_shortcode;
                }

                // If shortcode still missing, fetch from teachers collection
                if (!shortcode) {
                    const teacherUrl = API_URL.replace('/students', '/teachers');
                    const teacherRes = await fetch(teacherUrl, {
                        headers: { 'x-api-key': '996de2d470a0f1e9794b7778e216c193258aac001b36813f9ad1d3f957cc7ee7' }
                    });
                    const teachers = await teacherRes.json();
                    const items = Array.isArray(teachers) ? teachers : (teachers.items || []);
                    const teacher = items.find(t => t.teacher_id === teacherId);
                    shortcode = teacher ? teacher.teacher_shortcode : 'STU';
                }

                // 2. Fetch all students to find next sequence
                const res = await fetch(API_URL, {
                    headers: { 'x-api-key': '996de2d470a0f1e9794b7778e216c193258aac001b36813f9ad1d3f957cc7ee7' }
                });
                const data = await res.json();
                const students = Array.isArray(data) ? data : (data.items || []);

                // Filter students for THIS teacher
                const myStudents = students.filter(s => s.teacher_id === teacherId);

                let maxNum = 0;
                myStudents.forEach(s => {
                    if (s.student_id && s.student_id.includes('-')) {
                        const num = parseInt(s.student_id.split('-')[1]);
                        if (!isNaN(num) && num > maxNum) maxNum = num;
                    }
                });

                const nextNum = (maxNum + 1).toString().padStart(4, '0');
                return `${shortcode}-${nextNum}`;
            } catch (err) {
                console.error('ID generation error:', err);
                return `STU-${Date.now().toString().slice(-4)}`;
            }
        }

        // Preview image and open cropper
        document.getElementById('photoInput').addEventListener('change', function (e) {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = function (event) {
                    const cropperImage = document.getElementById('cropperImage');
                    cropperImage.src = event.target.result;

                    document.getElementById('cropModal').style.display = 'block';

                    if (cropper) {
                        cropper.destroy();
                    }

                    cropper = new Cropper(cropperImage, {
                        aspectRatio: 1,
                        viewMode: 1,
                        autoCropArea: 1,
                    });
                }
                reader.readAsDataURL(file);
            }
        });

        function closeCropModal() {
            document.getElementById('cropModal').style.display = 'none';
            document.getElementById('photoInput').value = '';
            if (cropper) {
                cropper.destroy();
                cropper = null;
            }
        }

        function showStatus(type, title, message) {
            const modal = document.getElementById('statusModal');
            const content = document.getElementById('statusContent');
            const icon = document.getElementById('statusIcon');
            const titleElem = document.getElementById('statusTitle');
            const messageElem = document.getElementById('statusMessage');

            content.className = 'status-content ' + (type === 'success' ? 'status-success' : 'status-error');

            if (type === 'success') {
                icon.innerHTML = `<svg class="success-svg" viewBox="0 0 52 52">
                    <circle class="success-svg__circle" cx="26" cy="26" r="25" fill="none"/>
                    <path class="success-svg__check" fill="none" d="M14.1 27.2l7.1 7.2 16.7-16.8"/>
                </svg>`;
            } else {
                icon.innerHTML = `<svg class="error-svg" viewBox="0 0 52 52">
                    <circle class="error-svg__circle" cx="26" cy="26" r="25" fill="none"/>
                    <path class="error-svg__x" fill="none" d="M16 16 36 36 M36 16 16 36"/>
                </svg>`;
            }

            titleElem.textContent = title;
            messageElem.textContent = message;

            modal.style.display = 'flex';
        }

        function closeStatusModal() {
            const statusTitleText = document.getElementById('statusTitle').textContent;
            document.getElementById('statusModal').style.display = 'none';
            
            // If the error was about a duplicate NFC card or card not scanned, clear it and focus for a new scan
            if (statusTitleText === 'Card Already Taken' || statusTitleText === 'Card Not Scanned') {
                const nfcInput = document.getElementById('nfc-number');
                if (nfcInput) {
                    nfcInput.value = '';
                }
                if (typeof scancardfunbt === 'function') {
                    scancardfunbt();
                }
            }
        }

        document.getElementById('saveCropBtn').addEventListener('click', function () {
            if (!cropper) return;

            const canvas = cropper.getCroppedCanvas({
                width: 500,
                height: 500,
            });

            canvas.toBlob((blob) => {
                croppedBlob = blob;
                const preview = document.getElementById('photoPreview');
                const placeholder = document.getElementById('photoPlaceholder');

                preview.src = URL.createObjectURL(blob);
                preview.classList.remove('hidden');
                placeholder.classList.add('hidden');

                document.getElementById('cropModal').style.display = 'none';
            }, 'image/webp', 0.8);
        });

        async function convertToWebP(file) {
            return new Promise((resolve) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const size = Math.min(img.width, img.height);
                    canvas.width = size;
                    canvas.height = size;
                    const ctx = canvas.getContext('2d');

                    // Calculate offsets for center crop
                    const xOffset = (img.width - size) / 2;
                    const yOffset = (img.height - size) / 2;

                    ctx.drawImage(img, xOffset, yOffset, size, size, 0, 0, size, size);
                    canvas.toBlob((blob) => {
                        resolve(blob);
                    }, 'image/webp', 0.8);
                };
                img.src = URL.createObjectURL(file);
            });
        }

        async function uploadToCloudinary(fileOrBlob) {
            const formData = new FormData();
            const blob = (fileOrBlob instanceof Blob && !(fileOrBlob instanceof File))
                ? fileOrBlob
                : await convertToWebP(fileOrBlob);
            const shortId = Math.random().toString(36).substring(2, 10);

            formData.append('file', blob);
            formData.append('upload_preset', CLOUDINARY_PRESET);
            formData.append('public_id', shortId);

            try {
                const res = await fetch(CLOUDINARY_URL, {
                    method: 'POST',
                    body: formData
                });
                const data = await res.json();
                // Manually construct a shorter URL by omitting the version number
                const cleanUrl = `https://res.cloudinary.com/${window.api.env.CLOUDINARY_CLOUD_NAME}/image/upload/${data.public_id}.webp`;
                return cleanUrl;
            } catch (err) {
                console.error('Cloudinary upload error:', err);
                return null;
            }
        }

        document.getElementById('studentForm').addEventListener('submit', async (e) => {
            e.preventDefault();

            document.getElementById('loading-window').style.display = 'block';

            const submitBtn = document.getElementById('submitBtn');
            const btnText = document.getElementById('btnText');
            const btnLoader = document.getElementById('btnLoader');

            submitBtn.disabled = true;
            btnLoader.classList.remove('hidden');

            const nfcNumber = document.getElementById('nfc-number').value.trim();

            if (!nfcNumber) {
                document.getElementById('loading-window').style.display = 'none';
                showStatus('error', 'Card Not Scanned', 'Scan card and try again');
                submitBtn.disabled = false;
                btnLoader.classList.add('hidden');
                return;
            }

            // Validate NFC uniqueness
            try {
                const checkRes = await fetch(API_URL, {
                    headers: { 'x-api-key': '996de2d470a0f1e9794b7778e216c193258aac001b36813f9ad1d3f957cc7ee7' }
                });
                if (checkRes.ok) {
                    const data = await checkRes.json();
                    const students = Array.isArray(data) ? data : (data.items || []);
                    if (students.some(s => s.nfc_number === nfcNumber && s.id !== editStudentId)) {
                        document.getElementById('loading-window').style.display = 'none';
                        showStatus('error', 'Card Already Taken', 'This card is already assigned to another student. Please try another card.');
                        submitBtn.disabled = false;
                        btnLoader.classList.add('hidden');
                        return;
                    }
                }
            } catch (err) {
                console.error('NFC validation error:', err);
                document.getElementById('loading-window').style.display = 'none';
                showStatus('error', 'Network Error', 'Failed to validate NFC number. Please try again.');
                submitBtn.disabled = false;
                btnLoader.classList.add('hidden');
                return;
            }

            const photoFile = document.getElementById('photoInput').files[0];
            let studentPhotoUrl = '';

            if (croppedBlob) {
                studentPhotoUrl = await uploadToCloudinary(croppedBlob);
                if (!studentPhotoUrl) {
                    document.getElementById('loading-window').style.display = 'none';
                    showStatus('error', 'Upload Failed', 'Student photo upload failed. Please try again.');
                    submitBtn.disabled = false;
                    return;
                }
            } else if (photoFile) {
                studentPhotoUrl = await uploadToCloudinary(photoFile);
                if (!studentPhotoUrl) {
                    document.getElementById('loading-window').style.display = 'none';
                    showStatus('error', 'Upload Failed', 'Student photo upload failed. Please try again.');
                    submitBtn.disabled = false;
                    return;
                }
            }

            const now = new Date().toISOString();
            const payload = {
                student_name: document.getElementById('student_name').value,
                address: document.getElementById('address').value,
                phone_number: document.getElementById('phone_number').value,
                parent_name: document.getElementById('parent_name').value,
                parent_id_number: Number(document.getElementById('parent_id_number').value),
                parent_phone_number: document.getElementById('parent_phone_number').value,
                birthday: document.getElementById('birthday').value,
                nfc_number: document.getElementById('nfc-number').value,
                free_card: document.getElementById('free_card').checked,
                updated: now
            };
            
            if (studentPhotoUrl) {
                payload.student_photo = studentPhotoUrl;
            }

            try {
                const res = await fetch(`${API_URL}/${editStudentId}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-api-key': '996de2d470a0f1e9794b7778e216c193258aac001b36813f9ad1d3f957cc7ee7'
                    },
                    body: JSON.stringify(payload)
                });

                document.getElementById('loading-window').style.display = 'none';

                if (res.ok) {
                    let newStudent = {};
                    try {
                        const resText = await res.text();
                        if (resText) {
                            newStudent = JSON.parse(resText);
                        }
                    } catch (jsonErr) {
                        console.warn("Response was not JSON:", jsonErr);
                    }
                    showStatus('success', 'Success!', `Student details have been successfully updated.`);
                    const statusWindow = document.getElementById('nfc-added-status-window');
                    if (statusWindow) statusWindow.style.display = 'none';
                } else {
                    showStatus('error', 'Update Failed', 'There was an error updating the student.');
                }
            } catch (err) {
                console.error("Submission error:", err);
                document.getElementById('loading-window').style.display = 'none';
                showStatus('error', 'Error', 'An error occurred: ' + err.message);
            } finally {
                submitBtn.disabled = false;
                btnLoader.classList.add('hidden');
            }
        });

function scancardfunbt() {
    const nfcWindow = document.getElementById('nfc-scanning-window');
    if (nfcWindow) {
        nfcWindow.style.display = 'block';
        nfcWindow.onclick = () => {
            const n = document.getElementById('nfc-number');
            if (n) n.focus();
        };
    }
    const statusWindow = document.getElementById('nfc-added-status-window');
    if (statusWindow) {
        statusWindow.style.display = 'none';
    }
    const nfcInput = document.getElementById('nfc-number');
    if (nfcInput) {
        nfcInput.value = '';
        setTimeout(() => { nfcInput.focus(); }, 50);
    }
}

function closeNfcScanner() {
    const nfcWindow = document.getElementById('nfc-scanning-window');
    if (nfcWindow) {
        nfcWindow.style.display = 'none';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('enrolledClassSearch');
    if (searchInput) {
        searchInput.addEventListener('input', applyClassSearchFilter);
    }

    const nfcInput = document.getElementById('nfc-number');
    if (nfcInput) {
        nfcInput.addEventListener('keydown', async function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                const scannedNumber = nfcInput.value.trim();
                
                if (scannedNumber !== '') {
                    const waitingBtn = document.querySelector('.waiting-nfc-btn');
                    let originalBtnHTML = '';
                    if (waitingBtn) {
                        originalBtnHTML = waitingBtn.innerHTML;
                        waitingBtn.innerHTML = '<div class="spinner-border"></div> Validating...';
                    }

                    try {
                        const checkRes = await fetch(API_URL, {
                            headers: { 'x-api-key': '996de2d470a0f1e9794b7778e216c193258aac001b36813f9ad1d3f957cc7ee7' }
                        });

                        if (checkRes.ok) {
                            const data = await checkRes.json();
                            const students = Array.isArray(data) ? data : (data.items || []);
                            
                            if (students.some(s => s.nfc_number === scannedNumber)) {
                                if (waitingBtn) waitingBtn.innerHTML = originalBtnHTML;
                                closeNfcScanner();
                                showStatus('error', 'Card Already Taken', 'This card is already assigned to another student. Please try another card.');
                                nfcInput.value = '';
                                return;
                            }
                        }
                    } catch (err) {
                        console.error('NFC validation error:', err);
                        if (waitingBtn) waitingBtn.innerHTML = originalBtnHTML;
                        closeNfcScanner();
                        showStatus('error', 'Network Error', 'Failed to validate NFC number. Please try again.');
                        return;
                    }

                    if (waitingBtn) waitingBtn.innerHTML = originalBtnHTML;
                    closeNfcScanner();

                    const btn = document.getElementById('nfcScanBtn');
                    if (btn) {
                        btn.style.backgroundColor = '#28a745';
                        btn.style.border = 'none';
                    }
                    const btnTxt = document.getElementById('nfcScanBtnTxt');
                    if (btnTxt) {
                        btnTxt.innerText = 'Card Linked';
                        btnTxt.style.color = '#ffffff';
                    }
                    const btnIcon = document.getElementById('nfcScanBtnIcon');
                    if (btnIcon) btnIcon.src = './assets/img/checkas.png';

                    const statusWindow = document.getElementById('nfc-added-status-window');
                    if (statusWindow) {
                        statusWindow.style.display = 'flex';
                    }
                } else {
                    closeNfcScanner();
                }
            }
        });
    }
});
