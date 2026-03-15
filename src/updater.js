// ==================== AUTO UPDATER ====================

// Check for updates on app start
document.addEventListener('DOMContentLoaded', () => {
    checkForUpdates();
    
    // Check again every 24 hours
    setInterval(checkForUpdates, 24 * 60 * 60 * 1000);
});

// Listen for update events from backend
if (window.__TAURI__) {
    window.__TAURI__.event.listen('update-available', (event) => {
        showUpdateNotification(event.payload);
    });
}

// Check for updates
async function checkForUpdates() {
    if (!window.__TAURI__) return;
    
    try {
        const { invoke } = window.__TAURI__;
        const updateCheck = await invoke('check_for_updates');
        
        if (updateCheck.has_update) {
            showUpdateNotification(updateCheck);
        }
        
        return updateCheck;
    } catch (error) {
        console.error('Failed to check for updates:', error);
    }
}

// Show update notification
function showUpdateNotification(updateInfo) {
    // Don't show if user already dismissed
    if (sessionStorage.getItem('updateDismissed') === updateInfo.latest_version) {
        return;
    }
    
    // Create notification element
    const notification = document.createElement('div');
    notification.className = 'update-notification';
    notification.innerHTML = `
        <div class="update-content">
            <div class="update-icon">🎉</div>
            <div class="update-text">
                <h4>New Update Available</h4>
                <p>OpenEgo v${updateInfo.latest_version} is now available</p>
                ${updateInfo.version_info?.notes ? `<small>${updateInfo.version_info.notes}</small>` : ''}
            </div>
            <div class="update-actions">
                <button class="btn-update-install" onclick="installUpdate(${JSON.stringify(updateInfo.version_info).replace(/"/g, '&quot;')})">
                    Update Now
                </button>
                <button class="btn-update-later" onclick="dismissUpdate('${updateInfo.latest_version}')">
                    Later
                </button>
                <button class="btn-update-skip" onclick="skipUpdateVersion('${updateInfo.latest_version}')">
                    Skip This Version
                </button>
            </div>
        </div>
    `;
    
    // Add to page
    document.body.appendChild(notification);
    
    // Animate in
    setTimeout(() => {
        notification.classList.add('show');
    }, 100);
}

// Install update
async function installUpdate(versionInfo) {
    if (!window.__TAURI__) return;
    
    const { invoke } = window.__TAURI__;
    
    // Show downloading state
    const notification = document.querySelector('.update-notification');
    if (notification) {
        notification.querySelector('.update-text').innerHTML = `
            <h4>Downloading Update...</h4>
            <p>Please wait while we download v${versionInfo.version}</p>
            <div class="update-progress">
                <div class="update-progress-bar"></div>
            </div>
        `;
        notification.querySelector('.update-actions').style.display = 'none';
    }
    
    try {
        await invoke('install_update', { versionInfo });
        
        // App will restart automatically
        showToast('Update installed! Restarting...', 'success');
    } catch (error) {
        console.error('Failed to install update:', error);
        showToast('Update failed: ' + error, 'error');
        
        // Restore notification
        if (notification) {
            notification.remove();
            showUpdateNotification({ version_info: versionInfo, latest_version: versionInfo.version });
        }
    }
}

// Dismiss update (remind later)
function dismissUpdate(version) {
    sessionStorage.setItem('updateDismissed', version);
    
    const notification = document.querySelector('.update-notification');
    if (notification) {
        notification.classList.remove('show');
        setTimeout(() => notification.remove(), 300);
    }
}

// Skip this version (don't remind again)
async function skipUpdateVersion(version) {
    if (!window.__TAURI__) return;
    
    try {
        const { invoke } = window.__TAURI__;
        await invoke('skip_update_version', { version });
        
        showToast(`Skipped v${version}. Won\'t remind again.`, 'info');
        
        const notification = document.querySelector('.update-notification');
        if (notification) {
            notification.classList.remove('show');
            setTimeout(() => notification.remove(), 300);
        }
    } catch (error) {
        console.error('Failed to skip version:', error);
    }
}

// Show toast notification
function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    
    document.body.appendChild(toast);
    
    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}
