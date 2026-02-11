/**
 * Update Manager for Lilith Assistant
 * Checks for updates from GitHub and notifies the user in the ST sidebar.
 */

export const UpdateManager = {
    // Current version - detected from manifest.json on init
    localVersion: "2.5.9",
    // Remote manifest URL
    remoteUrl: "https://raw.githubusercontent.com/wt7141789/lilith-assistant/main/manifest.json",
    
    // State
    hasUpdate: false,
    remoteVersion: null,
    initialized: false,

    /**
     * Initialize the UpdateManager by fetching the local manifest version.
     */
    async init() {
        if (this.initialized) return;
        try {
            // Attempt to get version from local manifest.json
            // We use relative path from this module (modules/update_manager.js -> ../manifest.json)
            const modulePath = import.meta.url;
            const manifestPath = new URL('../manifest.json', modulePath).href;
            
            const response = await fetch(manifestPath + '?t=' + Date.now());
            if (response.ok) {
                const data = await response.json();
                if (data.version) {
                    this.localVersion = data.version;
                    console.log(`[Lilith] Detected local version: ${this.localVersion}`);
                }
            }
        } catch (e) {
            console.warn('[Lilith] Failed to auto-detect local version, using fallback:', e);
        }
        this.initialized = true;
    },

    /**
     * Check for updates on startup
     */
    async checkUpdate() {
        if (!this.initialized) await this.init();
        
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
        const originalVersion = this.localVersion;
        const targetVersion = this.remoteVersion;
        
        console.log(`[Lilith] Current Local: ${originalVersion}, Target Remote: ${targetVersion}`);

        try {
            const context = typeof SillyTavern !== 'undefined' ? SillyTavern.getContext() : null;
            const executeCmd = (context && context.executeSlashCommands) || window.executeSlashCommands;

            if (typeof executeCmd === 'function') {
                // 1. 发送同步指令
                await executeCmd('/extensions-update lilith-assistant');
                console.log('[Lilith] Update command sent to SillyTavern.');
                
                let toastId = null;
                if (typeof toastr !== 'undefined') {
                    toastId = toastr.info('正在拉取云端代码（第 0s）...', '莉莉丝助手', { timeOut: 0, extendedTimeOut: 0 });
                }
                
                // 2. 轮询检测本地文件系统的 manifest.json
                let attempts = 0;
                const maxAttempts = 60; 
                const modulePath = import.meta.url;
                const manifestPath = new URL('../manifest.json', modulePath).href;

                const checkInterval = setInterval(async () => {
                    attempts++;
                    
                    // 每 15 秒重新尝试发送一次更新指令，防止指令丢失
                    if (attempts % 15 === 0) {
                        console.log('[Lilith] Retrying update command...');
                        executeCmd('/extensions-update lilith-assistant');
                    }

                    if (toastId && typeof toastr !== 'undefined') {
                        jQuery(toastId).find('.toast-message').text(`正在拉取云端代码（检测中 ${attempts}s）...`);
                    }

                    try {
                        // 使用更加极端的抗缓存策略
                        const response = await fetch(`${manifestPath}?t=${Date.now()}_${Math.random()}`);
                        if (response.ok) {
                            const data = await response.json();
                            const currentLocalVersion = data.version;
                            
                            console.log(`[Lilith] Polling... Local on disk: ${currentLocalVersion}`);

                            // 重要：只要版本号达到目标，或者发生了变更，就强制刷新
                            // 如果 targetVersion 是 3.0.4 且 currentLocalVersion 变成了 3.0.4，则成功
                            const hasReachedTarget = (currentLocalVersion === targetVersion);
                            const hasChangedSinceStart = (originalVersion && currentLocalVersion !== originalVersion);

                            if (hasReachedTarget || hasChangedSinceStart) {
                                clearInterval(checkInterval);
                                console.log(`[Lilith] Update DETECTED: ${originalVersion} -> ${currentLocalVersion}.`);
                                
                                if (typeof toastr !== 'undefined') {
                                    toastr.success(`检测到代码已同步！版本: v${currentLocalVersion}。即将重启网页...`, '莉莉丝助手');
                                }
                                
                                // 给磁盘 I/O 留一点点最后的写入缓冲时间
                                setTimeout(() => window.location.reload(), 1500);
                            }
                        }
                    } catch (e) {
                        console.warn('[Lilith] Local fetch failed during polling:', e);
                    }

                    if (attempts >= maxAttempts) {
                        clearInterval(checkInterval);
                        console.error('[Lilith] Update poll timed out.');
                        if (typeof toastr !== 'undefined') {
                            toastr.warning('同步检测超时，但代码可能已在后台下载完毕，请点击酒馆上方的“Reload”或手动刷新网页。', '超时提醒', { timeOut: 15000 });
                        }
                    }
                }, 1000);
            } else {
                window.location.reload();
            }
        } catch (err) {
            console.error('[Lilith] Critical Update Error:', err);
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
                        $badge.text('更新中...').css('background', '#555');
                        await UpdateManager.updateAndReload();
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
