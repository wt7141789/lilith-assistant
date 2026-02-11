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
                    $header.append(' <span class="lilith-update-badge" style="background:#ff0055; color:#fff; font-size:10px; padding:1px 4px; border-radius:3px; margin-left:5px; vertical-align: middle; box-shadow: 0 0 5px #ff0055;">New!</span>');
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
