// modules/ui_manager.js
import { containerId, avatarId, panelId, bubbleId, PERSONA_DB, AvatarPacks, extensionName } from './config.js';
import { userState, saveState, saveChat, panelChatHistory, updateFavor, updateSanity, getExtensionSettings, saveExtensionSettings, switchPersonaState } from './storage.js';
import { AudioSys } from './audio.js';
import { createSmartRegExp, extractContent } from './utils.js';
import { UpdateManager } from './update_manager.js';

export const UIManager = {
    assistant: null, // To be set in index.js to avoid circular dependency

    // --- 立绘与外观 ---
    setAvatar(emotionCmd = null) {
        const av = document.getElementById(avatarId);
        if (!av) return;

        // 1. 更新当前状态
        if (emotionCmd) { userState.currentFace = emotionCmd; saveState(); }
        const currentEmotionState = userState.currentFace || 'normal';
        
        // 2. 获取当前人格的图包 (默认回退到 meme)
        const currentPersona = userState.activePersona || 'meme';
        const pack = AvatarPacks[currentPersona] || AvatarPacks['meme'];

        // 3. 确定表情 Key
        let faceKey = 'normal';

        if (currentEmotionState.includes('angry') || currentEmotionState.includes('S:-')) {
            faceKey = 'angry';
        } else if (currentEmotionState.includes('speechless') || currentEmotionState.includes('...')) {
            faceKey = 'speechless';
        } else if (currentEmotionState.includes('mockery') || currentEmotionState.includes('蠢')) {
            faceKey = 'mockery';
        } else if (currentEmotionState.includes('horny') || currentEmotionState.includes('❤')) {
            faceKey = 'horny';
        } else if (currentEmotionState.includes('happy') || currentEmotionState.includes('F:+')) {
            faceKey = 'happy';
        } else if (currentEmotionState.includes('disgust') || currentEmotionState.includes('恶心') || currentEmotionState.includes('变态')) {
            faceKey = 'disgust';
        } else {
            if (userState.favorability >= 80) faceKey = 'love';
            else faceKey = 'normal';
        }

        // 4. 获取最终URL (兜底逻辑)
        let finalUrl = pack[faceKey];
        if (!finalUrl) finalUrl = pack['normal']; 
        if (!finalUrl) finalUrl = AvatarPacks['meme']['normal'];

        av.style.backgroundImage = `url('${finalUrl}')`;
        this.updateAvatarStyle();
    },

    updateAvatarStyle() {
        const av = document.getElementById(avatarId);
        if (!av) return;
        av.style.display = userState.hideAvatar ? 'none' : 'block';
        av.style.width = userState.avatarSize + 'px';
        av.style.height = userState.avatarSize + 'px';
    },

    setLoadingState(isLoading) {
        const ring = document.querySelector('.lilith-avatar-ring');
        const avatar = document.getElementById(avatarId);
        
        if (isLoading) {
            if (ring) ring.classList.add('loading');
            if (avatar) avatar.classList.add('loading');
            console.log('[Lilith] AI 开始回复，进度条启动');
        } else {
            if (ring) ring.classList.remove('loading');
            if (avatar) avatar.classList.remove('loading');
            console.log('[Lilith] AI 回复结束，进度条停止');
        }
    },

    updateAvatarExpression(reply) {
        if (!reply) return;
        if (reply.includes('❤') || reply.includes('想要') || reply.includes('好热')) this.setAvatar('horny');
        else if (reply.includes('杂鱼') || reply.includes('弱') || reply.includes('笑死')) this.setAvatar('mockery');
        else if (reply.includes('恶心') || reply.includes('变态') || reply.includes('垃圾')) this.setAvatar('disgust');
        else if (reply.includes('[S:-') || reply.includes('滚') || reply.includes('死') || reply.includes('怒')) this.setAvatar('angry');
        else if (reply.includes('...') || reply.includes('……') || reply.includes('无语')) this.setAvatar('speechless');
        else if (reply.includes('[F:+') || reply.includes('哼哼') || reply.includes('不错') || reply.includes('笑')) this.setAvatar('happy');
        else this.setAvatar('normal');
    },

    // --- UI 构造 ---
    initStruct() {
        if (document.getElementById(containerId)) return;
        
        const glitchLayer = document.createElement('div'); 
        glitchLayer.id = 'lilith-glitch-layer'; 
        glitchLayer.className = 'screen-glitch-layer'; 
        document.body.appendChild(glitchLayer);
        
        const wrapper = document.createElement('div'); 
        wrapper.id = containerId; 
        wrapper.style.left = (userState.posLeft || 100) + 'px'; 
        wrapper.style.top = (userState.posTop || 100) + 'px';
        // 初始宽度与高度适配
        let targetWidth = userState.panelWidth || 360;
        let targetHeight = userState.panelHeight || 520;

        // 手机端自动缩小初始尺寸
        if (window.innerWidth < 600) {
            targetWidth = Math.min(targetWidth, window.innerWidth * 0.9);
            targetHeight = Math.min(targetHeight, window.innerHeight * 0.7);
        }

        wrapper.style.width = targetWidth + 'px';
        
        const avatar = document.createElement('div'); 
        avatar.id = avatarId;
        const ring = document.createElement('div');
        ring.className = 'lilith-avatar-ring';
        avatar.appendChild(ring);
        
        const panel = document.createElement('div'); 
        panel.id = panelId; 
        panel.style.display = 'none';
        panel.style.height = targetHeight + 'px';
        
        ['mousedown', 'touchstart', 'click'].forEach(evt => panel.addEventListener(evt, e => e.stopPropagation()));
        
        const muteIcon = AudioSys.muted ? '🔇' : '🔊';
        panel.innerHTML = `
            <div class="lilith-panel-header">
                <span class="lilith-title">LILITH ASSISTANT <span style="font-size:10px; color:var(--l-cyan);">v3.0.0 PRO</span></span>
                <div style="display:flex; align-items:center; gap:10px;">
                    <span id="lilith-mute-btn" title="语音开关" style="cursor:pointer; font-size:14px;">${muteIcon}</span>
                    <div style="text-align:right; line-height:1;">
                        <div class="stat-row" style="color:#ff0055">好感 <span id="favor-val">${userState.favorability}</span></div>
                        <div class="stat-row" style="color:#00e5ff">理智 <span id="sanity-val">${userState.sanity}</span></div>
                    </div>
                </div>
            </div>
            <div class="scan-line-bg"></div>
            <div class="lilith-tabs">
                <div class="lilith-tab active" data-target="chat">😈 互动</div>
                <div class="lilith-tab" data-target="tools">🔪 功能</div>
                <div class="lilith-tab" data-target="memory" style="color:#bd00ff;">🧠 记忆</div>
                <div class="lilith-tab" data-target="gacha" style="color:var(--l-gold);">🎲 赌狗</div>
                <div class="lilith-tab" data-target="config">⚙️ 设置</div>
            </div>
            <div class="lilith-content-area">
                <div id="page-chat" class="lilith-page active">
                    <div id="lilith-chat-history"></div>
                    <div class="lilith-chat-footer">
                        <div class="lilith-input-row">
                            <button id="lilith-manual-comment-chat" title="强制吐槽" style="color:var(--l-cyan);">
                                <i class="fa-solid fa-comment-dots"></i>
                            </button>
                            <button id="lilith-polish-btn" title="搞颜色/润色" style="color:#ff0055;">
                                <i class="fa-solid fa-wand-magic-sparkles"></i>
                            </button>
                            <input type="text" id="lilith-chat-input" placeholder="和${PERSONA_DB[userState.activePersona || 'toxic'].name.split(' ')[1]}聊天...">
                            <button id="lilith-chat-send" title="发送">
                                <i class="fa-solid fa-paper-plane"></i>
                            </button>
                        </div>
                    </div>
                </div>
                <div id="page-tools" class="lilith-page">
                    <div class="tools-grid">
                        <button class="tool-btn" id="tool-analyze">🧠 局势嘲讽</button>
                        <button class="tool-btn" id="tool-audit">⚖️ 找茬模式</button>
                        <button class="tool-btn" id="tool-branch" style="grid-column: span 2; border-color:#ffd700;">🔮 恶作剧推演 (我)</button>
                        <button class="tool-btn" id="tool-kink">💖 性癖羞辱</button>
                        <button class="tool-btn" id="tool-event" style="border-color:#ff0055">💥 强制福利事件 (我)</button>
                        <button class="tool-btn" id="tool-hack" style="border-color:#bd00ff;">💉 催眠洗脑 (纯指令)</button>
                        <button class="tool-btn" id="tool-profile" style="border-color:#ff0055;">📋 废物体检报告</button>
                        <button class="tool-btn" id="tool-ghost" style="grid-column: span 2; border-color:#00f3ff;">👻 替你回复 (计费)</button>
                    </div>
                    <div id="tool-output-area"></div>
                </div>
                <div id="page-memory" class="lilith-page">
                    <div style="padding: 15px 15px 0 15px; flex-shrink: 0;">
                        <div style="font-size:12px; color:#888; margin-bottom:10px; border-bottom:1px solid #333; padding-bottom:5px;">
                            这里存放着我们过去的肮脏回忆。<br>
                            <span style="font-size:10px; color:var(--l-cyan); font-style: italic;">*每20条对话自动总结归档，旧对话将被压缩。*</span>
                        </div>
                    </div>
                    <div id="memory-container" style="flex:1; overflow-y:auto; display:flex; flex-direction:column; gap:8px; padding: 0 15px;"></div>
                    <div class="lilith-chat-footer" style="padding: 10px 15px 15px 15px; margin-top: auto;">
                        <button id="btn-force-memory" class="tool-btn" style="width:100%; border-color:#bd00ff; height: 36px; font-weight: bold;">⚡ 强制现在总结记忆</button>
                    </div>
                </div>
                <div id="page-gacha" class="lilith-page">
                    <div class="gacha-header">
                        <span>命运红线 (赌狗区)</span>
                        <div class="fp-display">FP: <span id="gacha-fp-val" class="fp-box">${userState.fatePoints}</span></div>
                    </div>
                    <div style="background:rgba(255,255,255,0.05); padding:8px; margin:5px 0; border:1px dashed #444; display:flex; align-items:center; justify-content:space-between;">
                        <span style="font-size:10px; color:#aaa;">点数作弊:</span>
                        <div style="display:flex; gap:5px;">
                            <input type="number" id="manual-fp-input" value="${userState.fatePoints}" style="background:#000; border:1px solid #333; color:var(--l-gold); width:70px; font-size:12px; text-align:center;">
                            <button id="btn-sync-fp" style="background:#333; color:#fff; border:none; font-size:10px; cursor:pointer; padding:2px 8px;">强制修改</button>
                        </div>
                    </div>
                    <div id="gacha-visual-area" class="gacha-stage">
                        <div style="color:#444; margin-top:50px;">[ 准备好你的灵魂了吗？ ]</div>
                    </div>
                    <div class="inventory-area">
                        <div style="font-size:10px; color:var(--l-cyan);">📦 垃圾堆 (待清理)</div>
                        <div id="gacha-inv-list" class="inventory-list"></div>
                    </div>
                    <div class="gacha-controls">
                        <button id="btn-pull-1" class="tool-btn" style="flex:1;">单抽 (50)</button>
                        <button id="btn-pull-10" class="tool-btn" style="flex:1; border-color:var(--l-gold); color:var(--l-gold);">十连 (500)</button>
                        <button id="btn-claim" class="btn-main" style="flex:1;">打包带走</button>
                    </div>
                </div>

                <div id="page-config" class="lilith-page">
                    <div class="cfg-group">
                        <label style="color:#bd00ff; font-weight:bold;">🎭 人格覆写 (Persona)</label>
                        <select id="cfg-persona-select" class="lilith-select" style="background:#111; color:#fff; border:1px solid #bd00ff;">
                            ${Object.keys(PERSONA_DB).map(k => `<option value="${k}" ${userState.activePersona===k?'selected':''}>${PERSONA_DB[k].name}</option>`).join('')}
                        </select>
                    </div>
                    <div class="cfg-group">
                        <label style="color:#ff0055; font-weight:bold;">💬 吐槽设定 (Interjection)</label>
                        <div style="font-size:10px; color:#888;">吐槽概率: <span id="cfg-freq-val">${userState.commentFrequency || 30}</span>%</div>
                        <input type="range" id="cfg-freq" min="0" max="100" step="5" value="${userState.commentFrequency || 30}" style="accent-color:#ff0055;" oninput="document.getElementById('cfg-freq-val').textContent = this.value">
                        <small style="color:#666; font-size:9px; display:block; margin-top:2px;">控制莉莉丝在聊天时主动插话的频率。100% 为每句必回。</small>
                        
                        <div style="margin-top:8px;">
                            <label style="font-size:12px; color:#ccc;">插入模式:</label>
                            <select id="cfg-comment-mode" style="background:#111; color:#fff; border:1px solid #444; font-size:12px; height:24px;">
                                <option value="random" ${userState.commentMode === 'random' ? 'selected' : ''}>🤖 AI 自动定位 (智能注入)</option>
                                <option value="bottom" ${userState.commentMode === 'bottom' ? 'selected' : ''}>⬇️ 始终追加在末尾</option>
                                <option value="top" ${userState.commentMode === 'top' ? 'selected' : ''}>⬆️ 始终置于顶端</option>
                            </select>
                        </div>
                    </div>
                    
                    <div class="cfg-group">
                        <label style="color:#00f3ff;">🎛️ 语音调校 (TTS)</label>
                        <div style="font-size:10px; color:#888;">音调 (Pitch): <span id="tts-pitch-val">${userState.ttsConfig ? userState.ttsConfig.pitch : 1.2}</span></div>
                        <input type="range" id="tts-pitch" min="0.1" max="2.0" step="0.1" value="${userState.ttsConfig ? userState.ttsConfig.pitch : 1.2}">
                        
                        <div style="font-size:10px; color:#888; margin-top:5px;">语速 (Speed): <span id="tts-rate-val">${userState.ttsConfig ? userState.ttsConfig.rate : 1.3}</span></div>
                        <input type="range" id="tts-rate" min="0.5" max="2.0" step="0.1" value="${userState.ttsConfig ? userState.ttsConfig.rate : 1.3}">
                        
                        <button id="tts-test-btn" style="width:100%; margin-top:5px; background:#333; color:#fff; border:none; padding:3px; cursor:pointer; font-size:10px;">🔊 试听</button>
                    </div>

                    <div class="cfg-group">
                        <label style="color:#bd00ff; font-weight:bold;">🧠 莉莉丝的大脑皮层</label>
                        <div style="display:flex; align-items:center;">
                            <input type="checkbox" id="cfg-dynamic-enable" ${userState.dynamicContentEnabled !== false ? 'checked' : ''} style="width:auto; margin-right:5px;"> 
                            <span style="font-size:12px; color:#ccc;">启用 AI 动态更新</span>
                        </div>
                        <div style="font-size:10px; color:#888; margin-top:5px;">生成间隔 (分钟):</div>
                        <input type="number" id="cfg-dyn-interval" class="lilith-input" min="1" max="4320" step="1" value="${userState.dynamicContentInterval || 20}" style="width: 100%; box-sizing: border-box; background: #111; color: #fff; border: 1px solid #444; padding: 4px; font-size: 12px;">
                        
                        <div style="font-size:10px; color:#888; margin-top:5px;">每次生成数:</div>
                        <input type="number" id="cfg-dyn-count" class="lilith-input" min="1" max="20" step="1" value="${userState.dynamicContentCount || 6}" style="width: 100%; box-sizing: border-box; background: #111; color: #fff; border: 1px solid #444; padding: 4px; font-size: 12px;">
                        <small style="color:#666; font-size:9px; display:block; margin-top:2px;">
                            (1条:纯对话 | 2-9条:1事件 | 10条+:每5条1事件)<br>
                            *建议保持在 20 条以内以确保 AI 构思质量。
                        </small>
                        
                        <div style="font-size:10px; color:#888; margin-top:5px;">触发概率: <span id="cfg-dyn-trigger-val">${userState.dynamicContentTriggerChance || 100}</span>%</div>
                        <input type="range" id="cfg-dyn-trigger" min="1" max="100" step="1" value="${userState.dynamicContentTriggerChance || 100}" style="accent-color:var(--l-cyan); width:100%;" oninput="document.getElementById('cfg-dyn-trigger-val').textContent = this.value">
                        <small style="color:#666; font-size:9px; display:block; margin-top:2px;">调整触发频率。100% 意味着在生成间隔内莉莉丝基本能把构思好的内容全部触发完。</small>

                        <div style="display: flex; gap: 5px; margin-top: 5px;">
                            <button id="cfg-dyn-force" style="flex: 2; background:#333; color:#fff; border:none; padding:3px; cursor:pointer; font-size:10px;">⚡ 立即重构</button>
                            <button id="cfg-dyn-test" style="flex: 1; background:#222; color:var(--l-cyan); border:1px solid var(--l-cyan); padding:3px; cursor:pointer; font-size:10px;">🧪 测试</button>
                        </div>
                    </div>

                    <div class="cfg-group" style="border-top: 1px dashed #444; margin-top: 5px; padding-top: 5px;">
                        <label style="color:var(--l-cyan); font-weight:bold;">🛡️ 正则清理方案 (RegEx)</label>
                        <div style="display:flex; gap:5px; margin-bottom:5px;">
                            <select id="cfg-regex-preset-select" class="lilith-select" style="flex:1; background:#111; color:#fff; border:1px solid var(--l-cyan);">
                                <option value="">-- 选择方案 --</option>
                                ${(userState.regexPresets || []).map(p => `<option value="${p.name}">${p.name}</option>`).join('')}
                            </select>
                            <button id="cfg-regex-delete" class="tool-btn" style="width:30px; border-color:#ff0055;" title="删除当前选中的方案">🗑️</button>
                        </div>
                        <div style="display:flex; align-items:center; gap:10px; margin-bottom:5px; font-size:11px; color:#ccc;">
                            <div style="display:flex; align-items:center;">
                                <input type="checkbox" id="cfg-extract-enable" ${userState.extractionEnabled ? 'checked' : ''} style="width:auto; margin-right:4px;"> 
                                <span>提取</span>
                            </div>
                            <div style="display:flex; align-items:center;">
                                <input type="checkbox" id="cfg-repl-enable" ${userState.textReplacementEnabled ? 'checked' : ''} style="width:auto; margin-right:4px;"> 
                                <span>替换</span>
                            </div>
                        </div>
                        <div style="display:flex; gap:5px;">
                            <input type="text" id="cfg-regex-name" placeholder="方案名称..." style="flex:1; font-size:12px; height:24px;">
                            <button id="cfg-regex-save" class="tool-btn" style="width:60px; border-color:var(--l-cyan); font-size:12px;">归档</button>
                        </div>
                    </div>

                    <div class="cfg-group">
                        <label style="color:var(--l-gold); font-weight:bold;">🧬 API 预设 (Presets)</label>
                        <div style="display:flex; gap:5px; margin-bottom:5px;">
                            <select id="cfg-preset-select" class="lilith-select" style="flex:1; background:#111; color:#fff; border:1px solid var(--l-gold);">
                                <option value="">-- 选择预设 --</option>
                                ${(userState.apiPresets || []).map(p => `<option value="${p.name}">${p.name}</option>`).join('')}
                            </select>
                            <button id="cfg-preset-delete" class="tool-btn" style="width:30px; border-color:#ff0055;" title="删除当前选中的预设">🗑️</button>
                        </div>
                        <div style="display:flex; gap:5px;">
                            <input type="text" id="cfg-preset-name" placeholder="预设名称..." style="flex:1; font-size:12px; height:24px;">
                            <button id="cfg-preset-save" class="tool-btn" style="width:60px; border-color:var(--l-gold); font-size:12px;">保存</button>
                        </div>
                    </div>

                    <div class="cfg-group">
                        <label>大脑皮层 (Model)</label>
                        <div style="display:flex; gap:5px;">
                            <input type="text" id="cfg-model" value="${(userState.apiConfig && userState.apiConfig.model) || ''}" placeholder="gemini-1.5-flash" style="flex:1;">
                            <button id="cfg-get-models" class="tool-btn" style="width:30px;">↻</button>
                        </div>
                        <select id="cfg-model-select" style="display:none; margin-top:5px; background:#111; color:#fff; border:1px solid #444; font-size:12px;"></select>
                    </div>
                    
                    <div class="cfg-group"><label>神经密钥 (API Key)</label><input type="password" id="cfg-key" value="${(userState.apiConfig && userState.apiConfig.apiKey) || ''}"></div>
                    <div class="cfg-group"><label>接口地址 (Endpoint)</label><input type="text" id="cfg-url" value="${(userState.apiConfig && userState.apiConfig.baseUrl) || 'https://generativelanguage.googleapis.com'}"></div>
                    <div class="cfg-group">
                        <label>连接协议</label>
                        <select id="cfg-type">
                            <option value="native" ${(!userState.apiConfig || userState.apiConfig.apiType==='native')?'selected':''}>Google Native</option>
                            <option value="openai" ${(userState.apiConfig && userState.apiConfig.apiType==='openai')?'selected':''}>OpenAI/Proxy</option>
                        </select>
                    </div>
                    
                    <div class="cfg-group" style="border-top:1px dashed #444; margin-top:10px; padding-top:10px;">
                        <label style="color:var(--l-cyan); font-weight:bold; margin-bottom:5px;">偏好与外观</label>
                        <div style="display:flex; align-items:center; gap:10px; margin-bottom:8px;">
                            <div style="display:flex; align-items:center;">
                                <input type="checkbox" id="cfg-hide-avatar" ${userState.hideAvatar ? 'checked' : ''} style="width:auto; margin-right:5px;"> 
                                <span style="font-size:12px; color:#ccc; cursor:pointer;" onclick="document.getElementById('cfg-hide-avatar').click()">隐藏悬浮球</span>
                            </div>
                            <div style="display:flex; align-items:center;">
                                <input type="checkbox" id="cfg-auto-send" ${userState.autoSend !== false ? 'checked' : ''} style="width:auto; margin-right:5px;"> 
                                <span style="font-size:12px; color:#ccc; cursor:pointer;" onclick="document.getElementById('cfg-auto-send').click()">自动发送选择</span>
                            </div>
                        </div>
                        <div style="display:flex; align-items:center; gap:10px;">
                            <span style="font-size:12px; color:#ccc; white-space:nowrap;">球体大小: <span id="cfg-size-val">${userState.avatarSize}</span>px</span>
                            <input type="range" id="cfg-avatar-size" min="50" max="300" step="10" value="${userState.avatarSize}" style="flex:1; accent-color:var(--l-main);" oninput="document.getElementById('cfg-size-val').textContent = this.value">
                        </div>
                        <button id="cfg-reset-pos" style="width:100%; margin-top:12px; background:rgba(255,255,255,0.05); color:#00f3ff; border:1px solid #00f3ff66; padding:5px; cursor:pointer; font-size:11px; border-radius:4px; display:flex; align-items:center; justify-content:center; gap:5px;">
                            <i class="fa-solid fa-location-crosshairs"></i> 修正位置偏移
                        </button>
                    </div>

                    <div class="cfg-btns" style="display:flex; gap:5px; margin-top:10px;">
                        <button id="cfg-test" class="tool-btn" style="flex:1; border-color:#00f3ff;">戳一下</button>
                        <button id="cfg-clear-mem" class="tool-btn" style="flex:1; border-color:#ff0055; color:#ff0055;">格式化</button>
                        <button id="cfg-save" class="tool-btn" style="flex:1; border-color:#0f0;">保存配置</button>
                    </div>
                    <div id="cfg-msg" style="font-size:10px; color:#aaa; margin-top:5px;"></div>
                </div>
            </div>
            <div class="lilith-resize-handle"></div>
        `;
        
        wrapper.appendChild(panel);
        wrapper.appendChild(avatar);
        document.body.appendChild(wrapper);

        this.bindInternalEvents();
        this.bindDrag();
        this.bindResize();
        this.updatePos();
    },

    bindInternalEvents() {
        const p = document.getElementById(panelId);
        if (!p) return;

        // Tabs
        p.querySelectorAll('.lilith-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                p.querySelectorAll('.lilith-tab').forEach(t => t.classList.remove('active'));
                p.querySelectorAll('.lilith-page').forEach(pg => pg.classList.remove('active'));
                tab.classList.add('active');
                const target = document.getElementById(`page-${tab.dataset.target}`);
                if (target) {
                    target.classList.add('active');
                    target.scrollTop = 0; 
                }
            });
        });

        // Mute
        const muteBtn = document.getElementById('lilith-mute-btn');
        if (muteBtn) {
            muteBtn.addEventListener('click', () => {
                AudioSys.muted = !AudioSys.muted;
                muteBtn.textContent = AudioSys.muted ? '🔇' : '🔊';
            });
        }
    },

    bindDrag() {
        const wrapper = document.getElementById(containerId);
        const avatar = document.getElementById(avatarId);
        const panel = document.getElementById(panelId);
        if (!wrapper || !avatar || !panel) return;

        let isDragging = false, startX, startY, initialLeft, initialTop;
        
        const onDown = (e) => {
            const currentTrigger = e.currentTarget; // 关键：提前捕获当前触发元素

            // 如果点击的是输入框、按钮、滚动区域或特定交互区域，则不触发拖动
            const interactiveTags = ['INPUT', 'BUTTON', 'SELECT', 'I', 'A', 'TEXTAREA'];
            if (interactiveTags.includes(e.target.tagName) || 
                e.target.closest('#lilith-chat-history') ||
                e.target.closest('.lilith-page') && e.target.closest('.lilith-page').scrollHeight > e.target.closest('.lilith-page').clientHeight ||
                e.target.closest('.lilith-chat-footer') || 
                e.target.closest('.lilith-resize-handle') ||
                e.target.closest('.cfg-group')) {
                // 特例：如果是 header，即便在页面内也允许拖动
                if (!e.target.closest('.lilith-panel-header')) return;
            }

            isDragging = false; 
            const event = e.touches ? e.touches[0] : e;
            startX = event.clientX; 
            startY = event.clientY;
            initialLeft = wrapper.offsetLeft;
            initialTop = wrapper.offsetTop;
            
            wrapper.style.transition = 'none'; // 拖动时禁用平滑动画提高响应速度
            avatar.style.cursor = 'grabbing';
            panel.style.cursor = 'grabbing';

            const onMove = (me) => {
                const cx = me.clientX || (me.touches ? me.touches[0].clientX : 0);
                const cy = me.clientY || (me.touches ? me.touches[0].clientY : 0);
                
                if (Math.abs(cx - startX) > 5 || Math.abs(cy - startY) > 5) {
                    isDragging = true;
                }
                
                if (isDragging) { 
                    wrapper.style.left = (initialLeft + (cx - startX)) + 'px'; 
                    wrapper.style.top = (initialTop + (cy - startY)) + 'px'; 
                    this.updatePos(); 
                }
            };

            const onUp = () => {
                document.removeEventListener('mousemove', onMove); 
                document.removeEventListener('mouseup', onUp); 
                document.removeEventListener('touchmove', onMove); 
                document.removeEventListener('touchend', onUp);
                
                wrapper.style.transition = ''; 
                avatar.style.cursor = 'move'; 
                panel.style.cursor = '';
                
                if (!isDragging) {
                    // 如果是在头像上点的且没拖动，则触发显示/隐藏
                    if (currentTrigger === avatar) {
                        this.togglePanel(); 
                    }
                } else {
                    // 保存位置
                    userState.posLeft = parseInt(wrapper.style.left);
                    userState.posTop = parseInt(wrapper.style.top);
                    saveState();
                }
                isDragging = false;
            };

            document.addEventListener('mousemove', onMove); 
            document.addEventListener('mouseup', onUp); 
            document.addEventListener('touchmove', onMove, { passive: false }); 
            document.addEventListener('touchend', onUp);
        };

        // 头像拖动
        avatar.addEventListener('mousedown', onDown); 
        avatar.addEventListener('touchstart', (e) => {
            if (e.cancelable) e.preventDefault(); // 阻止手机端发出"虚拟鼠标"点击事件，防止触发两次 toggle
            onDown(e);
        }, { passive: false });

        // 面板整体拖动
        panel.addEventListener('mousedown', onDown);
        panel.addEventListener('touchstart', (e) => {
            // 只有点击面板 header 或背景时才阻止默认
            if (e.target.closest('.lilith-panel-header') || e.target === panel) {
                if (e.cancelable) e.preventDefault();
            }
            onDown(e);
        }, { passive: false });
        
        this.updatePos();
    },

    bindResize() {
        const wrapper = document.getElementById(containerId);
        const panel = document.getElementById(panelId);
        const handle = panel.querySelector('.lilith-resize-handle');
        if (!wrapper || !panel || !handle) return;

        let isResizing = false, startX, startY, startWidth, startHeight;

        const onDown = (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            isResizing = true;
            const event = e.touches ? e.touches[0] : e;
            startX = event.clientX;
            startY = event.clientY;
            startWidth = wrapper.offsetWidth;
            startHeight = panel.offsetHeight;

            panel.style.transition = 'none';
            wrapper.style.transition = 'none';

            const onMove = (me) => {
                if (!isResizing) return;
                const ev = me.touches ? me.touches[0] : me;
                
                let newWidth = startWidth + (ev.clientX - startX);
                let newHeight = startHeight + (ev.clientY - startY);

                // 限制最小/最大尺寸
                const maxWidth = window.innerWidth * 0.95;
                const maxHeight = window.innerHeight * 0.85;
                
                newWidth = Math.max(280, Math.min(maxWidth, newWidth));
                newHeight = Math.max(300, Math.min(maxHeight, newHeight));

                wrapper.style.width = newWidth + 'px';
                panel.style.height = newHeight + 'px';
            };

            const onUp = () => {
                if (isResizing) {
                    userState.panelWidth = parseInt(wrapper.style.width);
                    userState.panelHeight = parseInt(panel.style.height);
                    saveState();
                }
                isResizing = false;
                panel.style.transition = '0.4s cubic-bezier(0.19, 1, 0.22, 1)';
                
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
                document.removeEventListener('touchmove', onMove);
                document.removeEventListener('touchend', onUp);
            };

            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
            document.addEventListener('touchmove', onMove, { passive: false });
            document.addEventListener('touchend', onUp);
        };

        handle.addEventListener('mousedown', onDown);
        handle.addEventListener('touchstart', onDown, { passive: false });
    },

    updatePos() {
        const wrapper = document.getElementById(containerId);
        const panel = document.getElementById(panelId);
        const avatar = document.getElementById(avatarId);
        if (!wrapper || !panel || !avatar) return;

        // 使用头像的中心点作为判定方位的基础，更加稳定
        const rect = avatar.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        
        // 判定横向方位 (左/右) - 增加 40px 的缓冲区防止在中心线来回跳变
        const thresholdX = window.innerWidth / 2;
        const marginX = 40;
        const currentPos = panel.classList.contains('pos-left') ? 'left' : 'right';

        if (centerX < thresholdX - marginX) {
            panel.classList.remove('pos-left');
            panel.classList.add('pos-right');
        } else if (centerX > thresholdX + marginX) {
            panel.classList.remove('pos-right');
            panel.classList.add('pos-left');
        }
        
        // 判定纵向方位 (上/下) - 增加 40px 缓冲区
        const thresholdY = window.innerHeight * 0.5;
        const marginY = 40;
        const isCurrentlyTop = panel.classList.contains('pos-top-align');
        
        if (centerY > thresholdY + marginY) {
            panel.classList.add('pos-top-align');
        } else if (centerY < thresholdY - marginY) {
            panel.classList.remove('pos-top-align');
        }

        // 辅助判断：如果头像在屏幕顶部 150px 内，让气泡向下弹出，防止被顶出屏幕
        if (rect.top < 150) {
            wrapper.classList.add('bubble-bottom');
        } else {
            wrapper.classList.remove('bubble-bottom');
        }
    },

    bindEvents(assistant) {
        this.assistant = assistant;
        // Chat Logic
        const sendBtn = document.getElementById('lilith-chat-send');
        const input = document.getElementById('lilith-chat-input');
        const doSend = async () => {
            const txt = input.value.trim(); if(!txt) return;
            
            // 1. 发送用户消息
            this.addChatMsg('user', txt); 
            input.value = '';

            // 2. 显示思考中的动画
            const loadingId = 'lilith-loading-' + Date.now();
            const h = document.getElementById('lilith-chat-history');
            const loadingDiv = document.createElement('div');
            loadingDiv.id = loadingId;
            loadingDiv.className = 'msg lilith loading';
            loadingDiv.innerHTML = '<span class="dot">.</span><span class="dot">.</span><span class="dot">.</span>';
            h.appendChild(loadingDiv);
            h.scrollTop = h.scrollHeight;
            
            // 3. 调用 API
            const rawReply = await assistant.callUniversalAPI(window, txt, { isChat: true });
            
            const loader = document.getElementById(loadingId);
            if(loader) loader.remove();

            if (!rawReply) return;

            // --- 使用统一方法添加并解析消息 ---
            this.addChatMsg('lilith', rawReply);

            // --- 触发表情与语音联动 ---
            const { speech } = this.parseLilithMsg(rawReply.replace(/\[[SF]:[+\-]?\d+\]/gi, ''));
            this.updateAvatarExpression(rawReply);
            AudioSys.speak(speech || rawReply);
        };
        sendBtn?.addEventListener('click', doSend);
        input?.addEventListener('keydown', (e) => { if(e.key === 'Enter') { e.stopPropagation(); doSend(); } });

        // Manual Comment
        document.getElementById('lilith-manual-comment-chat')?.addEventListener('click', () => {
            assistant.manualComment();
        });

        // Polish
        document.getElementById('lilith-polish-btn')?.addEventListener('click', async () => {
            const raw = input.value.trim(); if(!raw) return;
            input.value = '';
            this.addChatMsg('user', `[魔改] ${raw}`);
            this.addChatMsg('lilith', '✍️ 改写中...', false); // [修复] 改写提示不保存
            const refined = await assistant.callUniversalAPI(window, `[Original]: ${raw}\n[Task]: Rewrite this to be more erotic.`, { isChat: true });
            const h = document.getElementById('lilith-chat-history');
            if(h.lastChild && h.lastChild.textContent.includes('改写中')) h.lastChild.remove();
            this.addChatMsg('lilith', refined || 'Error');
        });

        // Tools
        document.getElementById('tool-analyze')?.addEventListener('click', () => assistant.runTool(window, "局势嘲讽"));
        document.getElementById('tool-audit')?.addEventListener('click', () => assistant.runTool(window, "找茬模式"));
        document.getElementById('tool-branch')?.addEventListener('click', () => assistant.runTool(window, "恶作剧推演"));
        document.getElementById('tool-kink')?.addEventListener('click', () => assistant.runTool(window, "性癖羞辱"));
        document.getElementById('tool-event')?.addEventListener('click', () => assistant.runTool(window, "强制福利事件"));
        document.getElementById('tool-hack')?.addEventListener('click', () => assistant.runTool(window, "催眠洗脑"));
        document.getElementById('tool-profile')?.addEventListener('click', () => assistant.runTool(window, "废物体检报告"));
        document.getElementById('tool-ghost')?.addEventListener('click', () => assistant.runTool(window, "替你回复"));

        // Gacha
        document.getElementById('btn-pull-1')?.addEventListener('click', () => { 
            console.log("Pull 1 Clicked"); 
            assistant.gachaSystem.doPull(window, 1); 
        });
        document.getElementById('btn-pull-10')?.addEventListener('click', () => { 
            console.log("Pull 10 Clicked"); 
            assistant.gachaSystem.doPull(window, 10); 
        });
        document.getElementById('btn-claim')?.addEventListener('click', () => {
             console.log("Claim Clicked");
             assistant.gachaSystem.claimRewards(window);
        });

        document.getElementById('btn-sync-fp')?.addEventListener('click', () => {
             const manualInput = document.getElementById('manual-fp-input');
             if (manualInput) {
                 const newVal = parseInt(manualInput.value);
                 if (!isNaN(newVal)) {
                     this.updateFP(window, newVal);
                     this.showBubble("作弊可耻，但有用。", "#ffd700");
                 }
             }
        });
        
        // Force Memory
        document.getElementById('btn-force-memory')?.addEventListener('click', () => {
            if(confirm("确定要强制压缩当前对话为记忆吗？")) assistant.checkAndSummarize(window, true);
        });

        // Config Page - Floating Panel Logic
        // These events apply to the elements inside the Floating Panel (#page-config)
        const bindSharedConfigEvents = () => {
            // Persona Select
            const personaSelect = document.getElementById('cfg-persona-select');
            if (personaSelect) {
                personaSelect.addEventListener('change', () => {
                    const newPersona = personaSelect.value;
                    
                    // Switch state and data for the new persona
                    switchPersonaState(newPersona);
                    
                    if (PERSONA_DB[userState.activePersona]) {
                         userState.ttsConfig = { ...PERSONA_DB[userState.activePersona].voice };
                         // Update UI sliders
                         const pSlider = document.getElementById('tts-pitch');
                         const rSlider = document.getElementById('tts-rate');
                         const pVal = document.getElementById('tts-pitch-val');
                         const rVal = document.getElementById('tts-rate-val');
                         if(pSlider) pSlider.value = userState.ttsConfig.pitch;
                         if(rSlider) rSlider.value = userState.ttsConfig.rate;
                         if(pVal) pVal.textContent = userState.ttsConfig.pitch;
                         if(rVal) rVal.textContent = userState.ttsConfig.rate;
                    }
                    saveState(); // Ensure the new persona's default state is saved immediately
                    this.updateUI();
                    
                    // Show switch confirmation
                    this.showBubble(`已同步 ${PERSONA_DB[userState.activePersona].name} 的独立数据空间。`);
                });
            }

            // Buttons - Test
            document.getElementById('cfg-test')?.addEventListener('click', () => {
                assistant.triggerAvatarGlitch();
                AudioSys.speak("别戳了，烦不烦？");
            });

            // API Presets
            const presetSelect = document.getElementById('cfg-preset-select');
            if (presetSelect) {
                presetSelect.addEventListener('change', () => {
                    const presetName = presetSelect.value;
                    if (!presetName) return;
                    assistant.loadPreset(presetName);
                    // Update UI fields from refreshed userState
                    if (userState.apiConfig) {
                        const typeEl = document.getElementById('cfg-type');
                        const urlEl = document.getElementById('cfg-url');
                        const keyEl = document.getElementById('cfg-key');
                        const modelEl = document.getElementById('cfg-model');
                        if (typeEl) typeEl.value = userState.apiConfig.apiType || 'native';
                        if (urlEl) urlEl.value = userState.apiConfig.baseUrl || '';
                        if (keyEl) keyEl.value = userState.apiConfig.apiKey || '';
                        if (modelEl) modelEl.value = userState.apiConfig.model || '';
                    }

                    this.showBubble(`已加载 API 预设: ${presetName}`, "var(--l-gold)");
                });
            }

            // 正则方案下拉/保存逻辑
            const regexSelect = document.getElementById('cfg-regex-preset-select');
            if (regexSelect) {
                regexSelect.addEventListener('change', () => {
                    const presetName = regexSelect.value;
                    if (!presetName) return;
                    assistant.loadRegexPreset(presetName);
                    
                    // 1. 同步侧边栏显示 (关键：侧边栏的Checkbox也要刷)
                    const stExtractEnable = document.getElementById('lilith-extraction-enabled');
                    const stExtractRegex = document.getElementById('lilith-extraction-regex');
                    const stReplEnable = document.getElementById('lilith-text-replacement-enabled');
                    const stReplRegex = document.getElementById('lilith-text-replacement-regex');
                    const stReplString = document.getElementById('lilith-text-replacement-string');

                    if(stExtractEnable) stExtractEnable.checked = !!userState.extractionEnabled;
                    if(stExtractRegex) stExtractRegex.value = userState.extractionRegex || '';
                    if(stReplEnable) stReplEnable.checked = !!userState.textReplacementEnabled;
                    if(stReplRegex) stReplRegex.value = userState.textReplacementRegex || '';
                    if(stReplString) stReplString.value = userState.textReplacementString || '';

                    // 2. 同步侧边栏下拉框本身 (保持UI一致)
                    const stRegexSelect = document.getElementById('lilith-regex-preset-select');
                    if (stRegexSelect) stRegexSelect.value = presetName;

                    // 3. 同步面板勾选框 (关键：面板里的也要刷)
                    const cfgExtractEnable = document.getElementById('cfg-extract-enable');
                    const cfgReplEnable = document.getElementById('cfg-repl-enable');
                    if (cfgExtractEnable) cfgExtractEnable.checked = !!userState.extractionEnabled;
                    if (cfgReplEnable) cfgReplEnable.checked = !!userState.textReplacementEnabled;

                    this.showBubble(`已应用正则方案: ${presetName}`, "var(--l-cyan)");
                });
            }

            document.getElementById('cfg-regex-save')?.addEventListener('click', () => {
                const nameInput = document.getElementById('cfg-regex-name');
                const name = nameInput?.value.trim();
                
                if (!name) {
                    this.showBubble("请输入方案名称", "#ff0055");
                    return;
                }
                
                assistant.saveRegexPreset(name);
                
                // 刷新下拉框
                if (regexSelect) {
                    regexSelect.innerHTML = '<option value="">-- 选择方案 --</option>' + 
                        (userState.regexPresets || []).map(p => `<option value="${p.name}">${p.name}</option>`).join('');
                }
                const stRegexSelect = document.getElementById('lilith-regex-preset-select');
                if (stRegexSelect) {
                    stRegexSelect.innerHTML = '<option value="">-- 选择方案 --</option>' + 
                        (userState.regexPresets || []).map(p => `<option value="${p.name}">${p.name}</option>`).join('');
                }

                if (nameInput) nameInput.value = '';
                this.showBubble(`正则方案 ${name} 已保存`, "var(--l-cyan)");
            });

            document.getElementById('cfg-regex-delete')?.addEventListener('click', () => {
                const name = regexSelect?.value;
                if (!name) return;
                if (confirm(`确定要从库中删除正则方案 "${name}" 吗？`)) {
                    assistant.deleteRegexPreset(name);
                    // 刷新下拉框
                    const options = '<option value="">-- 选择方案 --</option>' + 
                        (userState.regexPresets || []).map(p => `<option value="${p.name}">${p.name}</option>`).join('');
                    if (regexSelect) regexSelect.innerHTML = options;
                    const stRegexSelect = document.getElementById('lilith-regex-preset-select');
                    if (stRegexSelect) stRegexSelect.innerHTML = options;
                    
                    this.showBubble(`已删除方案: ${name}`, "#ff0055");
                }
            });

            document.getElementById('cfg-preset-save')?.addEventListener('click', () => {
                const nameInput = document.getElementById('cfg-preset-name');
                const name = nameInput?.value.trim();
                
                if (!name) {
                    this.showBubble("请输入预设名称", "#ff0055");
                    return;
                }
                
                const currentConfig = {
                    apiType: document.getElementById('cfg-type')?.value || 'native',
                    baseUrl: document.getElementById('cfg-url')?.value || '',
                    apiKey: document.getElementById('cfg-key')?.value || '',
                    model: document.getElementById('cfg-model')?.value || ''
                };
                
                assistant.savePreset(name, currentConfig);
                
                // Refresh the select options
                if (presetSelect) {
                    presetSelect.innerHTML = '<option value="">-- 选择预设 --</option>' + 
                        (userState.apiPresets || []).map(p => `<option value="${p.name}">${p.name}</option>`).join('');
                }

                if (nameInput) nameInput.value = ''; // Clear input
                this.showBubble(`预设 ${name} 已保存`, "var(--l-gold)");
            });

            document.getElementById('cfg-preset-delete')?.addEventListener('click', () => {
                const name = presetSelect?.value;
                if (!name) return;
                if (confirm(`确定要删除预设 "${name}" 吗？`)) {
                    assistant.deletePreset(name);
                    // Refresh the select options
                    if (presetSelect) {
                        presetSelect.innerHTML = '<option value="">-- 选择预设 --</option>' + 
                            (userState.apiPresets || []).map(p => `<option value="${p.name}">${p.name}</option>`).join('');
                    }
                    this.showBubble(`已删除预设: ${name}`, "#ff0055");
                }
            });

            // Buttons - Clear Mem
            document.getElementById('cfg-clear-mem')?.addEventListener('click', () => {
                if(confirm("警告：这将清除所有长期记忆和好感度数据！")) {
                    userState.memoryArchive = [];
                    userState.favorability = 20;
                    userState.sanity = 80;
                    userState.fatePoints = 1000;
                    
                    // Clear Chat History
                    panelChatHistory.length = 0;
                    saveChat();
                    const chatHistoryDiv = document.getElementById('lilith-chat-history');
                    if (chatHistoryDiv) chatHistoryDiv.innerHTML = '';

                    saveState();
                    this.updateUI();
                    this.renderMemoryUI();
                    alert("记忆核心已格式化。");
                }
            });

            // Buttons - Save
            document.getElementById('cfg-save')?.addEventListener('click', () => {
                 const newConfig = {
                    apiType: document.getElementById('cfg-type')?.value || 'native',
                    baseUrl: document.getElementById('cfg-url')?.value || '',
                    apiKey: document.getElementById('cfg-key')?.value || '',
                    model: document.getElementById('cfg-model')?.value || ''
                 };
                 userState.apiConfig = newConfig;
                 // Ensure the live assistant config is also updated
                 if (assistant) {
                    assistant.config = { ...assistant.config, ...newConfig };
                 }
                 saveState();
                 this.showBubble("配置已覆盖由神经中枢...", "#0f0");
            });

             // Buttons - Get Models
             document.getElementById('cfg-get-models')?.addEventListener('click', () => assistant.fetchModels());
        };

        bindSharedConfigEvents();

        // Change Frequency
        const cfgFreq = document.getElementById('cfg-freq');
        const stFreq = document.getElementById('lilith-comment-frequency');
        
        const syncFreq = (val) => {
            userState.commentFrequency = parseInt(val);
            if (cfgFreq) cfgFreq.value = val;
            if (stFreq) stFreq.value = val;
            const valDisplay = document.getElementById('cfg-freq-val');
            const stDisplay = document.querySelector('.lilith-comment-frequency-val');
            if(valDisplay) valDisplay.textContent = val;
            if(stDisplay) stDisplay.textContent = val;
            saveExtensionSettings();
        };

        if (cfgFreq) cfgFreq.addEventListener('input', () => syncFreq(cfgFreq.value));
        if (stFreq) stFreq.addEventListener('input', () => syncFreq(stFreq.value));

        // Comment Mode
        const cfgMode = document.getElementById('cfg-comment-mode');
        const stMode = document.getElementById('lilith-comment-mode');

        const syncMode = (val) => {
            userState.commentMode = val;
            if (cfgMode) cfgMode.value = val;
            if (stMode) stMode.value = val;
            saveExtensionSettings();
        };

        if (cfgMode) cfgMode.addEventListener('change', () => syncMode(cfgMode.value));
        if (stMode) stMode.addEventListener('change', () => syncMode(stMode.value));

        // --- TTS Settings ---
        const ttsPitch = document.getElementById('tts-pitch');
        if (ttsPitch) {
            ttsPitch.addEventListener('input', () => {
                if (!userState.ttsConfig) userState.ttsConfig = { pitch: 1.0, rate: 1.0 };
                userState.ttsConfig.pitch = parseFloat(ttsPitch.value);
                document.getElementById('tts-pitch-val').textContent = userState.ttsConfig.pitch;
                saveExtensionSettings();
            });
        }
        const ttsRate = document.getElementById('tts-rate');
        if (ttsRate) {
            ttsRate.addEventListener('input', () => {
                if (!userState.ttsConfig) userState.ttsConfig = { pitch: 1.0, rate: 1.0 };
                userState.ttsConfig.rate = parseFloat(ttsRate.value);
                document.getElementById('tts-rate-val').textContent = userState.ttsConfig.rate;
                saveExtensionSettings();
            });
        }
        document.getElementById('tts-test-btn')?.addEventListener('click', () => {
             AudioSys.speak("这就是现在的语音效果。");
        });

        // Dynamic Content
        document.getElementById('cfg-dynamic-enable')?.addEventListener('change', (e) => {
            userState.dynamicContentEnabled = e.target.checked;
            saveState();
            const stCheck = document.getElementById('lilith-dynamic-enabled');
            if (stCheck) stCheck.checked = e.target.checked;
        });
        document.getElementById('cfg-dyn-interval')?.addEventListener('change', (e) => {
            userState.dynamicContentInterval = parseInt(e.target.value);
            saveState();
            const stInput = document.getElementById('lilith-dynamic-interval');
            if (stInput) stInput.value = e.target.value;
        });
        document.getElementById('cfg-dyn-count')?.addEventListener('change', (e) => {
            userState.dynamicContentCount = parseInt(e.target.value);
            saveState();
            const stInput = document.getElementById('lilith-dynamic-count');
            if (stInput) stInput.value = e.target.value;
        });
        document.getElementById('cfg-dyn-trigger')?.addEventListener('change', (e) => {
            userState.dynamicContentTriggerChance = parseInt(e.target.value);
            saveState();
            const stInput = document.getElementById('lilith-dynamic-trigger-chance');
            if (stInput) stInput.value = e.target.value;
        });
        document.getElementById('cfg-dyn-force')?.addEventListener('click', () => {
            assistant.generateDynamicContent(window);
            this.showBubble("正在由 AI 重新构思内容...", "var(--l-main)");
        });
        document.getElementById('cfg-dyn-test')?.addEventListener('click', () => {
            assistant.testDynamicTrigger(window);
        });

        // Change Avatar Size
        const cfgSize = document.getElementById('cfg-avatar-size');
        const stSize = document.getElementById('lilith-avatar-size');

        const syncSize = (val) => {
            userState.avatarSize = parseInt(val);
            if (cfgSize) cfgSize.value = val;
            if (stSize) stSize.value = val;
            const valDisplay = document.getElementById('cfg-size-val');
            const stDisplay = document.querySelector('.lilith-avatar-size-val');
            if(valDisplay) valDisplay.textContent = val;
            if(stDisplay) stDisplay.textContent = val;
            this.updateAvatarStyle();
            saveExtensionSettings();
        };

        if (cfgSize) cfgSize.addEventListener('input', () => syncSize(cfgSize.value));
        if (stSize) stSize.addEventListener('input', () => syncSize(stSize.value));

        // Toggle Hide Avatar
        const cfgHide = document.getElementById('cfg-hide-avatar');
        const stHide = document.getElementById('lilith-hide-avatar');

        const syncHide = (checked) => {
            userState.hideAvatar = checked;
            if (cfgHide) cfgHide.checked = checked;
            if (stHide) stHide.checked = checked;
            this.updateAvatarStyle();
            saveExtensionSettings();
        };

        if (cfgHide) cfgHide.addEventListener('change', () => syncHide(cfgHide.checked));
        if (stHide) stHide.addEventListener('change', () => syncHide(stHide.checked));

        // Sync Auto Send
        const cfgAutoSend = document.getElementById('cfg-auto-send');
        const stAutoSend = document.getElementById('lilith-auto-send');
        const syncAutoSend = (checked) => {
            userState.autoSend = checked;
            if (cfgAutoSend) cfgAutoSend.checked = checked;
            const $stAutoSend = $('#lilith-auto-send');
            if ($stAutoSend.length) $stAutoSend.prop('checked', checked);
            else if (stAutoSend) stAutoSend.checked = checked;
            saveExtensionSettings();
        };
        if (cfgAutoSend) cfgAutoSend.addEventListener('change', () => syncAutoSend(cfgAutoSend.checked));
        if (stAutoSend) stAutoSend.addEventListener('change', () => syncAutoSend(stAutoSend.checked));

        // Sync Extraction & Replacement toggles
        const cfgExtract = document.getElementById('cfg-extract-enable');
        const stExtract = document.getElementById('lilith-extraction-enabled');
        const cfgRepl = document.getElementById('cfg-repl-enable');
        const stRepl = document.getElementById('lilith-text-replacement-enabled');

        const syncExtract = (checked) => {
            userState.extractionEnabled = checked;
            if (cfgExtract) cfgExtract.checked = checked;
            // 如果是jQuery对象（侧边栏常用），则使用 .prop
            const $stExtract = $('#lilith-extraction-enabled');
            if ($stExtract.length) $stExtract.prop('checked', checked);
            else if (stExtract) stExtract.checked = checked;
            saveExtensionSettings();
        };

        const syncRepl = (checked) => {
            userState.textReplacementEnabled = checked;
            if (cfgRepl) cfgRepl.checked = checked;
            const $stRepl = $('#lilith-text-replacement-enabled');
            if ($stRepl.length) $stRepl.prop('checked', checked);
            else if (stRepl) stRepl.checked = checked;
            saveExtensionSettings();
        };

        if (cfgExtract) cfgExtract.addEventListener('change', () => syncExtract(cfgExtract.checked));
        if (stExtract) stExtract.addEventListener('change', () => syncExtract(stExtract.checked));
        if (cfgRepl) cfgRepl.addEventListener('change', () => syncRepl(cfgRepl.checked));
        if (stRepl) stRepl.addEventListener('change', () => syncRepl(stRepl.checked));

        // Reset Position
        const cfgResetPos = document.getElementById('cfg-reset-pos');
        const stResetPos = document.getElementById('lilith-reset-pos');

        const resetPos = () => {
            const wrapper = document.getElementById(containerId);
            if (!wrapper) {
                console.error('[Lilith] Reset failed: Wrapper not found');
                return;
            }
            userState.posTop = 100;
            userState.posLeft = 100;
            wrapper.style.top = '100px';
            wrapper.style.left = '100px';
            this.updatePos();
            saveState(); // 使用 saveState 以确保同步到全局设置
            console.log('[Lilith] Position reset to (100, 100)');
        };

        if (cfgResetPos) cfgResetPos.onclick = resetPos;
        if (stResetPos) stResetPos.onclick = resetPos;
        
        // Buttons
        // (Removed duplicate bindings here as they are now handled in bindSharedConfigEvents called above)
        
        // Legacy listener for sidebar settings (keep this if settings.html is loaded elsewhere)
        const personaSelectSidebar = document.getElementById('lilith-persona-select');
        if (personaSelectSidebar) {
            personaSelectSidebar.addEventListener('change', () => {
                switchPersonaState(personaSelectSidebar.value);
                this.updateUI();
            });
        }
    },

    // --- UI 交互 ---
    showBubble(msg, color = null, className = '') {
        let b = document.getElementById(bubbleId); if (b) b.remove();
        b = document.createElement('div'); b.id = bubbleId; 
        if (color) b.style.borderColor = color;
        if (className) b.className = className;
        
        b.innerHTML = `<span style="color:var(--l-cyan)">[莉莉丝]</span> ${msg.length > 200 ? msg.substring(0, 198) + "..." : msg}`;
        if (userState.sanity < 30) b.style.borderColor = '#ff0000';
        b.onclick = () => b.remove();
        const container = document.getElementById(containerId);
        if (container) container.appendChild(b);
        const duration = Math.max(5000, msg.length * 350);
        setTimeout(() => { if (b.parentNode) b.remove(); }, duration);
    },

    togglePanel() {
        const p = document.getElementById(panelId);
        if (!p) return;
        const isOpening = !p.classList.contains('active');
        if (isOpening) {
            p.style.display = 'flex'; // 确保在 DOM 中参与布局
            setTimeout(() => p.classList.add('active'), 10);
            this.updateUI(); 
            this.updatePos();
        } else {
            p.classList.remove('active');
            setTimeout(() => p.style.display = 'none', 300); // 等待动画结束
        }
    },

    updateUI() {
        const elVal = document.getElementById('favor-val');
        const elSan = document.getElementById('sanity-val');
        if (elVal) elVal.textContent = userState.favorability + '%';
        if (elSan) elSan.textContent = userState.sanity + '%';
        this.setAvatar();
        this.updateTheme();
        this.restoreChatHistory(panelChatHistory); // Fix: Added missing argument
    },

    updateTheme() {
        const wrapper = document.getElementById(containerId);
        if (!wrapper) return;

        // 1. 移除旧主题
        wrapper.classList.remove('theme-toxic', 'theme-wife', 'theme-brat', 'theme-imouto', 'theme-meme');

        // 2. 获取当前人格
        const current = userState.activePersona || 'toxic';

        // 3. 添加新主题
        wrapper.classList.add(`theme-${current}`);
        
        // 4. 输入框提示跟随变化
        const input = document.getElementById('lilith-chat-input');
        if (input && PERSONA_DB[current]) {
            const name = PERSONA_DB[current].name.split(' ')[1] || '莉莉丝';
            input.placeholder = `和${name}说话...`;
        }
    },

    parseLilithMsg(text) {
        let inner = "", status = "", action = "", speech = text;

        const innerMatch = speech.match(/\(💭.*?\)|（💭.*?）|\(Inner.*?\)|（潜意识.*?）/is);
        if (innerMatch) {
            inner = innerMatch[0].replace(/[\(（]💭?|Inner:?|潜意识:?|[\)）]/gi, '').trim();
            speech = speech.replace(innerMatch[0], '');
        }

        const statusMatch = speech.match(/\[🩸.*?\].*?\]|\[Status:.*?\]|\[状态:.*?\]/i);
        if (statusMatch) {
            status = statusMatch[0].replace(/[\[\]]|🩸|Status:|状态:/gi, '').trim();
            speech = speech.replace(statusMatch[0], '');
        }

        const actionMatches = speech.match(/\*.*?\*/g);
        if (actionMatches) {
            action = actionMatches.map(a => a.replace(/\*/g, '')).join(' ');
            speech = speech.replace(/\*.*?\*/g, '');
        }

        speech = speech.trim();

        return { inner, status, action, speech };
    },

    addChatMsg(role, text, save = true) {
        const div = document.getElementById('lilith-chat-history');
        if (!div) return;

        // 1. 如果是 lilith，先处理数值变动
        let displayTagName = text;
        if (role === 'lilith') {
            const sMatch = text.match(/\[S:([+\-]?\d+)\]/i);
            const fMatch = text.match(/\[F:([+\-]?\d+)\]/i);
            
            if (sMatch) {
                const val = parseInt(sMatch[1]);
                updateSanity(val);
                if (save && val !== 0) this.showBubble(`理智 ${val > 0 ? '+' : ''}${val}`, "#00e5ff");
            }
            if (fMatch) {
                const val = parseInt(fMatch[1]);
                updateFavor(val);
                if (save && val !== 0) this.showBubble(`好感 ${val > 0 ? '+' : ''}${val}`, "#ff0055");
            }
            // 清理数值标签用于显示和解析
            displayTagName = text.replace(/\[[SF]:[+\-]?\d+\]/gi, '').trim();
        }

        // [核心逻辑更新] 无论是用户还是莉莉丝，在保存到面板历史和显示之前，都经过正则优化 (提取正文/替换)
        const optimizedText = extractContent(displayTagName, userState);

        const msgNode = document.createElement('div');
        msgNode.className = `msg ${role}`;
        
        if (role === 'lilith') {
            const { inner, status, action, speech } = this.parseLilithMsg(optimizedText);
            if (inner || status || (action && action.length > 0)) {
                msgNode.className += ' complex-msg';
                let html = '';
                if (status) html += `<div class="l-status-bar">🩸 ${status}</div>`;
                if (inner) html += `<div class="l-inner-thought">💭 ${inner}</div>`;
                if (action) html += `<div class="l-action-text">* ${action} *</div>`;
                if (speech || (!inner && !action)) {
                    html += `<div class="l-speech-text">${speech || optimizedText}</div>`;
                }
                msgNode.innerHTML = html;
            } else {
                msgNode.textContent = optimizedText;
            }
        } else {
            msgNode.textContent = optimizedText;
        }

        div.appendChild(msgNode);
        div.scrollTop = div.scrollHeight;

        if (save) {
            panelChatHistory.push({ role: role, content: optimizedText });
            saveChat();
        }
    },

    async initSettingsUI(assistant) {
        try {
            const htmlPath = `/scripts/extensions/third-party/${extensionName}/settings.html`;
            const settingsHtml = await $.get(htmlPath);
            $('#extensions_settings').append(settingsHtml);

            // 绑定数据
            const $freq = $('#lilith-comment-frequency');
            const $freqVal = $('#lilith-freq-value');
            const $mode = $('#lilith-comment-mode');
            const $hideAvatar = $('#lilith-hide-avatar');
            const $autoSend = $('#lilith-auto-send');
            const $avatarSize = $('#lilith-avatar-size');

            $freq.val(userState.commentFrequency || 0);
            $freqVal.text(`${userState.commentFrequency || 0}%`);
            $mode.val(userState.commentMode || 'random');
            $hideAvatar.prop('checked', userState.hideAvatar);
            $autoSend.prop('checked', userState.autoSend !== false);
            $avatarSize.val(userState.avatarSize || 150);

            // [新增] 动态内容绑定
            const $dynEnabled = $('#lilith-dynamic-enabled');
            const $dynInterval = $('#lilith-dynamic-interval');
            const $dynCount = $('#lilith-dynamic-count');
            const $dynTriggerChance = $('#lilith-dynamic-trigger-chance');
            const $dynForce = $('#lilith-force-generate-dynamic');

            $dynEnabled.prop('checked', userState.dynamicContentEnabled !== false);
            $dynInterval.val(userState.dynamicContentInterval || 20);
            $dynCount.val(userState.dynamicContentCount || 6);
            $dynTriggerChance.val(userState.dynamicContentTriggerChance || 100);

            $dynEnabled.on('change', (e) => {
                userState.dynamicContentEnabled = $(e.target).prop('checked');
                saveState();
                const cfgCheck = document.getElementById('cfg-dynamic-enable');
                if (cfgCheck) cfgCheck.checked = userState.dynamicContentEnabled;
            });
            $dynInterval.on('change', (e) => {
                userState.dynamicContentInterval = parseInt($(e.target).val());
                saveState();
                const cfgInput = document.getElementById('cfg-dyn-interval');
                if (cfgInput) cfgInput.value = userState.dynamicContentInterval;
            });
            $dynCount.on('change', (e) => {
                userState.dynamicContentCount = parseInt($(e.target).val());
                saveState();
                const cfgInput = document.getElementById('cfg-dyn-count');
                if (cfgInput) cfgInput.value = userState.dynamicContentCount;
            });
            $dynTriggerChance.on('change', (e) => {
                userState.dynamicContentTriggerChance = parseInt($(e.target).val());
                saveState();
                const cfgInput = document.getElementById('cfg-dyn-trigger');
                if (cfgInput) {
                    cfgInput.value = userState.dynamicContentTriggerChance;
                    const valDisplay = document.getElementById('cfg-dyn-trigger-val');
                    if (valDisplay) valDisplay.textContent = userState.dynamicContentTriggerChance;
                }
            });
            $dynForce.on('click', () => {
                assistant.generateDynamicContent(window);
                this.showBubble("正在由 AI 重新构思内容...", "var(--l-main)");
            });
            $('#lilith-test-dynamic-trigger').on('click', () => {
                assistant.testDynamicTrigger(window);
            });

            // [新增] 更新逻辑重构
            const $verInfo = $('#lilith-version-info');
            const $manualBtn = $('#lilith-manual-update-btn');

            $verInfo.text(`${UpdateManager.localVersion}`);

            const refreshUpdateUI = () => {
                const $btnText = $manualBtn.find('span');
                if (UpdateManager.hasUpdate) {
                    $btnText.text(`发现新版 v${UpdateManager.remoteVersion}`);
                    $manualBtn.css({
                        'background': 'var(--l-main, #ff0055)',
                        'color': '#fff',
                        'border': '1px solid #ff0055'
                    });
                } else {
                    $btnText.text('更新插件');
                    $manualBtn.css({
                        'background': '',
                        'color': '',
                        'border': ''
                    });
                }
            };

            // 初始刷新
            refreshUpdateUI();

            $manualBtn.on('click', async () => {
                const $span = $manualBtn.find('span');
                const $icon = $manualBtn.find('i');
                
                $span.text('同步中...');
                $icon.addClass('fa-spin');
                $manualBtn.prop('disabled', true);
                
                await UpdateManager.checkUpdate();
                
                $icon.removeClass('fa-spin');
                
                if (UpdateManager.hasUpdate) {
                    $span.text('更新中...');
                    await UpdateManager.updateAndReload();
                } else {
                    toastr.success('已是最新版本');
                    $manualBtn.prop('disabled', false);
                    refreshUpdateUI();
                }
            });

            // [新增] 正则方案联动绑定
            const $regexSelect = $('#lilith-regex-preset-select');
            const $regexSave = $('#lilith-regex-save');
            const $regexDelete = $('#lilith-regex-delete');
            const $regexNewNameInput = $('#lilith-regex-new-name');
            const $regexNameContainer = $('#lilith-regex-name-container');

            const refreshRegexDropdowns = () => {
                const options = '<option value="">-- 选择方案 --</option>' + 
                                (userState.regexPresets || []).map(p => `<option value="${p.name}">${p.name}</option>`).join('');
                $regexSelect.html(options);
                const cfgRegexSelect = document.getElementById('cfg-regex-preset-select');
                if (cfgRegexSelect) cfgRegexSelect.innerHTML = options;
            };
            refreshRegexDropdowns();

            $regexSelect.on('change', (e) => {
                const name = $(e.target).val();
                if (!name) return;
                assistant.loadRegexPreset(name);
                
                // 1. 同步侧边栏所有输入框和勾选框
                $('#lilith-extraction-enabled').prop('checked', !!userState.extractionEnabled);
                $('#lilith-extraction-regex').val(userState.extractionRegex || '');
                $('#lilith-text-replacement-enabled').prop('checked', !!userState.textReplacementEnabled);
                $('#lilith-text-replacement-regex').val(userState.textReplacementRegex || '');
                $('#lilith-text-replacement-string').val(userState.textReplacementString || '');
                
                // 2. 同步悬浮窗勾选框 (关键：之前的代码漏了这里)
                const cfgExtractEnable = document.getElementById('cfg-extract-enable');
                const cfgReplEnable = document.getElementById('cfg-repl-enable');
                if (cfgExtractEnable) cfgExtractEnable.checked = !!userState.extractionEnabled;
                if (cfgReplEnable) cfgReplEnable.checked = !!userState.textReplacementEnabled;
                
                // 3. 同步悬浮窗下拉
                const cfgRegexSelect = document.getElementById('cfg-regex-preset-select');
                if (cfgRegexSelect) cfgRegexSelect.value = name;

                this.showBubble(`已应用正则方案: ${name}`, "var(--l-cyan)");
            });

            $regexSave.on('click', () => {
                if ($regexNameContainer.is(':visible')) {
                    const name = $regexNewNameInput.val().trim();
                    if (!name) return;
                    assistant.saveRegexPreset(name);
                    $regexNewNameInput.val('');
                    $regexNameContainer.hide();
                    refreshRegexDropdowns();
                    this.showBubble(`正则方案 ${name} 已保存`);
                } else {
                    $regexNameContainer.show();
                    $regexNewNameInput.focus();
                }
            });

            $regexDelete.on('click', () => {
                const name = $regexSelect.val();
                if (!name) return;
                if (confirm(`确定要从库中删除正则方案 "${name}" 吗？`)) {
                    assistant.deleteRegexPreset(name);
                    refreshRegexDropdowns();
                    this.showBubble(`已删除方案: ${name}`, "#ff0055");
                }
            });

            // [新增] 正文提取 UI 绑定
            const $extractEnable = $('#lilith-extraction-enabled');
            const $extractRegex = $('#lilith-extraction-regex');

            // [新增] 文字替换 UI 绑定
            const $replEnable = $('#lilith-text-replacement-enabled');
            const $replRegex = $('#lilith-text-replacement-regex');
            const $replString = $('#lilith-text-replacement-string');

            $extractEnable.prop('checked', userState.extractionEnabled);
            $extractRegex.val(userState.extractionRegex);

            $replEnable.prop('checked', userState.textReplacementEnabled);
            $replRegex.val(userState.textReplacementRegex);
            $replString.val(userState.textReplacementString);

            $extractEnable.on('change', (e) => {
                userState.extractionEnabled = $(e.target).prop('checked');
                saveExtensionSettings();
            });

            $extractRegex.on('change', (e) => {
                userState.extractionRegex = $(e.target).val();
                saveExtensionSettings();
            });

            $replEnable.on('change', (e) => {
                userState.textReplacementEnabled = $(e.target).prop('checked');
                saveExtensionSettings();
            });
            
            $replRegex.on('change', (e) => {
                userState.textReplacementRegex = $(e.target).val();
                saveExtensionSettings();
            });
            
            $replString.on('change', (e) => {
                userState.textReplacementString = $(e.target).val();
                saveExtensionSettings();
            });

            $('#lilith-extraction-test-btn').on('click', () => {
                const input = $('#lilith-extraction-test-input').val();
                const extractRegexStr = $extractRegex.val();
                const replRegexStr = $replRegex.val();
                const replStr = $replString.val();
                
                const useExtract = $extractEnable.prop('checked');
                const useRepl = $replEnable.prop('checked');

                let result = input;
                let log = [];

                // 1. Extraction Test
                if (useExtract && extractRegexStr) {
                    try {
                        const pattern = createSmartRegExp(extractRegexStr, 's');
                        const match = pattern.exec(result);
                        if (match) {
                            result = match[1] !== undefined ? match[1] : match[0];
                            log.push("Extraction: OK");
                        } else {
                            log.push("Extraction: No Match");
                        }
                    } catch (err) {
                        log.push("Extraction Error: " + err.message);
                    }
                }

                // 2. Replacement Test
                if (useRepl && replRegexStr) {
                    try {
                        const pattern = createSmartRegExp(replRegexStr, 'g');
                        const before = result;
                        result = result.replace(pattern, replStr || "");
                        if (result !== before) {
                             log.push("Replace: OK");
                        } else {
                             log.push("Replace: No Match");
                        }
                    } catch (err) {
                        log.push("Replace Error: " + err.message);
                    }
                }

                const $display = $('#lilith-extraction-test-result');
                $display.text(`[Logs: ${log.join(' | ')}]\n---\n${result}`);
                
                // Visual feedback
                $display.css('color', '#aaffaa');
                setTimeout(() => $display.css('color', 'var(--SmartThemeBodyColor)'), 500);
            });

            // 绑定事件
            $freq.on('input', (e) => {
                const val = parseInt($(e.target).val());
                userState.commentFrequency = val;
                $freqVal.text(`${val}%`);
                
                // [Sync] Update Floating Panel
                const cfgFreq = document.getElementById('cfg-freq');
                const cfgFreqVal = document.getElementById('cfg-freq-val');
                if(cfgFreq) cfgFreq.value = val;
                if(cfgFreqVal) cfgFreqVal.textContent = val;

                saveExtensionSettings();
            });

            $mode.on('change', (e) => {
                userState.commentMode = $(e.target).val();
                
                // [Sync] Update Floating Panel
                const cfgMode = document.getElementById('cfg-comment-mode');
                if(cfgMode) cfgMode.value = userState.commentMode;

                saveExtensionSettings();
            });

            $hideAvatar.on('change', (e) => {
                userState.hideAvatar = $(e.target).prop('checked');
                this.setAvatar();
                this.updateAvatarStyle();
                
                // [Sync] Update Floating Panel
                const cfgHide = document.getElementById('cfg-hide-avatar');
                if(cfgHide) cfgHide.checked = userState.hideAvatar;

                saveExtensionSettings();
            });

            $autoSend.on('change', (e) => {
                userState.autoSend = $(e.target).prop('checked');
                
                // [Sync] Update Floating Panel
                const cfgAuto = document.getElementById('cfg-auto-send');
                if(cfgAuto) cfgAuto.checked = userState.autoSend;

                saveExtensionSettings();
            });

            $avatarSize.on('input', (e) => { 
                userState.avatarSize = parseInt($(e.target).val());
                this.updateAvatarStyle();
                
                // [Sync] Update Floating Panel
                const cfgSize = document.getElementById('cfg-avatar-size');
                const cfgSizeVal = document.getElementById('cfg-size-val');
                if(cfgSize) cfgSize.value = userState.avatarSize;
                if(cfgSizeVal) cfgSizeVal.textContent = userState.avatarSize;

                saveExtensionSettings();
            });

            $('#lilith-toggle-panel').on('click', () => {
                this.togglePanel();
            });

            $('#lilith-reset-pos').on('click', () => {
                const wrapper = document.getElementById(containerId);
                if (wrapper) {
                    userState.posTop = 100;
                    userState.posLeft = 100;
                    wrapper.style.top = '100px';
                    wrapper.style.left = '100px';
                    this.updatePos();
                    saveState();
                    this.showBubble("看板娘已重置到初始位置 (100, 100)");
                }
            });

            $('#lilith-reset-state').on('click', () => {
                if (confirm('确定要重置莉莉丝的状态吗？这会清空好感度与记忆（仅限当前选中人格）。')) {
                    userState.favorability = 20;
                    userState.sanity = 80;
                    userState.fatePoints = 1000;
                    userState.gachaInventory = [];
                    userState.memoryArchive = [];
                    
                    // 清除对话历史
                    panelChatHistory.length = 0;
                    saveChat();
                    const chatHistoryDiv = document.getElementById('lilith-chat-history');
                    if (chatHistoryDiv) chatHistoryDiv.innerHTML = '';

                    // 持久化保存
                    saveState();
                    this.updateUI();
                    this.renderMemoryUI();
                    alert('当前人格状态已重置');
                }
            });

            console.log('[Lilith] Settings UI initialized');
        } catch (err) {
            console.error('[Lilith] Failed to load settings UI:', err);
        }
    },

    restoreChatHistory(panelChatHistory) {
        const div = document.getElementById('lilith-chat-history');
        if (!div) return;
        div.innerHTML = '';
        if (!Array.isArray(panelChatHistory)) return;

        // [优化] 去重逻辑：如果检测到连续两条内容一模一样的，只渲染第一条
        let lastText = "";
        panelChatHistory.forEach(msg => {
            const content = msg.content || msg.text || '';
            const clean = content.replace(/\[[SF]:[+\-]?\d+\]/g, '').trim();
            if (clean && clean !== lastText) {
                this.addChatMsg(msg.role === 'lilith' || msg.role === 'assistant' ? 'lilith' : 'user', clean, false);
                lastText = clean;
            }
        });
        div.scrollTop = div.scrollHeight;
    },

    renderMemoryUI() {
        const container = document.getElementById('memory-container');
        if (!container) return;
        container.innerHTML = '';
        if (userState.memoryArchive.length === 0) {
            container.innerHTML = '<div style="text-align:center; margin-top:50px; color:#444;">[ 还没有产生值得铭记的回忆 ]</div>';
            return;
        }
        [...userState.memoryArchive].reverse().forEach((mem, idx) => {
            const card = document.createElement('div');
            card.style.cssText = 'background:rgba(255,255,255,0.05); padding:10px; border-left:3px solid #bd00ff; font-size:11px; color:#ccc; line-height:1.4;';
            card.innerHTML = `<div style="color:#bd00ff; font-weight:bold; margin-bottom:4px;">🔑 记忆碎片 #${userState.memoryArchive.length - idx}</div><div>${mem}</div>`;
            container.appendChild(card);
        });
    },

    updateFP(parentWin, newVal) {
        userState.fatePoints = newVal;
        saveState();
        const fpEl = document.getElementById('gacha-fp-val');
        if (fpEl) {
            fpEl.textContent = userState.fatePoints;
            fpEl.style.color = '#00ff00';
            setTimeout(() => { fpEl.style.color = 'var(--l-gold)'; }, 800);
        }
    },

    // --- 消息美化 (Formatting) ---
    applyLilithFormatting(element) {
        if (!element) return;
        const $el = $(element);
        const mesText = $el.find('.mes_text').length ? $el.find('.mes_text') : ($el.hasClass('mes_text') ? $el : null);
        if (!mesText || mesText.length === 0) return;
        if (mesText.find('.lilith-chat-ui-wrapper').length > 0) return;

        let hasModified = false;
        let commentText = null;
        let insertAfterNode = null;

        const walk = (node) => {
            if (!node || commentText !== null) return;
            const children = Array.from(node.childNodes);
            for (const child of children) {
                if (commentText !== null) break;
                if (child.nodeType === 3) {
                    const text = child.nodeValue;
                    const startMarker = '[莉莉丝]';
                    const endMarker = '[/莉莉丝]';
                    if (text && text.includes(startMarker)) {
                        const idx = text.indexOf(startMarker);
                        const before = text.slice(0, idx);
                        const rest = text.slice(idx + startMarker.length);
                        child.nodeValue = before;
                        
                        let collected = "";
                        let hasClosing = false;
                        
                        // 检查初始片段是否包含闭合标记
                        if (rest.includes(endMarker)) {
                            const endIdx = rest.indexOf(endMarker);
                            collected = rest.slice(0, endIdx);
                            const suffix = rest.slice(endIdx + endMarker.length);
                            const suffixNode = document.createTextNode(suffix);
                            if (child.parentNode) child.parentNode.insertBefore(suffixNode, child.nextSibling);
                            hasClosing = true;
                        } else {
                            collected = rest;
                            let next = child.nextSibling;
                            while (next) {
                                if (next.nodeType === 3) {
                                    const val = next.nodeValue;
                                    if (val.includes(endMarker)) {
                                        const parts = val.split(endMarker);
                                        collected += parts[0];
                                        next.nodeValue = parts.slice(1).join(endMarker); 
                                        hasClosing = true;
                                        break;
                                    }
                                    if (val.includes('\n\n')) {
                                        const parts = val.split('\n\n');
                                        collected += parts[0];
                                        break; 
                                    }
                                    collected += val;
                                } else if (next.nodeType === 1) {
                                    if (next.tagName === 'BR') collected += '\n';
                                    else {
                                        const htmlContent = next.outerHTML || next.textContent;
                                        if (htmlContent.includes(endMarker)) {
                                            const parts = htmlContent.split(endMarker);
                                            collected += parts[0];
                                            hasClosing = true;
                                            break;
                                        }
                                        collected += htmlContent;
                                    }
                                }
                                let nextToProcess = next.nextSibling;
                                next.remove();
                                next = nextToProcess;
                            }
                        }
                        
                        commentText = collected.trim();
                        insertAfterNode = child;
                        hasModified = true;
                    }
                } else if (child.nodeType === 1) {
                    if (!child.classList.contains('lilith-chat-ui-wrapper') && !['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT'].includes(child.tagName)) walk(child);
                }
            }
        };
        walk(mesText[0]);

        if (hasModified && commentText) {
            // --- 使用复用的解析逻辑 ---
            const { inner, status, action, speech } = this.parseLilithMsg(commentText);

            // 构建新版 UI
            const currentPersona = userState.activePersona || 'toxic';
            const pack = AvatarPacks[currentPersona] || AvatarPacks['meme'];
            
            // 简单的表情选择逻辑 (基于 speech)
            let faceKey = 'normal';
            if (speech.includes('❤') || speech.includes('想要')) faceKey = 'horny';
            else if (speech.includes('杂鱼') || speech.includes('弱')) faceKey = 'mockery';
            else if (speech.includes('不') || speech.includes('哼')) faceKey = 'angry';
            
            const avatarUrl = pack[faceKey] || pack['normal'];

            let html = '<div class="lilith-chat-ui-wrapper"><div class="lilith-chat-ui">';
            if (status) html += `<div class="l-status-bar">🩸 ${status}</div>`;
            if (inner) html += `<div class="l-inner-thought">💭 ${inner}</div>`;
            if (action) html += `<div class="l-action-text">* ${action} *</div>`;
            
            html += `<div class="l-speech-wrapper">
                        <div class="lilith-chat-avatar" style="background-image: url('${avatarUrl}')"></div>
                        <div class="l-speech-text">${speech || commentText}</div>
                     </div>`;
            html += '</div></div>';

            let targetToInsert = insertAfterNode;
            
            // 如果父节点是段落或其它块元素，则把卡片插在块级元素之后，防止样式嵌套导致的包裹感缺失
            const parent = insertAfterNode.parentElement;
            if (parent && parent !== mesText[0] && !['SPAN', 'B', 'I', 'STRONG', 'EM'].includes(parent.tagName)) {
                targetToInsert = parent;
            }

            if (targetToInsert) {
                $(targetToInsert).after(html);
            } else {
                mesText.append(html);
            }
        }
    }
};
