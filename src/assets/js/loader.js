document.getElementById("loading-window-content-for-all").innerHTML = `
<style>
    /* Fullscreen Overlay Styling applied directly to the parent */
    #loading-window {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100vh;
        background-color: rgba(255, 255, 255, 0.95);
        z-index: 999999;
        backdrop-filter: blur(8px);
        /* The inline style.display handles the visibility */
    }

    .premium-loader-wrapper {
        width: 100%;
        height: 100%;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 24px;
    }
    .premium-spinner {
        width: 60px;
        height: 60px;
        position: relative;
    }
    .premium-spinner-ring {
        box-sizing: border-box;
        display: block;
        position: absolute;
        width: 60px;
        height: 60px;
        border: 4px solid transparent;
        border-radius: 50%;
        animation: premiumSpin 1.2s cubic-bezier(0.5, 0, 0.5, 1) infinite;
    }
    .premium-spinner-ring:nth-child(1) {
        border-top-color: #3b82f6;
        animation-delay: -0.45s;
    }
    .premium-spinner-ring:nth-child(2) {
        border-right-color: #60a5fa;
        animation-delay: -0.3s;
    }
    .premium-spinner-ring:nth-child(3) {
        border-bottom-color: #10b981;
        animation-delay: -0.15s;
    }
    .premium-loader-text {
        font-family: 'Inter', system-ui, sans-serif;
        font-size: 14px;
        font-weight: 700;
        color: #3b82f6;
        letter-spacing: 1.5px;
        text-transform: uppercase;
        animation: premiumPulse 2s ease-in-out infinite;
    }
    @keyframes premiumSpin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
    }
    @keyframes premiumPulse {
        0%, 100% { opacity: 0.4; }
        50% { opacity: 1; }
    }
</style>
<div class="premium-loader-wrapper">
    <div class="premium-spinner">
        <div class="premium-spinner-ring"></div>
        <div class="premium-spinner-ring"></div>
        <div class="premium-spinner-ring"></div>
    </div>
    <div class="premium-loader-text">Loading</div>
</div>
`;