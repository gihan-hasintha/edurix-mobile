(function() {
    if (window.customAlert) return; // Prevent multiple initializations

    // Inject CSS
    const style = document.createElement('style');
    style.id = 'custom-alert-style';
    style.textContent = `
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

        .custom-alert-overlay {
            position: fixed;
            top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(0, 0, 0, 0.4);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 999999;
            opacity: 0;
            transition: opacity 0.3s ease;
        }
        .custom-alert-overlay.show {
            opacity: 1;
        }
        .custom-alert-box {
            background: white;
            border-radius: 4px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.15);
            width: 350px;
            max-width: 90%;
            transform: translateY(-20px);
            transition: transform 0.3s ease;
            display: flex;
            flex-direction: column;
            font-family: 'Inter', sans-serif;
            border: 1px solid #e5e7eb;
        }
        .custom-alert-overlay.show .custom-alert-box {
            transform: translateY(0);
        }
        .custom-alert-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 12px 16px;
            border-bottom: 1px solid #f3f4f6;
        }
        .custom-alert-title-container {
            display: flex;
            align-items: center;
            gap: 10px;
        }
        .custom-alert-icon {
            width: 24px;
            height: 24px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .custom-alert-icon.success {
            background: #10b981;
        }
        .custom-alert-icon.error {
            background: #ef4444;
        }
        .custom-alert-icon svg {
            width: 14px;
            height: 14px;
            stroke: white;
            stroke-width: 2.5;
            stroke-linecap: round;
            stroke-linejoin: round;
            fill: none;
        }
        .custom-alert-title {
            font-size: 16px;
            font-weight: 600;
        }
        .custom-alert-title.success {
            color: #065f46;
        }
        .custom-alert-title.error {
            color: #991b1b;
        }
        .custom-alert-close-btn {
            background: #f9fafb;
            border: 1px solid #f3f4f6;
            color: #9ca3af;
            width: 28px;
            height: 28px;
            border-radius: 2px;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            font-size: 16px;
            line-height: 1;
            padding: 0;
            transition: all 0.2s;
        }
        .custom-alert-close-btn:hover {
            background: #f3f4f6;
            color: #4b5563;
        }
        .custom-alert-body {
            padding: 16px;
            font-size: 14px;
            color: #4b5563;
            text-align: left;
            line-height: 1.5;
        }
        .custom-alert-footer {
            padding: 12px 16px;
            border-top: 1px solid #f3f4f6;
            display: flex;
            justify-content: flex-end;
            background: #fafafa;
            border-bottom-left-radius: 4px;
            border-bottom-right-radius: 4px;
        }
        .custom-alert-btn {
            background: #6200ea;
            color: white;
            border: none;
            padding: 8px 24px;
            border-radius: 2px;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            transition: background 0.2s;
        }
        .custom-alert-btn:hover {
            background: #5000c2;
        }
        .custom-alert-btn.error {
            background: #ef4444;
        }
        .custom-alert-btn.error:hover {
            background: #dc2626;
        }
        .custom-alert-btn.cancel {
            background: #f3f4f6;
            color: #4b5563;
            margin-right: 8px;
        }
        .custom-alert-btn.cancel:hover {
            background: #e5e7eb;
        }
    `;
    document.head.appendChild(style);

    window.customAlert = function(message, type = 'success', title = null) {
        if (!title) {
            title = type === 'success' ? 'Success' : 'Error';
        }

        const overlay = document.createElement('div');
        overlay.className = 'custom-alert-overlay';
        
        let iconSvg = '';
        let btnClass = type === 'error' ? 'error' : 'success';
        
        if (type === 'success') {
            iconSvg = '<svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"></path></svg>';
        } else {
            iconSvg = '<svg viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"></path></svg>';
        }

        overlay.innerHTML = `
            <div class="custom-alert-box">
                <div class="custom-alert-header">
                    <div class="custom-alert-title-container">
                        <div class="custom-alert-icon ${type}">
                            ${iconSvg}
                        </div>
                        <div class="custom-alert-title ${type}">${title}</div>
                    </div>
                    <button class="custom-alert-close-btn">&times;</button>
                </div>
                <div class="custom-alert-body">
                    ${message}
                </div>
                <div class="custom-alert-footer">
                    <button class="custom-alert-btn ${btnClass}">OK</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        // Force reflow
        overlay.offsetHeight;
        overlay.classList.add('show');

        // Handle enter/escape key to close
        const keydownHandler = function(e) {
            if (e.key === 'Enter' || e.key === 'Escape') {
                closeAlert();
            }
        };
        document.addEventListener('keydown', keydownHandler);

        function closeAlert() {
            document.removeEventListener('keydown', keydownHandler);
            overlay.classList.remove('show');
            setTimeout(() => {
                if (overlay.parentNode) {
                    overlay.parentNode.removeChild(overlay);
                }
            }, 300);
        }

        const closeBtn = overlay.querySelector('.custom-alert-close-btn');
        const okBtn = overlay.querySelector('.custom-alert-btn');
        
        closeBtn.addEventListener('click', closeAlert);
        okBtn.addEventListener('click', closeAlert);
    };

    // Override the native window.alert
    window.alert = function(message) {
        if (!message) return;
        const msgStr = message.toString().toLowerCase();
        
        let type = 'success';
        let title = 'Success';
        
        if (msgStr.includes('failed') || 
            msgStr.includes('error') || 
            msgStr.includes('invalid') || 
            msgStr.includes('cannot') ||
            msgStr.includes('please enter') ||
            msgStr.includes('no students')) {
            type = 'error';
            title = 'Error';
        } else if (msgStr.includes('coming soon')) {
            type = 'success';
            title = 'Coming Soon';
        }
        
        window.customAlert(message, type, title);
    };

    // Custom confirm dialog (returns a Promise)
    window.customConfirm = function(message, title = 'Confirm Action') {
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.className = 'custom-alert-overlay';
            
            // Default icon is a question mark or warning
            const iconSvg = '<svg viewBox="0 0 24 24"><path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>';
            
            overlay.innerHTML = `
                <div class="custom-alert-box">
                    <div class="custom-alert-header">
                        <div class="custom-alert-title-container">
                            <div class="custom-alert-icon error">
                                ${iconSvg}
                            </div>
                            <div class="custom-alert-title">${title}</div>
                        </div>
                        <button class="custom-alert-close-btn">&times;</button>
                    </div>
                    <div class="custom-alert-body">
                        ${message}
                    </div>
                    <div class="custom-alert-footer">
                        <button class="custom-alert-btn cancel">Cancel</button>
                        <button class="custom-alert-btn error">OK</button>
                    </div>
                </div>
            `;

            document.body.appendChild(overlay);

            // Force reflow
            overlay.offsetHeight;
            overlay.classList.add('show');

            // Handle keydown events
            const keydownHandler = function(e) {
                if (e.key === 'Enter') {
                    finish(true);
                } else if (e.key === 'Escape') {
                    finish(false);
                }
            };
            document.addEventListener('keydown', keydownHandler);

            function finish(result) {
                document.removeEventListener('keydown', keydownHandler);
                overlay.classList.remove('show');
                setTimeout(() => {
                    if (overlay.parentNode) {
                        overlay.parentNode.removeChild(overlay);
                    }
                    resolve(result);
                }, 300);
            }

            const closeBtn = overlay.querySelector('.custom-alert-close-btn');
            const cancelBtn = overlay.querySelector('.custom-alert-btn.cancel');
            const okBtn = overlay.querySelector('.custom-alert-btn.error');
            
            closeBtn.addEventListener('click', () => finish(false));
            cancelBtn.addEventListener('click', () => finish(false));
            okBtn.addEventListener('click', () => finish(true));
        });
    };
})();
