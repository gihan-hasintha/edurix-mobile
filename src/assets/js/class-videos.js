// Ensure window.api.env is available (fallback for module loading order)
window.api = window.api || {};
window.api.env = window.api.env || {
    API_URL: 'https://api.edurix.imatap.com/students',
    BASE_API_URL: 'https://api.edurix.imatap.com',
    X_API_KEY: '996de2d470a0f1e9794b7778e216c193258aac001b36813f9ad1d3f957cc7ee7',
    APP_VERSION: '1.0.0'
};

const API_URL_BASE = window.api.env.API_URL.replace('/students', '');
const CLASSES_API  = `${API_URL_BASE}/classes`;
const CLASS_VIDEOS_API = `${API_URL_BASE}/class_videos`;
const VIDEO_STUDENTS_API = `${API_URL_BASE}/video_students`;
const STUDENTS_API = window.api?.env?.API_URL || `${API_URL_BASE}/students`;
const CLASS_STUDENTS_API = `${API_URL_BASE}/class_students`;
const X_API_KEY    = '996de2d470a0f1e9794b7778e216c193258aac001b36813f9ad1d3f957cc7ee7';

let allClasses = [];
let allVideos   = [];
let currentClassStudents = [];
let editingVideoId = null;

window.currentEditSelectedStudents = [];

window.handleVisibilityChange = function() {
    const visibility = document.getElementById('videoVisibility').value;
    const studentsGroup = document.getElementById('specificStudentsGroup');
    const classesGroup = document.getElementById('classesGroup');
    const visibilityGroup = document.getElementById('visibilityGroup');
    
    if (visibility === 'students') {
        studentsGroup.style.display = 'flex';
        window.handleClassSelection();
    } else {
        studentsGroup.style.display = 'none';
    }
    
    if (visibility === 'public') {
        if (classesGroup) classesGroup.style.display = 'none';
        if (visibilityGroup) visibilityGroup.classList.add('full-width');
    } else {
        if (classesGroup) classesGroup.style.display = 'flex';
        if (visibilityGroup) visibilityGroup.classList.remove('full-width');
    }
};

window.handleClassSelection = async function() {
    const visibility = document.getElementById('videoVisibility').value;
    const classCheckboxes = document.querySelectorAll('input[name="videoSelectedClasses"]:checked');
    const classIds = Array.from(classCheckboxes).map(cb => cb.value);
    const showAllStudents = document.getElementById('showAllStudentsCheckbox') ? document.getElementById('showAllStudentsCheckbox').checked : false;
    
    const listDiv = document.getElementById('studentsCheckboxList');
    
    if (visibility !== 'students') return;
    
    if (classIds.length === 0 && !showAllStudents) {
        listDiv.innerHTML = '<div style="font-size: 12px; color: #64748b;">Please select at least one class first or check "Show all students"...</div>';
        return;
    }

    listDiv.innerHTML = '<div style="font-size: 12px; color: #64748b;">Loading students...</div>';
    
    try {
        const currentTeacherId = getActivatedId();
        
        let enrolledStudentIds = [];
        
        if (!showAllStudents) {
            let allClassEnrolls = [];
            for (const cid of classIds) {
                const resClass = await fetch(`${CLASS_STUDENTS_API}?class_id=${cid}`, { headers: { 'x-api-key': X_API_KEY } });
                if (resClass.ok) {
                    const data = await resClass.json();
                    const enrolls = Array.isArray(data) ? data : (data.items || []);
                    allClassEnrolls = allClassEnrolls.concat(enrolls);
                }
            }
            enrolledStudentIds = allClassEnrolls.map(e => String(e.student_id));
        }
        
        const resStudents = await fetch(`${STUDENTS_API}?teacher_id=${currentTeacherId}`, { headers: { 'x-api-key': X_API_KEY } });
        
        if (!resStudents.ok) throw new Error('Failed to fetch students');
        
        const studentsData = await resStudents.json();
        const allStudents = Array.isArray(studentsData) ? studentsData : (studentsData.items || []);
        
        if (showAllStudents) {
            currentClassStudents = allStudents;
        } else {
            const uniqueEnrolledIds = [...new Set(enrolledStudentIds)];
            currentClassStudents = allStudents.filter(s => uniqueEnrolledIds.includes(String(s.id)));
        }
        
        if (currentClassStudents.length === 0) {
            listDiv.innerHTML = '<div style="font-size: 12px; color: #64748b;">No students found.</div>';
            return;
        }

        const selectedIds = window.currentEditSelectedStudents || [];
        let html = '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">';
        currentClassStudents.forEach(s => {
            const isChecked = selectedIds.includes(String(s.id)) ? 'checked' : '';
            html += `
                <label class="student-checkbox-item" style="display: flex; align-items: center; gap: 6px; font-size: 13px; cursor: pointer; color: #334155; margin-bottom: 4px;">
                    <input type="checkbox" name="videoSelectedStudents" value="${s.id}" ${isChecked} style="cursor: pointer; width: auto; margin: 0;">
                    <span class="student-label-text">${s.student_name || 'N/A'} <span style="color:#94a3b8; font-size:11px;">(${s.student_id || 'N/A'})</span></span>
                </label>
            `;
        });
        html += '</div>';
        listDiv.innerHTML = html;
        
    } catch (e) {
        console.error('Error fetching students:', e);
        listDiv.innerHTML = '<div style="font-size: 12px; color: #dc2626;">Failed to load students.</div>';
    }
};

