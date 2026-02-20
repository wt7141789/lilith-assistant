/**
 * Update Manager for Lilith Assistant
 * Checks for updates from GitHub and notifies the user in the ST sidebar.
 */

export const UpdateManager = {
    // Current version - detected from manifest.json on init
    localVersion: "v3.0.5-杂鱼专用版-❤",
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
    async updateAndReload(force = false) {
        if (!force && this.hasUpdate) {
            const confirmMsg = `发现新版本: ${this.remoteVersion}\n当前版本: ${this.localVersion}\n\n是否立即开始自动更新代码并重启页面？`;
            if (typeof SillyTavern !== 'undefined' && SillyTavern.getContext().on_event) {
                // 如果在酒馆环境下，尽量使用原生确认框（这里简单起见用 confirm，或者后续改进）
                if (!confirm(confirmMsg)) return;
            } else {
                if (!confirm(confirmMsg)) return;
            }
        }
        
        console.log('[Lilith] Starting update process...');
        const originalVersion = this.localVersion;
        const targetVersion = this.remoteVersion;
        
        console.log(`[Lilith] Current Local: ${originalVersion}, Target Remote: ${targetVersion}`);

        try {
            const context = typeof SillyTavern !== 'undefined' ? SillyTavern.getContext() : null;
            const executeCmd = (context && context.executeSlashCommands) || window.executeSlashCommands;

            if (typeof executeCmd === 'function') {
                // 1. 发送更新指令 
                // [兼容性修复]：有些旧版本酒馆使用 /extension-update (单数)，新版本使用 /extensions-update (复数)
                // 还有些版本可能完全不支持此指令。我们尝试多个可能的指令。
                console.log('[Lilith] Sending update command...');
                
                // 尝试执行，不再使用 try-catch 因为 executeCmd 内部可能不会抛出 catchable 错误
                // 而是通过返回值的 isError 来判断 (如果支持的话)
                const res = await executeCmd('/extensions-update lilith-assistant');
                
                // 如果返回了错误对象且提示找不到命令，尝试单数版本
                if (res && res.isError && (res.errorMessage || '').includes('Unknown command')) {
                    console.log('[Lilith] Plural command failed, trying singular...');
                    await executeCmd('/extension-update lilith-assistant');
                } else if (!res) {
                    // 如果没有返回值 (旧版)，我们保守起见间隔一秒再发一个单数指令作为冗余
                    setTimeout(() => executeCmd('/extension-update lilith-assistant'), 500);
                }
                
                console.log('[Lilith] Update commands dispatched.');
                
                let toastId = null;
                if (typeof toastr !== 'undefined') {
                    toastId = toastr.info('正在请求云端同步，请勿刷新页面...', '莉莉丝：更新中', { 
                        timeOut: 0, 
                        extendedTimeOut: 0,
                        progressBar: true
                    });
                }
                
                // 2. 轮询检测本地文件系统的 manifest.json 是否变化
                let attempts = 0;
                const maxAttempts = 120; // 延长到 120 秒防止网速慢
                const modulePath = import.meta.url;
                const manifestPath = new URL('../manifest.json', modulePath).href;

                const checkInterval = setInterval(async () => {
                    attempts++;
                    
                    if (toastId && typeof toastr !== 'undefined') {
                        jQuery(toastId).find('.toast-message').text(`正在拉取云端代码并校验（${attempts}s）...`);
                    }

                    try {
                        // 极端抗缓存策略：manifest.json 经常会被浏览器缓存
                        const response = await fetch(`${manifestPath}?t=${Date.now()}_${Math.random()}`);
                        if (response.ok) {
                            const data = await response.json();
                            const currentLocalVersion = data.version;
                            
                            console.log(`[Lilith] Update Polling... On-disk version is: ${currentLocalVersion}`);

                            // 检测逻辑：
                            // 如果 targetVersion 已知，且当前 manifest 版本等于 targetVersion -> 成功
                            // 或者 manifest 版本已经不同于 originalVersion -> 说明代码变了，也视作成功
                            const hasReachedTarget = (targetVersion && currentLocalVersion === targetVersion);
                            const hasChangedFromOriginal = (originalVersion && currentLocalVersion !== originalVersion);

                            if (hasReachedTarget || hasChangedFromOriginal) {
                                clearInterval(checkInterval);
                                console.log(`[Lilith] Update Successful: ${originalVersion} -> ${currentLocalVersion}.`);
                                
                                if (typeof toastr !== 'undefined') {
                                    toastr.success(`代码同步完成！版本已更新至: v${currentLocalVersion}。即将为您刷新页面以生效。`, '更新成功', { timeOut: 5000 });
                                }
                                
                                // 重要：给予 2 秒缓冲区，确保文件系统完全刷入并释放
                                setTimeout(() => {
                                    window.location.reload();
                                }, 2000);
                                return;
                            }
                        }
                    } catch (e) {
                        console.warn('[Lilith] Update poll: failed to fetch manifest', e);
                    }

                    if (attempts >= maxAttempts) {
                        clearInterval(checkInterval);
                        console.error('[Lilith] Update poll timed out.');
                        if (typeof toastr !== 'undefined') {
                            toastr.error('更新响应超时。酒馆后台可能还在下载，请稍后手动刷新网页。', '更新超时', { timeOut: 10000 });
                        }
                    }
                }, 1000);
            } else {
                console.warn('[Lilith] Slash commands not available, fallback to manual reload.');
                window.location.reload();
            }
        } catch (err) {
            console.error('[Lilith] Critical Update Error:', err);
            if (typeof toastr !== 'undefined') toastr.error('执行更新时发生程序错误，请查看控制台。');
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
