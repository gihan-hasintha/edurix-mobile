// Inject custom alert globally
(function() {
    // Clear logged in user on new application session (effectively clearing on app close)
    if (!sessionStorage.getItem('app_session_started')) {
        localStorage.removeItem('LoggedInUser');
        sessionStorage.setItem('app_session_started', 'true');
    }

    if (!document.getElementById('custom-alert-script')) {
        const script = document.createElement('script');
        script.id = 'custom-alert-script';
        // Determine the correct path to custom-alert.js
        const inAdminFolder = window.location.href.includes('/admin/') || window.location.href.includes('\\admin\\');
        script.src = inAdminFolder ? '../assets/js/custom-alert.js' : './assets/js/custom-alert.js';
        document.head.appendChild(script);
    }
})();

(function() {
    const API_URL = 'https://api.edurix.imatap.com';
    const X_API_KEY = '996de2d470a0f1e9794b7778e216c193258aac001b36813f9ad1d3f957cc7ee7';

    async function updateSchoolName() {
        const schoolNameDisplay = document.getElementById('navbar-for-application-content-left-school-name');
        if (!schoolNameDisplay) return;
        
        // Try the new key first, fall back to old for migration if needed
        const activatedData = localStorage.getItem('Activated_Teacher') || localStorage.getItem('Activated_Institution');
        if (!activatedData || activatedData === 'undefined') {
            schoolNameDisplay.textContent = 'Activation Required';
            return;
        }

        let stored;
        try {
            stored = JSON.parse(activatedData);
        } catch (e) {
            schoolNameDisplay.textContent = 'Activation Required';
            return;
        }
        
        schoolNameDisplay.textContent = 'Loading...';

        try {
            const response = await fetch(`${API_URL}/teachers`, {
                headers: { 'x-api-key': X_API_KEY }
            });
            if (!response.ok) throw new Error('Failed to fetch');

            const data = await response.json();
            const teachers = Array.isArray(data) ? data : (data.items || []);
            
            // Check both old and new ID field names for compatibility during transition
            const teacher = teachers.find(t => 
                (t.teacher_id && t.teacher_id === stored.teacher_id) || 
                (t.teacher_id && t.teacher_id === stored.institution_id)
            );

            if (teacher) {
                schoolNameDisplay.textContent = teacher.name;
            } else {
                schoolNameDisplay.textContent = 'Unknown Account';
            }
        } catch (error) {
            console.error('Error fetching teacher name:', error);
            schoolNameDisplay.textContent = 'Offline';
        }
    }

    async function updateAppVersion() {
        const versionDisplays = [
            document.getElementById('app-version-display'),
            document.getElementById('navbar-for-application-version-show-left-school-name')
        ];
        
        if (!versionDisplays.some(el => el)) return;

        try {
            const version = window.api?.env?.APP_VERSION || '1.0.0';
            
            versionDisplays.forEach(el => {
                if (el) {
                    if (el.id === 'navbar-for-application-version-show-left-school-name') {
                        el.textContent = 'v' + version;
                    } else {
                        el.textContent = version;
                    }
                }
            });
        } catch (error) {
            console.error('Error fetching app version:', error);
            versionDisplays.forEach(el => {
                if (el) {
                    if (el.id === 'app-version-display') {
                        el.textContent = 'Unknown';
                    }
                }
            });
        }
    }

    function init() {
        updateSchoolName();
        updateAppVersion();
    }

    // Run on load and also immediately in case the DOM is already ready
    if (document.readyState === 'loading') {
        window.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