window.filterStudents = function() {
    const term = document.getElementById('studentSearchInput').value.toLowerCase();
    const items = document.querySelectorAll('.student-checkbox-item');
    items.forEach(item => {
        const text = item.querySelector('.student-label-text').textContent.toLowerCase();
        if (text.includes(term)) {
            item.style.display = 'flex';
        } else {
            item.style.display = 'none';
        }
    });
};

function getActivatedId() {
    const data = localStorage.getItem('Activated_Teacher') || localStorage.getItem('Activated_Institution');
    if (!data || data === 'undefined') return null;
    try {
        const stored = JSON.parse(data);
        return stored.teacher_id || stored.institution_id;
    } catch(e) {
        return null;
    }
}

function getClassNameById(classId, visibilityMode) {
    if (!classId || (typeof classId === 'string' && classId.trim() === '')) {
        if (visibilityMode === 'students') return 'Specific Students';
        if (visibilityMode === 'public') return 'All Classes';
        return 'Unknown Class';
    }
    const ids = Array.isArray(classId) ? classId : String(classId).split(',');
    if (ids.length > 1) {
        return `${ids.length} Classes Selected`;
    }
    const cls = allClasses.find(c => String(c.id) === String(ids[0]));
    if (!cls) {
        if (visibilityMode === 'students') return 'Specific Students';
        if (visibilityMode === 'public') return 'All Classes';
        return 'Unknown Class';
    }
    return cls.name;
}

async function fetchClasses() {
    const currentId = getActivatedId();
    if (!currentId) {
        const grid = document.getElementById('videoGrid');
        if (grid) {
            grid.innerHTML = '<div style="padding: 20px; text-align: center; color: #dc2626; grid-column: 1/-1; width: 100%;">Activation/Login required to view class videos. Please log in first.</div>';
        }
        return;
    }

    try {
        const res = await fetch(CLASSES_API, { headers: { 'x-api-key': X_API_KEY } });
        if (!res.ok) throw new Error('Failed to fetch classes');
        const data = await res.json();
        const items = Array.isArray(data) ? data : (data.items || []);
        allClasses = items.filter(c => c.teacher_id === currentId);
    } catch (e) {
        console.warn('Could not load classes:', e);
        allClasses = [];
    }
    populateClassDropdowns();
    await fetchVideos();
}

