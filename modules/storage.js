// modules/storage.js
import { SETTINGS_KEY, DEFAULT_STATE } from './config.js';

function getSTContext() {
    try {
        return SillyTavern.getContext();
    } catch (e) {
        console.error('[Lilith] SillyTavern context not available!', e);
        return null;
    }
}

export function getExtensionSettings() {
    const context = getSTContext();
    if (!context) return {};
    if (!context.extensionSettings[SETTINGS_KEY]) {
        context.extensionSettings[SETTINGS_KEY] = {};
    }
    return context.extensionSettings[SETTINGS_KEY];
}

export function saveExtensionSettings() {
    const context = getSTContext();
    if (context) context.saveSettingsDebounced();
}

export const userState = {};
export const panelChatHistory = [];

/**
 * Validates and completes the user state from extension settings.
 * Now supports per-persona independent storage.
 */
export function validateState() {
    const settings = getExtensionSettings();
    console.log('[Lilith] Validating state...', settings);
    
    // 1. Initialize Global/Management settings
    if (!settings.global) {
        console.log('[Lilith] Initializing global settings...');
        settings.global = {
            activePersona: DEFAULT_STATE.activePersona || 'toxic',
            hideAvatar: DEFAULT_STATE.hideAvatar || false,
            avatarSize: DEFAULT_STATE.avatarSize || 150,
            commentFrequency: DEFAULT_STATE.commentFrequency || 50,
            autoSend: (settings.global && settings.global.autoSend !== undefined) ? settings.global.autoSend : true,
            extractionEnabled: DEFAULT_STATE.extractionEnabled || false,
            extractionRegex: DEFAULT_STATE.extractionRegex || '',
            dynamicContentEnabled: DEFAULT_STATE.dynamicContentEnabled !== false,
            dynamicContentInterval: DEFAULT_STATE.dynamicContentInterval || 20,
            dynamicContentCount: DEFAULT_STATE.dynamicContentCount || 6,
            dynamicContentTriggerChance: DEFAULT_STATE.dynamicContentTriggerChance || 100,
            textReplacementEnabled: false,
            textReplacementRegex: '',
            textReplacementString: '',
            apiConfig: { ...DEFAULT_STATE.apiConfig },
            apiPresets: []
        };
    }

    if (!settings.global.apiConfig) settings.global.apiConfig = { ...DEFAULT_STATE.apiConfig };
    if (!settings.global.apiPresets) settings.global.apiPresets = [];

    // [New v3.0.0] Ensure dynamic content settings exist
    if (settings.global.dynamicContentEnabled === undefined) settings.global.dynamicContentEnabled = true;
    if (settings.global.dynamicContentInterval === undefined) settings.global.dynamicContentInterval = 20;
    if (settings.global.dynamicContentCount === undefined) settings.global.dynamicContentCount = 6;

    // 2. Initialize Persona Data Map
    if (!settings.personaData) {
        console.log('[Lilith] Initializing persona data map...');
        settings.personaData = {};
        // Migration: if old userState exists, move it to the current active persona
        if (settings.userState) {
            const p = settings.global.activePersona;
            settings.personaData[p] = JSON.parse(JSON.stringify(settings.userState));
            delete settings.userState;
        }
    }

    // 3. Load Current Persona Data
    const currentP = settings.global.activePersona;
    console.log(`[Lilith] Loading persona data for: ${currentP}`);
    if (!settings.personaData[currentP]) {
        console.log(`[Lilith] Creating default data for persona: ${currentP}`);
        settings.personaData[currentP] = JSON.parse(JSON.stringify(DEFAULT_STATE));
    }

    // 4. Sync to Live State
    // Reset and Load
    for (let key in userState) delete userState[key];
    Object.assign(userState, settings.personaData[currentP]);
    
    // Overlay Global Settings (Global takes precedence for UI settings)
    Object.assign(userState, settings.global);
    console.log('[Lilith] Current UserState:', userState);

    // 5. Load Chat History
    panelChatHistory.length = 0;
    if (settings.personaData[currentP].chatHistory) {
        panelChatHistory.push(...settings.personaData[currentP].chatHistory);
        console.log(`[Lilith] Restored ${panelChatHistory.length} messages for ${currentP}`);
    }

    // Ensure basic numeric fields exist
    if (userState.favorability === undefined) userState.favorability = 20;
    if (userState.sanity === undefined) userState.sanity = 80;
    if (userState.fatePoints === undefined) userState.fatePoints = 1000;
    if (!userState.dynamicContent) userState.dynamicContent = { lastGenerated: 0, items: [] };
}

