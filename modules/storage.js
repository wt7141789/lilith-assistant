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
            isInnerWorld: DEFAULT_STATE.isInnerWorld || false,
            hideAvatar: DEFAULT_STATE.hideAvatar || false,
            avatarSize: DEFAULT_STATE.avatarSize || 150,
            commentFrequency: DEFAULT_STATE.commentFrequency || 50,
            autoSend: (settings.global && settings.global.autoSend !== undefined) ? settings.global.autoSend : true,
            injectSTContext: (settings.global && settings.global.injectSTContext !== undefined) ? settings.global.injectSTContext : (DEFAULT_STATE.injectSTContext !== undefined ? DEFAULT_STATE.injectSTContext : true),
            injectDashboard: (settings.global && settings.global.injectDashboard !== undefined) ? settings.global.injectDashboard : DEFAULT_STATE.injectDashboard,
            dashboardStyle: (settings.global && settings.global.dashboardStyle !== undefined) ? settings.global.dashboardStyle : (DEFAULT_STATE.dashboardStyle || 'modern'),
            autoLockTimeout: settings.global.autoLockTimeout !== undefined ? settings.global.autoLockTimeout : DEFAULT_STATE.autoLockTimeout,
            lockPasswordEnabled: settings.global.lockPasswordEnabled !== undefined ? settings.global.lockPasswordEnabled : (DEFAULT_STATE.lockPasswordEnabled || false),
            lockPassword: settings.global.lockPassword !== undefined ? settings.global.lockPassword : (DEFAULT_STATE.lockPassword || ''),
            checkConsistency: settings.global.checkConsistency !== undefined ? settings.global.checkConsistency : (DEFAULT_STATE.checkConsistency || true),
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

    // [New v3.0.5] Ensure dynamic content settings exist
    if (settings.global.dynamicContentEnabled === undefined) settings.global.dynamicContentEnabled = true;
    
    // 强制修正旧版的 240 默认值到 20
    if (settings.global.dynamicContentInterval === undefined || settings.global.dynamicContentInterval === 240) {
        settings.global.dynamicContentInterval = 20;
    }
    
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
        'activePersona', 'isInnerWorld', 'hideAvatar', 'avatarSize', 'posLeft', 'posTop', 
        'panelWidth', 'panelHeight', 'commentFrequency', 'commentMode',
        'extractionEnabled', 'extractionRegex', 'textReplacementEnabled', 
        'textReplacementRegex', 'textReplacementString', 'apiConfig', 'apiPresets',
        'regexPresets', 'dynamicContentEnabled', 'dynamicContentInterval', 'dynamicContentCount',
        'injectSTContext', 'injectDashboard', 'dashboardStyle', 'muted'
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