async function fetchVideos() {
    const currentId = getActivatedId();
    if (!currentId) return;

    const loader = document.getElementById('videoLoader');
    if (loader) loader.classList.remove('hidden');
    const grid = document.getElementById('videoGrid');
    if (grid) grid.innerHTML = '';
    const empty = document.getElementById('videoEmpty');
    if (empty) empty.classList.add('hidden');

    try {
        const res = await fetch(`${CLASS_VIDEOS_API}?teacher_id=${currentId}`, { headers: { 'x-api-key': X_API_KEY } });
        if (!res.ok) throw new Error('Failed to fetch videos');
        const data = await res.json();
        allVideos = Array.isArray(data) ? data : (data.items || []);
    } catch (e) {
        console.warn('Could not load videos from DB:', e);
        allVideos = [];
    }

    // Fetch student counts from video_students table
    try {
        const vsRes = await fetch(`${VIDEO_STUDENTS_API}?teacher_id=${currentId}`, { headers: { 'x-api-key': X_API_KEY } });
        if (vsRes.ok) {
            const vsData = await vsRes.json();
            const vsItems = Array.isArray(vsData) ? vsData : (vsData.items || []);
            // Group by video_id and count
            const countMap = {};
            vsItems.forEach(r => {
                countMap[r.video_id] = (countMap[r.video_id] || 0) + 1;
            });
            // Attach count to each video
            allVideos.forEach(v => { v.studentCount = countMap[v.id] || 0; });
        }
    } catch (e) {
        console.warn('Could not load video_students counts:', e);
    }

    renderVideos();
}

function populateClassDropdowns() {
    const videoClassList  = document.getElementById('videoClassList');
    const filterClassSelect = document.getElementById('filterClass');

    if (allClasses.length === 0) {
        videoClassList.innerHTML = '<div style="font-size: 12px; color: #64748b;">No classes found.</div>';
    } else {
        const videoOptions = allClasses.map(c => `
            <label style="display: flex; align-items: center; gap: 6px; font-size: 13px; cursor: pointer; color: #334155; margin-bottom: 6px;">
                <input type="checkbox" name="videoSelectedClasses" value="${c.id}" style="cursor: pointer; width: auto; margin: 0;" onchange="window.handleClassSelection && window.handleClassSelection()">
                ${c.name}
            </label>
        `).join('');
        videoClassList.innerHTML = videoOptions;
    }

    const filterOptions = allClasses.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
    filterClassSelect.innerHTML = `<option value="All">All Classes</option>${filterOptions}`;
}

function timeSince(dateString) {
    if (!dateString) return 'Just now';
    const date = new Date(dateString);
    const seconds = Math.floor((new Date() - date) / 1000);
    let interval = seconds / 31536000;
    if (interval > 1) return Math.floor(interval) + " year" + (Math.floor(interval) > 1 ? "s" : "") + " ago";
    interval = seconds / 2592000;
    if (interval > 1) return Math.floor(interval) + " month" + (Math.floor(interval) > 1 ? "s" : "") + " ago";
    interval = seconds / 86400;
    if (interval > 1) return Math.floor(interval) + " day" + (Math.floor(interval) > 1 ? "s" : "") + " ago";
    interval = seconds / 3600;
    if (interval > 1) return Math.floor(interval) + " hour" + (Math.floor(interval) > 1 ? "s" : "") + " ago";
    interval = seconds / 60;
    if (interval > 1) return Math.floor(interval) + " minute" + (Math.floor(interval) > 1 ? "s" : "") + " ago";
    return "Just now";
}

function renderVideos() {
    const loader = document.getElementById('videoLoader');
    if (loader) loader.classList.add('hidden');

    const filterClass  = document.getElementById('filterClass').value;
    const searchTerm = document.getElementById('searchVideoInput').value.toLowerCase();
    let videos = [...allVideos];

    if (filterClass !== 'All') {
        videos = videos.filter(e => {
            const ids = Array.isArray(e.class_id) ? e.class_id : (e.class_id ? String(e.class_id).split(',') : []);
            return ids.includes(String(filterClass));
        });
    }

    if (searchTerm) {
        videos = videos.filter(e => {
            const title = (e.title || '').toLowerCase();
            const desc = (e.content || '').toLowerCase();
            return title.includes(searchTerm) || desc.includes(searchTerm);
        });
    }

    const grid  = document.getElementById('videoGrid');
    const empty = document.getElementById('videoEmpty');

    updateStats();

    if (videos.length === 0) {
        grid.innerHTML = '';
        empty.classList.remove('hidden');
        return;
    }

    empty.classList.add('hidden');
    grid.innerHTML = videos.map(video => buildVideoCard(video)).join('');
}

