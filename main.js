// index.js - Lilith Assistant Entry Point
import { extensionName } from './modules/config.js';
import { userState, validateState, panelChatHistory, migrateData } from './modules/storage.js';
import { UIManager } from './modules/ui_manager.js';
import { assistantManager } from './modules/assistant_manager.js';
import { EventManager } from './modules/events.js';
import { AudioSys } from './modules/audio.js';
import { UpdateManager } from './modules/update_manager.js';

/**
 * Main entrance for the Lilith Assistant Extension.
 */
async function boot() {
    console.log('[Lilith] Booting v2.5.9 (Modularized)...');
    
    // 0. Initial Data Migration (Legacy to ExtensionSettings)
    migrateData();

    // 1. Validate and finalize state
    validateState();

    // 2. Sync API config from stored settings if available
    if (userState.apiConfig) {
        assistantManager.config = { ...assistantManager.config, ...userState.apiConfig };
    }

    // 3. Initialize UI Structure (Floating Panel & Avatar)
    UIManager.initStruct();
    
    // 3.5. Initialize Settings UI in the ST Extensions sidebar
    await UpdateManager.init();
    UIManager.initSettingsUI();
    
    // 4. Bind UI events to Assistant Logic
    UIManager.bindEvents(assistantManager);
    
    // 4. Initial UI Refresh (Apply saved statistics and history)
    UIManager.updateUI();
    UIManager.restoreChatHistory(panelChatHistory);
    UIManager.renderMemoryUI();
    
    // 5. Register SillyTavern System Hooks
    EventManager.init();
    
    // 6. Start Background Processes
    assistantManager.bindActivityListeners(window);
    assistantManager.startHeartbeat(window);

    // 7. Check for updates
    UpdateManager.checkUpdate();
    
    console.log('[Lilith] Extension system is ready.');
}

// SillyTavern Module Loader Compatibility
jQuery(document).ready(() => {
    const tryInit = () => {
        if (window._lilithInitialized) return;
        window._lilithInitialized = true;
        
        boot().catch(err => console.error('[Lilith] Boot failed:', err));
    };

    // Standard ST loading pattern
    if (window.eventSource && window.event_types) {
        window.eventSource.on(window.event_types.APP_READY, tryInit);
        setTimeout(tryInit, 2000); // Fail-safe fallback
    } else {
        tryInit();
    }
});