export function saveState(updateUICallback) { 
    const settings = getExtensionSettings();
    const currentP = settings.global?.activePersona || 'toxic';

    console.log(`[Lilith] Saving state for persona: ${currentP}`);

    // Separate Global from Persona data
    const globalKeys = [
        'activePersona', 'hideAvatar', 'avatarSize', 'posLeft', 'posTop', 
        'panelWidth', 'panelHeight', 'commentFrequency', 'commentMode',
        'extractionEnabled', 'extractionRegex', 'textReplacementEnabled', 
        'textReplacementRegex', 'textReplacementString', 'apiConfig', 'apiPresets',
        'regexPresets', 'dynamicContentEnabled', 'dynamicContentInterval', 'dynamicContentCount'
    ];
    
    // 1. Sync per-persona data (Favor, Sanity, Memory, etc.)
    if (!settings.personaData) settings.personaData = {};
    if (!settings.personaData[currentP]) settings.personaData[currentP] = {};
    
    // Only save persona-relevant keys to personaData
    for (let key in userState) {
        if (!globalKeys.includes(key)) {
            settings.personaData[currentP][key] = userState[key];
        }
    }
    
    // 2. Sync global data (Settings, Active Persona)
    if (!settings.global) settings.global = {};
    globalKeys.forEach(k => {
        if (userState[k] !== undefined) settings.global[k] = userState[k];
    });

    saveExtensionSettings(); 
    if (updateUICallback) updateUICallback(); 
}

export function saveChat() {
    const settings = getExtensionSettings();
    const currentP = settings.global.activePersona;

    if (panelChatHistory.length > 100) {
        panelChatHistory.splice(0, panelChatHistory.length - 100);
    }
    
    if (!settings.personaData[currentP]) settings.personaData[currentP] = {};
    settings.personaData[currentP].chatHistory = [...panelChatHistory];
    
    saveExtensionSettings();
}

/**
 * Switches to a different persona and reloads its specific state.
 */
export function switchPersonaState(newPersonaName) {
    console.log(`[Lilith] Switching persona to: ${newPersonaName}`);
    const settings = getExtensionSettings();
    
    // 1. Save current state first
    saveState();
    saveChat();

    // 2. Change active persona in global
    if (!settings.global) settings.global = {};
    settings.global.activePersona = newPersonaName;
    
    // 3. Re-validate (this will load the new persona's data into userState/panelChatHistory)
    validateState();
    
    saveExtensionSettings();
}

export function updateFavor(n, updateUICallback) {
    userState.favorability = Math.max(0, Math.min(100, userState.favorability + parseInt(n)));
    saveState(updateUICallback);
    return parseInt(n);
}

export function updateSanity(n, updateUICallback) {
    userState.sanity = Math.max(0, Math.min(100, userState.sanity + parseInt(n)));
    saveState(updateUICallback);
    return parseInt(n);
}

export function migrateData() {
    const settings = getExtensionSettings();
    const legacyKey = 'lilith_data_v23_fix';
    
    if (Object.keys(settings).length === 0 && localStorage.getItem(legacyKey)) {
        console.log('[Lilith] Migrating data from LocalStorage to ExtensionSettings...');
        try {
            const legacyState = JSON.parse(localStorage.getItem(legacyKey));
            if (legacyState) settings.userState = legacyState;

            const legacyChat = JSON.parse(localStorage.getItem(legacyKey + '_chat'));
            if (legacyChat) settings.chatHistory = legacyChat;

            settings.muted = localStorage.getItem('lilith_muted') === 'true';

            settings.apiConfig = {
                apiType: localStorage.getItem('lilith_api_type'),
                baseUrl: localStorage.getItem('lilith_api_url'),
                apiKey: localStorage.getItem('lilith_api_key'),
                model: localStorage.getItem('lilith_api_model')
            };

            saveExtensionSettings();
            console.log('[Lilith] Migration complete.');
            // Reload userState after migration (maintain references)
            if (settings.userState) Object.assign(userState, settings.userState);
            if (settings.chatHistory) {
                panelChatHistory.length = 0;
                panelChatHistory.push(...settings.chatHistory);
            }
        } catch (e) {
            console.error('[Lilith] Migration failed:', e);
        }
    }
}