function buildVideoCard(video) {
    const isHidden = video.is_hidden === true || video.is_hidden === 'true';
    const visibilityMode = video.visibility_mode || ((video.is_public === true || video.is_public === 'true') ? 'public' : 'restricted');
    
    const className = getClassNameById(video.class_id, visibilityMode);
    const publicIcon = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>`;
    const lockIcon = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>`;
    
    let badgeClass = 'badge-restricted';
    let badgeLabel = lockIcon + ' Restricted';
    
    if (isHidden) {
        badgeClass = 'badge-today'; // Red badge for Draft/Hidden
        badgeLabel = lockIcon + ' Hidden (Draft)';
    } else if (visibilityMode === 'public') {
        badgeClass = 'badge-public';
        badgeLabel = publicIcon + ' Public';
    } else if (visibilityMode === 'students') {
        badgeClass = 'badge-upcoming'; // Amber badge for Specific Students
        const count = video.studentCount || 0;
        badgeLabel = lockIcon + ` ${count} Student(s)`;
    }
    const optimizedVideoUrl = video.video_url || '#';
    let thumbnailHTML = '';
    if (video.thumbnail_url) {
        let thumbnailUrl = video.thumbnail_url;
        if (thumbnailUrl.includes('drive.google.com/file/d/')) {
            const match = thumbnailUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);
            if (match && match[1]) {
                thumbnailUrl = `https://drive.google.com/uc?id=${match[1]}`;
            }
        }
        thumbnailHTML = `<div class="video-card-thumbnail" style="display: flex; align-items: center; justify-content: center; background: #515151; position: relative; cursor: pointer;" onclick="openWatchVideoModal('${optimizedVideoUrl}')">
            <img src="./assets/img/video-camera.png" style="width: 48px; height: 48px; opacity: 0.5; position: absolute;" alt="Placeholder" />
            <img src="${thumbnailUrl}" style="width: 100%; height: 100%; object-fit: cover; position: relative; z-index: 1;" alt="" onerror="this.style.display='none'" />
            <div style="position: absolute; z-index: 2; width: 48px; height: 48px; background: rgba(0,0,0,0.6); border-radius: 50%; display: flex; align-items: center; justify-content: center;">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="white"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
            </div>
        </div>`;
    } else {
        thumbnailHTML = `<div class="video-card-thumbnail" style="display: flex; align-items: center; justify-content: center; background: #515151; position: relative; cursor: pointer;" onclick="openWatchVideoModal('${optimizedVideoUrl}')">
            <img src="./assets/img/video-camera.png" style="width: 48px; height: 48px; opacity: 0.5; position: absolute;" alt="Placeholder" />
            <div style="position: absolute; z-index: 2; width: 48px; height: 48px; background: rgba(0,0,0,0.6); border-radius: 50%; display: flex; align-items: center; justify-content: center;">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="white"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
            </div>
        </div>`;
    }
    const uploadedTime = timeSince(video.created || video.updated);

    return `
        <div class="video-card">
            ${thumbnailHTML}
            <div class="video-card-body">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px;">
                    <div>
                        <h3 style="margin: 0 0 5px; font-size: 16px; color: #1e293b;">${video.title}</h3>
                        <p style="margin: 0; font-size: 13px; color: #64748b; display: flex; align-items: center; gap: 6px;">
                            ${className} <span style="font-size: 11px; color: #94a3b8;">• ${uploadedTime}</span>
                        </p>
                    </div>
                    <span class="video-visibility-badge ${badgeClass}">${badgeLabel}</span>
                </div>
                <div style="font-size: 13px; color: #475569; margin-bottom: 15px; line-height: 1.5;">
                    ${video.content ? video.content.substring(0, 80) + '...' : 'No description provided.'}
                </div>
            </div>
            <div class="video-card-actions" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; padding: 12px 18px; border-top: 1px solid #f1f5f9; background: #f8fafc;">
                <button onclick="openEditVideo('${video.id}')" style="padding: 8px; font-size: 12px; background: #fff; border: 1px solid #e2e8f0; border-radius: 6px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 4px; color: #4a5568;">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2-2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg> Edit
                </button>
                <button onclick="openWatchVideoModal('${optimizedVideoUrl}')" style="padding: 8px; font-size: 12px; background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 6px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 4px; color: #1d4ed8;">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="23 7 16 12 23 17 23 7"></polygon><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect></svg> Watch
                </button>
                <button onclick="deleteVideo('${video.id}')" style="padding: 8px; font-size: 12px; background: #fef2f2; border: 1px solid #fecaca; border-radius: 6px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 4px; color: #dc2626;">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path></svg> Delete
                </button>
            </div>
        </div>
    `;
}

