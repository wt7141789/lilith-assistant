/**
 * Update Manager for Lilith Assistant
 * Checks for updates from GitHub and notifies the user in the ST sidebar.
 */

export const UpdateManager = {
    // Current version - should match manifest.json
    localVersion: "2.5.9",
    // Remote manifest URL
    remoteUrl: "https://raw.githubusercontent.com/wt7141789/lilith-assistant/main/manifest.json",
    
    // State
    hasUpdate: false,
    remoteVersion: null,

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
            this.remoteVersion = remoteManifest.version;

            if (this.isNewer(this.remoteVersion, this.localVersion)) {
                this.hasUpdate = true;
                console.log(`[Lilith] Update found! Remote: ${this.remoteVersion}, Local: ${this.localVersion}`);
                this.showUpdateBadge();
                
                // [新增] 发现更新时自动推送通知
                if (typeof toastr !== 'undefined') {
                    toastr.info(`莉莉丝助手发现新版本 v${this.remoteVersion}，请前往设置或侧边栏点击更新。`, '更新推送', {
                        onclick: () => {
                            // Optionally open settings or just update directly if clicked
                            // For now just a notification is enough to count as "push"
                        }
                    });
                }
            } else {
                this.hasUpdate = false;
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
     * Perform update and force refresh the webpage
     */
    async updateAndReload() {
        console.log('[Lilith] Starting update and reload...');
        try {
            if (typeof window.executeSlashCommands === 'function') {
                // Trigger ST's internal extension update command
                await window.executeSlashCommands('/extension update lilith-assistant');
                
                if (typeof toastr !== 'undefined') {
                    toastr.info('更新指令已发出，3秒后自动刷新网页以加载新版本...', '莉莉丝助手');
                }
                
                // Wait for the server-side git pull/update to complete
                setTimeout(() => {
                    // Not just refreshing the UI, but a full browser page reload
                    window.location.href = window.location.href; 
                }, 3000);
            } else {
                // Fallback for unexpected environments
                window.location.reload();
            }
        } catch (err) {
            console.error('[Lilith] Update/Reload failed:', err);
            window.location.reload();
        }
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
                    const $badge = jQuery('<span class="lilith-update-badge" style="background:#ff0055; color:#fff; font-size:10px; padding:2px 6px; border-radius:3px; margin-left:5px; vertical-align: middle; box-shadow: 0 0 5px #ff0055; cursor:pointer; font-weight:bold; transition: transform 0.2s;" title="点击执行插件更新">更新!</span>');
                    
                    // Add click handler for auto-refresh update
                    $badge.on('click', async (e) => {
                        e.stopPropagation(); // Prevents folding the drawer
                        if (confirm('莉莉丝助手发现新版本，是否立即执行更新？\n(更新完成后会自动刷新网页)')) {
                            $badge.text('更新中...').css('background', '#555');
                            await UpdateManager.updateAndReload();
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
