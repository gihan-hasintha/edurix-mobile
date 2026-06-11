const API_URL = window.api.env.API_URL;
const API_URL_BASE = API_URL.replace('/students', '');
const CLASSES_API = `${API_URL_BASE}/classes`;
const CLASS_STUDENTS_API = `${API_URL_BASE}/class_students`;
const X_API_KEY = '996de2d470a0f1e9794b7778e216c193258aac001b36813f9ad1d3f957cc7ee7';
const CLOUDINARY_URL = window.api.env.CLOUDINARY_URL;
const CLOUDINARY_PRESET = window.api.env.CLOUDINARY_PRESET;

let allStudents = [];

let cropper;
let croppedBlob = null;

window.pageloadimasoft = function() {
    document.getElementById('loading-window').style.display = 'none';
    fetchClassesForSelection();

    // Clear session storage on window close
    window.addEventListener('unload', () => {
        sessionStorage.clear();
    });
}

// Send Welcome SMS via text.lk
async function sendWelcomeSMS(student, teacherId) {
    try {
        const teacherRes = await fetch(`${API_URL_BASE}/teachers`, {
            headers: { 'x-api-key': '996de2d470a0f1e9794b7778e216c193258aac001b36813f9ad1d3f957cc7ee7' }
        });
        if (!teacherRes.ok) return;
        
        const teacherData = await teacherRes.json();
        const teachersItems = Array.isArray(teacherData) ? teacherData : (teacherData.items || []);
        const teacherSettings = teachersItems.find(t => String(t.teacher_id) === String(teacherId));

        if (!teacherSettings || !teacherSettings.sms_service || !teacherSettings.sms_api || !teacherSettings.sms_senderid) return;
        if (!teacherSettings.welcome_sms) return; // Must have welcome SMS enabled

        const recipient = student.parent_phone_number;
        if (!recipient) return;

        let formattedRecipient = recipient.replace(/[^0-9+]/g, '');
        if (formattedRecipient.startsWith('0')) {
            formattedRecipient = '94' + formattedRecipient.substring(1);
        } else if (formattedRecipient.startsWith('+94')) {
            formattedRecipient = formattedRecipient.substring(1);
        }

        const senderName = teacherSettings.name || 'Institute';
        const message = `Welcome to ${senderName}! ${student.student_name} has been successfully registered.`;

        const response = await fetch('https://app.text.lk/api/v3/sms/send', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${teacherSettings.sms_api}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({
                recipient: formattedRecipient,
                sender_id: teacherSettings.sms_senderid,
                type: 'plain',
                message: message
            })
        });

        if (response.ok) {
            console.log(`Welcome SMS sent successfully to ${recipient}`);
        } else {
            console.error('Failed to send Welcome SMS:', await response.text());
        }
    } catch (err) {
        console.error('Welcome SMS sending error:', err);
    }
}

async function fetchClassesForSelection() {
    const activatedData = localStorage.getItem('Activated_Teacher') || localStorage.getItem('Activated_Institution');
    if (!activatedData) return;

    const stored = JSON.parse(activatedData);
    const teacherId = stored.teacher_id || stored.institution_id;

    try {
        const res = await fetch(CLASSES_API, {
            headers: { 'x-api-key': X_API_KEY }
        });
        if (!res.ok) return;

        const data = await res.json();
        const classes = Array.isArray(data) ? data : (data.items || []);
        const myClasses = classes.filter(c => c.teacher_id === teacherId);

        if (myClasses.length > 0) {
            const select = document.getElementById('assign_class');
            myClasses.forEach(cls => {
                const option = document.createElement('option');
                option.value = cls.id;
                option.textContent = `${cls.name} (${cls.classdate} ${cls.classtime})`;
                select.appendChild(option);
            });
            document.getElementById('classSelectGroup').style.display = 'block';

            // Restore selected class from session storage
            const savedClassId = sessionStorage.getItem('selectedClassId');
            if (savedClassId) {
                select.value = savedClassId;
            }
        }
    } catch (err) {
        console.error('Error fetching classes:', err);
    }
}

// Handle class selection change
document.getElementById('assign_class').addEventListener('change', (e) => {
    sessionStorage.setItem('selectedClassId', e.target.value);
});

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

        window.closeCropModal = function() {
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

        window.closeStatusModal = function() {
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
                    if (students.some(s => s.nfc_number === nfcNumber)) {
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

            const activatedData = localStorage.getItem('Activated_Teacher') || localStorage.getItem('Activated_Institution');
            const stored = activatedData ? JSON.parse(activatedData) : null;
            const teacherId = stored ? (stored.teacher_id || stored.institution_id) : '';

            // Generate unique Student ID
            const studentId = await generateStudentID(teacherId);

            const now = new Date().toISOString();
            const payload = {
                student_id: studentId,
                student_name: document.getElementById('student_name').value,
                address: document.getElementById('address').value,
                phone_number: document.getElementById('phone_number').value,
                parent_name: document.getElementById('parent_name').value,
                parent_phone_number: document.getElementById('parent_phone_number').value,
                birthday: document.getElementById('birthday').value,
                student_photo: studentPhotoUrl,
                teacher_id: teacherId,
                nfc_number: document.getElementById('nfc-number').value,
                free_card: document.getElementById('free_card').checked,
                created: now,
                updated: now
            };

            try {
                const res = await fetch(API_URL, {
                    method: 'POST',
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
                    const selectedClassId = document.getElementById('assign_class').value;

                    let enrollmentMessage = '';
                    if (selectedClassId) {
                        try {
                            const enrollRes = await fetch(CLASS_STUDENTS_API, {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json',
                                    'x-api-key': X_API_KEY
                                },
                                body: JSON.stringify({
                                    class_id: selectedClassId,
                                    student_id: newStudent.id,
                                    created: now,
                                    updated: now
                                })
                            });
                            if (enrollRes.ok) {
                                enrollmentMessage = ' and enrolled in class';
                            } else {
                                enrollmentMessage = ' (but class enrollment failed)';
                            }
                        } catch (enrollErr) {
                            console.error('Enrollment error:', enrollErr);
                            enrollmentMessage = ' (but class enrollment failed)';
                        }
                    }

                    // Trigger welcome SMS
                    sendWelcomeSMS(payload, teacherId);

                    showStatus('success', 'Success!', `Student has been successfully registered${enrollmentMessage}.`);
                    document.getElementById('studentForm').reset();
                    const statusWindow = document.getElementById('nfc-added-status-window');
                    if (statusWindow) statusWindow.style.display = 'none';

                    // Fully reset photo preview state
                    const photoPreview = document.getElementById('photoPreview');
                    const photoPlaceholder = document.getElementById('photoPlaceholder');
                    const photoInput = document.getElementById('photoInput');

                    photoPreview.src = './assets/img/depositphotos_679927214-stock-illustration-default-avatar-profile-placeholder-abstract.jpg';
                    photoPreview.classList.add('hidden');
                    photoPlaceholder.classList.remove('hidden');
                    photoInput.value = '';
                    croppedBlob = null;

                    // Restore selected class and update UI
                    const savedClassId = sessionStorage.getItem('selectedClassId');
                    if (savedClassId) {
                        document.getElementById('assign_class').value = savedClassId;
                    }
                } else {
                    showStatus('error', 'Registration Failed', 'There was an error saving the student.');
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

window.scancardfunbt = function() {
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

window.closeNfcScanner = function() {
    const nfcWindow = document.getElementById('nfc-scanning-window');
    if (nfcWindow) {
        nfcWindow.style.display = 'none';
    }
}

document.addEventListener('DOMContentLoaded', () => {
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