function updateStats() {
    const total = allVideos.length;
    const publicCount = allVideos.filter(e => e.is_public === true || e.is_public === 'true').length;
    const restrictedCount = total - publicCount;

    document.getElementById('statTotalNum').textContent = total;
    document.getElementById('statPublicNum').textContent = publicCount;
    document.getElementById('statRestrictedNum').textContent = restrictedCount;
}

// Watch Video Modal Logic
function openWatchVideoModal(url) {
    if (!url || url === '#') return;
    let embedUrl = url;
    if (embedUrl.includes('drive.google.com') && embedUrl.includes('/view')) {
        embedUrl = embedUrl.replace(/\/view.*$/, '/preview');
    }
    const oldIframe = document.getElementById('watchVideoIframe');
    const newIframe = oldIframe.cloneNode(false);
    newIframe.src = embedUrl;
    oldIframe.parentNode.replaceChild(newIframe, oldIframe);
    document.getElementById('watchVideoModal').classList.add('open');
}

function closeWatchVideoModal() {
    document.getElementById('watchVideoModal').classList.remove('open');
    const oldIframe = document.getElementById('watchVideoIframe');
    const newIframe = oldIframe.cloneNode(false);
    newIframe.removeAttribute('src');
    oldIframe.parentNode.replaceChild(newIframe, oldIframe);
}

function closeWatchVideoModalOnOverlay(e) {
    if (e.target === document.getElementById('watchVideoModal')) {
        closeWatchVideoModal();
    }
}

function openVideoModal() {
    editingVideoId = null;
    document.getElementById('videoForm').reset();
    document.getElementById('videoModalTitle').textContent = 'Upload Class Video';
    document.getElementById('videoSaveBtn').innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg> Save Video';
    
    document.getElementById('videoThumbnailUrl').value = '';
    document.getElementById('videoMediaUrl').value = '';
    if (document.getElementById('studentSearchInput')) {
        document.getElementById('studentSearchInput').value = '';
    }
    document.getElementById('thumbnailUploadStatus').textContent = '';
    document.getElementById('videoUploadStatus').textContent = '';
    document.getElementById('currentMediaLinksContainer').style.display = 'none';
    document.getElementById('mainDriveProgressWrap').style.display = 'none';
    
    document.getElementById('videoIsHidden').checked = false;
    document.querySelectorAll('input[name="videoSelectedClasses"]').forEach(cb => cb.checked = false);
    document.getElementById('videoVisibility').value = 'restricted';
    window.currentEditSelectedStudents = [];
    window.handleVisibilityChange();

    if (document.getElementById('showAllStudentsCheckbox')) {
        document.getElementById('showAllStudentsCheckbox').checked = false;
    }
    document.getElementById('videoModal').classList.add('open');
}

