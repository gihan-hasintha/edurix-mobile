document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('studentRegistrationForm');
    const submitBtn = document.getElementById('submitBtn');
    const statusMessage = document.getElementById('statusMessage');

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        // Reset message
        statusMessage.className = 'message';
        statusMessage.textContent = '';
        
        // Set loading state
        submitBtn.classList.add('loading');

        // Gather data
        const formData = new FormData(form);
        const payload = {
            name: formData.get('name'),
            address: formData.get('address'),
            phone_number: formData.get('phone_number'),
            parent_phone_numbers: formData.get('parent_phone_numbers'),
            parent_first_name: formData.get('parent_first_name'),
            birthday: formData.get('birthday')
        };

        try {
            const res = await fetch(window.api.env.API_URL, {
                method: 'POST',
                headers: {
                    'content-type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            const responseData = await res.json();

            if (res.ok) {
                // Success
                statusMessage.textContent = 'Student record saved successfully!';
                statusMessage.className = 'message success';
                form.reset();
            } else {
                // Server error
                statusMessage.textContent = responseData.message || 'Failed to save student record. Please try again.';
                statusMessage.className = 'message error';
            }

        } catch (error) {
            // Network error
            statusMessage.textContent = 'Network error. Could not connect to the server.';
            statusMessage.className = 'message error';
            console.error('Submission error:', error);
        } finally {
            // Remove loading state
            submitBtn.classList.remove('loading');
            
            // Auto hide message after 5 seconds
            setTimeout(() => {
                if (statusMessage.classList.contains('success')) {
                    statusMessage.className = 'message';
                }
            }, 5000);
        }
    });
});
