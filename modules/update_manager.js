/**
 * Update Manager for Lilith Assistant
 * Checks for updates from GitHub and notifies the user in the ST sidebar.
 */

export const UpdateManager = {
    // Current version - should match manifest.json
    localVersion: "2.5.0",
    // Remote manifest URL
    remoteUrl: "https://raw.githubusercontent.com/wt7141789/lilith-assistant/main/manifest.json",

    /**
     * Check for updates on startup
     */
    async checkUpdate() {
        console.log('[Lilith] Checking for updates...');
        try {
            // Add timestamp to prevent cache
            const response = await fetch(`${this.remoteUrl}?t=${Date.now()}`);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            
            const remoteManifest = await response.json();
            const remoteVersion = remoteManifest.version;

            if (this.isNewer(remoteVersion, this.localVersion)) {
                console.log(`[Lilith] Update found! Remote: ${remoteVersion}, Local: ${this.localVersion}`);
                this.showUpdateBadge();
            } else {
                console.log('[Lilith] Up to date.');
            }
        } catch (e) {
            console.warn('[Lilith] Update check failed (likely offline or GitHub rate limit):', e.message);
        }
    },

    /**
     * Simple semantic version comparison
     */
    isNewer(remote, local) {
        const rParts = remote.split('.').map(v => parseInt(v) || 0);
        const lParts = local.split('.').map(v => parseInt(v) || 0);
        
        for (let i = 0; i < Math.max(rParts.length, lParts.length); i++) {
            const r = rParts[i] || 0;
            const l = lParts[i] || 0;
            if (r > l) return true;
            if (r < l) return false;
        }
        return false;
    },

    /**
     * Inject "New!" badge into the ST settings sidebar
     */
    showUpdateBadge() {
        // Use a poll to wait for the settings HTML to be injected by UIManager
        const maxAttempts = 20;
        let attempts = 0;
        
        const poll = setInterval(() => {
            attempts++;
            const $header = jQuery('#lilith-assistant-settings .inline-drawer-header b');
            
            if ($header.length) {
                // Avoid duplicate badges
                if (!$header.find('.lilith-update-badge').length) {
                    const $badge = jQuery('<span class="lilith-update-badge" style="background:#ff0055; color:#fff; font-size:10px; padding:2px 6px; border-radius:3px; margin-left:5px; vertical-align: middle; box-shadow: 0 0 5px #ff0055; cursor:pointer; font-weight:bold; transition: transform 0.2s;" title="点击更新并自动刷新">New!</span>');
                    
                    // Add click handler for auto-refresh update
                    $badge.on('click', async (e) => {
                        e.stopPropagation(); // Prevents folding the drawer
                        if (confirm('检测到莉莉丝助手有新版本，是否尝试更新并自动刷新网页？')) {
                            $badge.text('更新中...').css('background', '#555');
                            
                            try {
                                // Attempt to trigger ST update command if available
                                if (typeof window.executeSlashCommands === 'function') {
                                    await window.executeSlashCommands('/extension update lilith-assistant');
                                    console.log('[Lilith] Update command sent. Waiting for 2s before reload...');
                                    setTimeout(() => window.location.reload(), 2000);
                                } else {
                                    // Fallback: Just reload if command system is not reachable
                                    window.location.reload();
                                }
                            } catch (err) {
                                console.error('[Lilith] Update failed:', err);
                                window.location.reload(); // Still reload as a fallback
                            }
                        }
                    });

                    // Hover effect
                    $badge.on('mouseenter', () => $badge.css('transform', 'scale(1.1)'));
                    $badge.on('mouseleave', () => $badge.css('transform', 'scale(1.0)'));
                    
                    $header.append($badge);
                }
                clearInterval(poll);
            }
            
            if (attempts >= maxAttempts) {
                clearInterval(poll);
                console.log('[Lilith] Update UI injection timed out (Sidebar might not be open).');
            }
        }, 1000);
    }
};