async function openEditVideo(videoId) {
    const video = allVideos.find(e => e.id === videoId);
    if (!video) return;

    editingVideoId = videoId;
    document.getElementById('videoTitle').value = video.title || '';
    
    document.querySelectorAll('input[name="videoSelectedClasses"]').forEach(cb => cb.checked = false);
    const savedClasses = Array.isArray(video.class_id) ? video.class_id : (video.class_id ? String(video.class_id).split(',') : []);
    savedClasses.forEach(cid => {
        const cb = document.querySelector(`input[name="videoSelectedClasses"][value="${cid}"]`);
        if (cb) cb.checked = true;
    });
    document.getElementById('videoContent').value = video.content || '';
    
    document.getElementById('videoIsHidden').checked = video.is_hidden === true || video.is_hidden === 'true';
    document.getElementById('videoVisibility').value = video.visibility_mode || ((video.is_public === true || video.is_public === 'true') ? 'public' : 'restricted');
    
    if (document.getElementById('showAllStudentsCheckbox')) {
        document.getElementById('showAllStudentsCheckbox').checked = false;
    }
    
    // Load allowed students from video_students table
    window.currentEditSelectedStudents = [];
    try {
        const vsRes = await fetch(`${VIDEO_STUDENTS_API}?video_id=${videoId}`, { headers: { 'x-api-key': X_API_KEY } });
        if (vsRes.ok) {
            const vsData = await vsRes.json();
            const vsItems = Array.isArray(vsData) ? vsData : (vsData.items || []);
            window.currentEditSelectedStudents = vsItems.map(r => String(r.student_id));
        }
    } catch(e) {
        console.warn('Could not load video_students:', e);
    }

    // If this video has saved students, auto-enable "Show all students"
    // so the list populates without requiring class selection
    const visMode = video.visibility_mode || 'restricted';
    if (visMode === 'students' && window.currentEditSelectedStudents.length > 0) {
        const showAllCb = document.getElementById('showAllStudentsCheckbox');
        if (showAllCb) showAllCb.checked = true;
    }

    window.handleVisibilityChange();
    
    document.getElementById('videoThumbnailUrl').value = video.thumbnail_url || '';
    document.getElementById('videoMediaUrl').value = video.video_url || '';
    if (document.getElementById('studentSearchInput')) {
        document.getElementById('studentSearchInput').value = '';
    }
    
    document.getElementById('thumbnailUploadStatus').textContent = '';
    document.getElementById('videoUploadStatus').textContent = '';
    document.getElementById('mainDriveProgressWrap').style.display = 'none';
    
    document.getElementById('videoThumbnailFile').value = '';
    document.getElementById('videoMediaFile').value = '';
    
    const linksContainer = document.getElementById('currentMediaLinksContainer');
    if (video.thumbnail_url || video.video_url) {
        linksContainer.style.display = 'block';
        const tLink = document.getElementById('viewThumbnailLink');
        const vLink = document.getElementById('viewVideoLink');
        if(video.thumbnail_url) { tLink.style.display = 'block'; tLink.onclick = function(e) { e.preventDefault(); if(window.api && window.api.openExternalBrowser) window.api.openExternalBrowser(video.thumbnail_url); else window.open(video.thumbnail_url, '_blank'); }; } else { tLink.style.display = 'none'; }
        if(video.video_url) { vLink.style.display = 'block'; vLink.onclick = function(e) { e.preventDefault(); openWatchVideoModal(video.video_url); }; } else { vLink.style.display = 'none'; }
    } else {
        linksContainer.style.display = 'none';
    }

    document.getElementById('videoModalTitle').textContent = 'Edit Video';
    document.getElementById('videoSaveBtn').innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg> Update Video';
    document.getElementById('videoModal').classList.add('open');
}

function closeVideoModal() {
    document.getElementById('videoModal').classList.remove('open');
    document.getElementById('videoForm').reset();
    editingVideoId = null;
}

function closeModalOnOverlay(e) {
    if (e.target === document.getElementById('videoModal')) {
        closeVideoModal();
    }
}

async function saveVideo(e) {
    e.preventDefault();

    const saveBtn = document.getElementById('videoSaveBtn');
    saveBtn.disabled = true;
    
    const thumbInput = document.getElementById('videoThumbnailFile');
    const videoInput = document.getElementById('videoMediaFile');
    
    let thumbnailUrl = document.getElementById('videoThumbnailUrl').value;
    let videoUrl = document.getElementById('videoMediaUrl').value;
    
    const progressWrap = document.getElementById('mainDriveProgressWrap');
    const progressFill = document.getElementById('mainDriveProgressFill');
    const progressLabel = document.getElementById('mainDriveProgressLabel');
    const progressPct = document.getElementById('mainDriveProgressPct');

    const needsDriveAuth = (videoInput.files.length > 0);
    
    if (needsDriveAuth && (!window.DriveAuth || !window.DriveAuth.currentUser)) {
        alert('Please sign in with Google to upload video files.');
        saveBtn.disabled = false;
        return;
    }

    try {
        if (thumbInput.files.length > 0 || videoInput.files.length > 0) {
            progressWrap.style.display = 'block';
        }

        // Upload Thumbnail to Cloudinary
        if (thumbInput.files.length > 0) {
            const thumbFile = thumbInput.files[0];
            document.getElementById('thumbnailUploadStatus').textContent = 'Uploading to Cloudinary...';
            progressLabel.textContent = "Thumbnail: Uploading...";
            progressFill.style.width = '30%';
            
            const formData = new FormData();
            formData.append('file', thumbFile);
            formData.append('upload_preset', 'thumbnails-edurix');
            
            const res = await fetch('https://api.cloudinary.com/v1_1/dnpditgef/image/upload', {
                method: 'POST',
                body: formData
            });
            
            if (!res.ok) throw new Error('Cloudinary upload failed');
            const data = await res.json();
            thumbnailUrl = data.secure_url.replace('/upload/', '/upload/f_webp/');
            
            progressFill.style.width = '50%';
            document.getElementById('thumbnailUploadStatus').textContent = 'Thumbnail uploaded successfully.';
        }
        
        // Upload Video to Google Drive
        if (needsDriveAuth) {
            await window.DriveAuth.ensureAccessToken();
            const vidFile = videoInput.files[0];
            document.getElementById('videoUploadStatus').textContent = 'Uploading...';
            
            const vidFileId = await window.DriveAuth.uploadFile(vidFile, (pct, msg) => {
                const basePct = thumbInput.files.length > 0 ? 50 : 0;
                const scaledPct = basePct + (pct / (100 / (100 - basePct)));
                progressFill.style.width = scaledPct + '%';
                progressLabel.textContent = "Video: " + msg;
                progressPct.textContent = Math.round(scaledPct) + '%';
            }, "Edurix-Videos");
            
            await window.DriveAuth.setPermission(vidFileId);
            videoUrl = `https://drive.google.com/file/d/${vidFileId}/view?usp=sharing`;
            document.getElementById('videoUploadStatus').textContent = 'Video uploaded successfully.';
        }
        
        if (thumbInput.files.length > 0 || videoInput.files.length > 0) {
            progressLabel.textContent = 'All uploads complete!';
            progressFill.style.width = '100%';
            progressPct.textContent = '100%';
            setTimeout(() => { progressWrap.style.display = 'none'; }, 1500);
        }
        
    } catch (err) {
        console.error('Upload error:', err);
        alert('Upload failed: ' + err.message);
        progressWrap.style.display = 'none';
        saveBtn.disabled = false;
        return;
    }

    const currentId = getActivatedId();
    const now = new Date().toISOString();
    
    const visibilityMode = document.getElementById('videoVisibility').value;
    const isHidden = document.getElementById('videoIsHidden').checked;
    
    let allowedStudents = [];
    if (visibilityMode === 'students') {
        const checkboxes = document.querySelectorAll('input[name="videoSelectedStudents"]:checked');
        allowedStudents = Array.from(checkboxes).map(cb => cb.value);
    }
    
    const classCheckboxes = document.querySelectorAll('input[name="videoSelectedClasses"]:checked');
    const classIds = Array.from(classCheckboxes).map(cb => cb.value);
    
    if (visibilityMode === 'restricted' && classIds.length === 0) {
        alert('Please select at least one class.');
        saveBtn.disabled = false;
        return;
    }
    
    if (visibilityMode === 'students' && allowedStudents.length === 0) {
        alert('Please select at least one student.');
        saveBtn.disabled = false;
        return;
    }
    
    const payload = {
        title: document.getElementById('videoTitle').value.trim(),
        class_id: classIds.join(','),
        is_public: visibilityMode === 'public',
        visibility_mode: visibilityMode,
        is_hidden: isHidden,
        content: document.getElementById('videoContent').value.trim(),
        teacher_id: currentId,
        updated: now
    };

    if (thumbnailUrl) payload.thumbnail_url = thumbnailUrl;
    if (videoUrl) payload.video_url = videoUrl;

    if (!editingVideoId) {
        payload.created = now;
    }

    try {
        const url = editingVideoId ? `${CLASS_VIDEOS_API}/${editingVideoId}` : CLASS_VIDEOS_API;
        const method = editingVideoId ? 'PUT' : 'POST';

        console.log('Sending payload:', JSON.stringify(payload, null, 2));

        const response = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json', 'x-api-key': X_API_KEY },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            let errBody = '';
            try { errBody = await response.text(); } catch(e) {}
            console.error(`Server ${response.status} error:`, errBody);
            throw new Error(`Failed to save video data: ${errBody}`);
        }

        const savedVideo = await response.json();
        const savedVideoId = savedVideo.id || editingVideoId;

        // Save to video_students table
        if (visibilityMode === 'students' && savedVideoId) {
            // 1. Delete existing rows for this video
            const existingRes = await fetch(`${VIDEO_STUDENTS_API}?video_id=${savedVideoId}`, { headers: { 'x-api-key': X_API_KEY } });
            if (existingRes.ok) {
                const existingData = await existingRes.json();
                const itemsToDelete = Array.isArray(existingData) ? existingData : (existingData.items || []);
                await Promise.all(itemsToDelete.map(item => 
                    fetch(`${VIDEO_STUDENTS_API}/${item.id}`, { method: 'DELETE', headers: { 'x-api-key': X_API_KEY } })
                ));
            }

            // 2. Bulk insert one row per selected student
            const now2 = new Date().toISOString();
            await Promise.all(allowedStudents.map(studentId =>
                fetch(VIDEO_STUDENTS_API, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'x-api-key': X_API_KEY },
                    body: JSON.stringify({ video_id: savedVideoId, student_id: studentId, created: now2, updated: now2 })
                })
            ));
        } else if (visibilityMode !== 'students' && (editingVideoId)) {
            // If switched away from 'students' mode, clean up old rows
            const existingRes = await fetch(`${VIDEO_STUDENTS_API}?video_id=${editingVideoId}`, { headers: { 'x-api-key': X_API_KEY } });
            if (existingRes.ok) {
                const existingData = await existingRes.json();
                const itemsToDelete = Array.isArray(existingData) ? existingData : (existingData.items || []);
                await Promise.all(itemsToDelete.map(item => 
                    fetch(`${VIDEO_STUDENTS_API}/${item.id}`, { method: 'DELETE', headers: { 'x-api-key': X_API_KEY } })
                ));
            }
        }

        closeVideoModal();
        await fetchVideos();
    } catch (error) {
        console.error('Error saving video:', error);
        alert('Failed to save video record. Please try again.');
    } finally {
        saveBtn.disabled = false;
    }
}

async function deleteVideo(videoId) {
    if (!(await window.customConfirm?.('Delete this video? This cannot be undone.') ?? confirm('Delete this video? This cannot be undone.'))) return;
    try {
        const response = await fetch(`${CLASS_VIDEOS_API}/${videoId}`, {
            method: 'DELETE',
            headers: { 'x-api-key': X_API_KEY }
        });
        if (!response.ok) throw new Error('Failed to delete video');
        await fetchVideos();
    } catch (error) {
        console.error('Error deleting video:', error);
        alert('Failed to delete video.');
    }
}

document.getElementById('filterClass').addEventListener('change', renderVideos);
document.getElementById('searchVideoInput').addEventListener('input', renderVideos);

// ---- Expose functions to global scope (required for type="module") ----
window.openVideoModal             = openVideoModal;
window.closeVideoModal            = closeVideoModal;
window.closeModalOnOverlay        = closeModalOnOverlay;
window.saveVideo                  = saveVideo;
window.openEditVideo              = openEditVideo;
window.deleteVideo                = deleteVideo;
window.openWatchVideoModal        = openWatchVideoModal;
window.closeWatchVideoModal       = closeWatchVideoModal;
window.closeWatchVideoModalOnOverlay = closeWatchVideoModalOnOverlay;

fetchClasses();
