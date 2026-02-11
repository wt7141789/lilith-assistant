// modules/assistant_manager.js
import { extensionName, avatarId, bubbleId, MAX_HISTORY_TRIGGER, HISTORY_KEEP, PERSONA_DB, GachaConfig, WRITER_PERSONA, JAILBREAK } from './config.js';
import { userState, saveState, saveChat, panelChatHistory, updateFavor, updateSanity } from './storage.js';
import { AudioSys } from './audio.js';
import { getDynamicPersona } from './persona.js';
import { getPageContext, createSmartRegExp, extractContent } from './utils.js';
import { UIManager } from './ui_manager.js';

export const assistantManager = {
    config: {
        apiType: 'native',
        baseUrl: 'https://generativelanguage.googleapis.com',
        apiKey: '',
        model: 'gemini-1.5-flash'
    },

    extensionPath: `/scripts/extensions/third-party/${extensionName}`,

    // --- API 预设管理 ---
    savePreset(name, config) {
        if (!name) return;
        const currentConfig = config || { ...this.config };
        const presets = userState.apiPresets || [];
        const index = presets.findIndex(p => p.name === name);
        
        if (index !== -1) presets[index] = { name, config: currentConfig };
        else presets.push({ name, config: currentConfig });
        
        userState.apiPresets = presets;
        this.config = { ...currentConfig };
        userState.apiConfig = { ...currentConfig };
        saveState();
    },

    loadPreset(name) {
        const presets = userState.apiPresets || [];
        const preset = presets.find(p => p.name === name);
        if (preset) {
            this.config = JSON.parse(JSON.stringify(preset.config || preset.apiConfig || {}));
            userState.apiConfig = JSON.parse(JSON.stringify(this.config));
            saveState();
            return true;
        }
        return false;
    },

    // --- 正则方案管理 (Regex Presets) ---
    saveRegexPreset(name) {
        if (!name) return;
        const presets = userState.regexPresets || [];
        const currentRegex = {
            enabled: !!userState.extractionEnabled,
            regex: userState.extractionRegex || '',
            replEnabled: !!userState.textReplacementEnabled,
            replRegex: userState.textReplacementRegex || '',
            replString: userState.textReplacementString || ''
        };
        const index = presets.findIndex(p => p.name === name);
        if (index !== -1) presets[index] = { name, data: currentRegex };
        else presets.push({ name, data: currentRegex });
        userState.regexPresets = presets;
        saveState();
    },

    loadRegexPreset(name) {
        const presets = userState.regexPresets || [];
        const preset = presets.find(p => p.name === name);
        if (preset && preset.data) {
            userState.extractionEnabled = !!preset.data.enabled;
            userState.extractionRegex = preset.data.regex || '';
            userState.textReplacementEnabled = !!preset.data.replEnabled;
            userState.textReplacementRegex = preset.data.replRegex || '';
            userState.textReplacementString = preset.data.replString || '';
            saveState();
            return true;
        }
        return false;
    },

    deleteRegexPreset(name) {
        const presets = userState.regexPresets || [];
        userState.regexPresets = presets.filter(p => p.name !== name);
        saveState();
    },

    deletePreset(name) {
        const presets = userState.apiPresets || [];
        userState.apiPresets = presets.filter(p => p.name !== name);
        saveState();
    },

    sendToSillyTavern(parentWin, text, autoSend = true) {
        try {
            const context = SillyTavern.getContext();
            if (autoSend) {
                // 使用 | /trigger 确保在发送后立即触发 AI 生成
                const command = `/send ${text} | /trigger`;
                if (typeof context.executeSlashCommands === 'function') {
                    context.executeSlashCommands(command);
                } else if (typeof context.executeSlashCommand === 'function') {
                    context.executeSlashCommand(command);
                } else {
                    throw new Error('No slash command execution method found');
                }
            } else {
                // 仅输入模式：使用 /setinput
                const command = `/setinput ${text}`;
                if (typeof context.executeSlashCommands === 'function') {
                    context.executeSlashCommands(command);
                } else if (typeof context.executeSlashCommand === 'function') {
                    context.executeSlashCommand(command);
                } else {
                    throw new Error('No slash command execution method found');
                }
            }
        } catch (e) {
            console.warn('[Lilith] SillyTavern API execution failed, falling back to DOM manipulation.', e);
            // 备选方案：手动操作 DOM (以防 API 不可用)
            const input = parentWin.document.getElementById('send_textarea');
            if (input) {
                const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
                nativeInputValueSetter.call(input, text);
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
                
                if (autoSend) {
                    setTimeout(() => {
                        const btn = parentWin.document.getElementById('send_but');
                        if (btn) btn.click();
                    }, 100);
                }
            }
        }
    },

    gachaSystem: {
        timer: null,
        calculateTiers(count) {
            const results = [];
            for (let i = 0; i < count; i++) {
                const rand = Math.random() * 100;
                let selected = 'mortal';
                let sum = 0;
                for (const [key, val] of Object.entries(GachaConfig.tiers)) {
                    sum += val.prob;
                    if (rand <= sum) { selected = key; break; }
                }
                results.push(selected);
            }
            return results.sort((a, b) => GachaConfig.tiers[a].prob - GachaConfig.tiers[b].prob);
        },
        async generateItems(parentWin, tierList) {
            const tierDesc = tierList.map((t, index) => {
                const info = GachaConfig.tiers[t];
                return `Item ${index+1}: [Rank: ${info.name}] (Power Level: ${info.power})`;
            }).join('\\n');

            const systemPrompt = `
                [System Role: Fantasy Gacha Generator (Lilith Edition)]
                [Tone: Erotic, Dark Fantasy, Detailed, slightly mocking if the item is trash.]
                
                [Task]: Generate items based on the provided Rank list.
                
                [Categories (Randomly assign one category to each item)]:
                1. **Weapon/Equipment**: Swords, armor, staffs.
                2. **Material/Potion**: Crafting parts, alchemy potions, fluids.
                3. **Magic Tool**: Rings, amulets, orbs.
                4. **Disposable Scroll**: One-time use magic spells.
                5. **Skill Book**: Spells, martial arts manuals.
                6. **Lilith's Special Toy (NSFW)**: Sex toys or erotic magic tools provided by Lilith.
                7. **Clothing (NSFW)**: Lingerie, cosplay, armor with exposure, various styles.

                [Strict Constraints]:
                * **Mortal (凡阶)**: MUST be mundane. Cannot change reality. Can be trash or simple tools.
                * **Epic/Demigod (史诗/半神)**: MUST be powerful. Even if it's a sex toy, it must have mind-breaking or reality-bending effects. NO TRASH ALLOWED.
                * **Category 6 & 7**: Must be erotic/lewd in description.
                * **Language**: Simplified Chinese.
                
                [Output Format]:
                Strictly a JSON Array: [{"name": "Item Name", "desc": "Category: [Type] | Description...", "category_id": 1}]
                `;

            const userPrompt = `Generate ${tierList.length} items based on this list:\\n${tierDesc}\\n\\nReturn JSON ONLY. No markdown code blocks.`;

            try {
                let response = await assistantManager.callUniversalAPI(parentWin, userPrompt, { isChat: false, systemPrompt: systemPrompt });
                if (!response) throw new Error("API No Response");
                
                const firstBracket = response.indexOf('[');
                const lastBracket = response.lastIndexOf(']');
                if (firstBracket !== -1 && lastBracket !== -1) {
                    response = response.substring(firstBracket, lastBracket + 1);
                } else {
                    response = response.replace(/```json/g, '').replace(/```/g, '').trim();
                }
                
                const items = JSON.parse(response);
                
                return items.map((item, i) => ({
                    tier: tierList[i] || 'mortal',
                    info: GachaConfig.tiers[tierList[i]] || GachaConfig.tiers['mortal'],
                    name: item.name || '未知物品',
                    desc: item.desc || '物品数据解析失败...'
                }));

            } catch (e) {
                console.error(e);
                AudioSys.speak("切，运气太差，数据都加载不出来。");
                return tierList.map(t => ({
                    tier: t,
                    info: GachaConfig.tiers[t],
                    name: "无法识别的残渣",
                    desc: "因为API被玩坏了或者是被系统拦截了，这东西无法显示。"
                }));
            }
        },
        async doPull(parentWin, count) {
            const totalCost = count * GachaConfig.cost;
            const stage = document.getElementById('gacha-visual-area');
            if (this.timer) clearTimeout(this.timer);
            stage.innerHTML = '';
            if (userState.fatePoints < totalCost) {
                stage.innerHTML = `<div style="color:var(--l-main); margin-top:50px; text-align:center;">🚫 也没钱啊穷鬼<br><small style="color:#888">手动改下数字会死吗？</small></div>`;
                AudioSys.speak("没钱就滚，别浪费老娘时间。");
                return;
            }
            userState.fatePoints -= totalCost;
            saveState();
            UIManager.updateFP(parentWin, userState.fatePoints);
            try { assistantManager.sendToSillyTavern(parentWin, `/echo [系统] 消耗 ${totalCost} FP`, false); } catch(e){}
            
            stage.innerHTML = `
                <div class="summon-circle"></div>
                <div style="position:absolute; bottom:10px; width:100%; text-align:center; color:var(--l-cyan); font-size:10px;">❤ 正在榨取命运红线...</div>
                <div id="gacha-flash" class="summon-flash"></div>
            `;
            AudioSys.speak("正在翻垃圾堆...稍等。");
            const tiers = this.calculateTiers(count);
            const itemPromise = this.generateItems(parentWin, tiers);
            const minTime = new Promise(r => setTimeout(r, 1500)); 
            const [items, _] = await Promise.all([itemPromise, minTime]);
            const flash = document.getElementById('gacha-flash');
            if(flash) flash.classList.add('flash-anim');
            setTimeout(() => {
                stage.innerHTML = '';
                const closeBtn = document.createElement('div');
                closeBtn.className = 'gacha-close-btn';
                closeBtn.innerHTML = '✖';
                closeBtn.onclick = () => {
                    stage.innerHTML = '<div style="color:#444; margin-top:50px;">[ 既然抽完了就滚吧 ]</div>';
                    if(this.timer) clearTimeout(this.timer);
                };
                stage.appendChild(closeBtn);
                items.forEach((res, i) => {
                    userState.gachaInventory.push(res);
                    setTimeout(() => {
                        const card = document.createElement('div');
                        card.className = `gacha-card ${res.tier}`;
                        card.style.animation = 'card-entry 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards';
                        card.title = res.desc;
                        const infoColor = res.info ? res.info.color : '#fff';
                        const infoName = res.info ? res.info.name : '???';
                        card.innerHTML = `
                            <div style="color:${infoColor}; font-weight:bold; font-size:9px; margin-bottom:2px;">${infoName}</div>
                            <div style="font-size:11px; line-height:1.2; overflow:hidden; font-weight:bold; height:26px;">${res.name}</div>
                            <div class="tier-bar" style="background:${infoColor}"></div>
                        `;
                        card.onclick = () => { alert(`【${res.name}】\\n品质：${infoName}\\n\\n${res.desc}`); };
                        stage.appendChild(card);
                    }, i * 150);
                });
                saveState();
                this.updateInventoryUI();
                AudioSys.speak("也就这种成色，和你真配。");
                this.timer = setTimeout(() => {
                     stage.innerHTML = '<div style="color:#444; margin-top:50px;">[ 太磨叽了，小鸡吧男 ]</div>';
                }, 20000 + (count * 150));
            }, 400);
        },
        updateInventoryUI() {
            const list = document.getElementById('gacha-inv-list');
            if (!list) return;
            list.innerHTML = '';
            [...userState.gachaInventory].reverse().forEach((item) => {
                const row = document.createElement('div');
                row.className = 'inv-item';
                row.style.cursor = "help";
                row.title = item.desc;
                const color = item.info ? item.info.color : '#888';
                const rankName = item.info ? item.info.name : '未知';
                row.innerHTML = `
                    <span style="color:${color}; flex-shrink:0;">[${rankName}]</span>
                    <span style="margin-left:5px; color:#ddd;">${item.name}</span>
                `;
                list.appendChild(row);
            });
        },
        claimRewards(parentWin) {
            if (userState.gachaInventory.length === 0) {
                AudioSys.speak("没东西领个屁啊？");
                return;
            }
            const itemLines = userState.gachaInventory.map(i => {
                 const rank = i.info ? i.info.name : '未知';
                 return `★ [${rank}] 【${i.name}】：${i.desc}`;
            }).join('\\n');
            const exportText = `\n(莉莉丝嫌弃地把抽到的东西扔到了你脸上.全部加入背包)\n=== 📦 获得物品清单 ===\n${itemLines}\n=======================\n`.trim();
            assistantManager.sendToSillyTavern(parentWin, exportText, false);
            UIManager.showBubble("物资清单已填入。");
            userState.gachaInventory = [];
            saveState();
            this.updateInventoryUI();
        }
    },

    async checkAndSummarize(parentWin, force = false) {
        if (!force && panelChatHistory.length < MAX_HISTORY_TRIGGER) return;
        if (panelChatHistory.length <= HISTORY_KEEP && !force) return;

        UIManager.showBubble("正在整理肮脏的记忆...", "#bd00ff");
        
        const toSummarize = panelChatHistory.slice(0, Math.max(0, panelChatHistory.length - HISTORY_KEEP));
        const keepHistory = panelChatHistory.slice(Math.max(0, panelChatHistory.length - HISTORY_KEEP));

        if (toSummarize.length === 0) {
            UIManager.showBubble("没什么可总结的。", "#f00");
            return;
        }

        const textBlock = toSummarize.map(m => `${m.role}: ${m.content}`).join('\n');
        const prompt = `
            [System Task: Memory Consolidation]
            Summarize the following conversation in Simplified Chinese.
            Focus on: Key events, User's fetishes revealed, Relationship changes, and Lilith's current mood cause.
            Keep it concise (under 200 words).
            Conversation:
            ${textBlock}
            `;

        try {
            const summary = await this.callUniversalAPI(parentWin, prompt, { 
                isChat: false, 
                mode: 'memory_internal', 
                systemPrompt: "You are a database system recording events."
            });

            if (summary) {
                userState.memoryArchive.push(summary.trim());
                // 裁剪历史记录
                panelChatHistory.length = 0;
                panelChatHistory.push(...keepHistory);
                saveChat();
                saveState();
                
                UIManager.renderMemoryUI();
                UIManager.showBubble("记忆已归档。", "#0f0");
            } else {
                 UIManager.showBubble("记忆总结失败 (API返回空)", "#f00");
            }
        } catch (e) {
            console.error("Summary failed", e);
            UIManager.showBubble("记忆总结出错: " + e.message, "#f00");
        }
    },

    async callUniversalAPI(parentWin, text, options = {}) {
        UIManager.setLoadingState(true);
        try {
            const { isChat = false, mode = "normal", systemPrompt = null } = options; 
            const isInternal = mode === 'memory_internal';
            const { apiType, apiKey, baseUrl, model } = this.config; 
            if (!apiKey) return null;
            
            let url = baseUrl.replace(/\/$/, ''); 
            let finalSystemPrompt = systemPrompt || getDynamicPersona();
            
            const memoryBlock = userState.memoryArchive.length > 0 ? `\n[Long-term Memory / Previous Context]:\n${userState.memoryArchive.join('\n')}\n` : "";
            
            if (!isInternal) { 
                if (mode === "roast") finalSystemPrompt += "\n[Task: Roast within story context. Short. Toxic.]"; 
                else if (isChat) { 
                    finalSystemPrompt += `\n${JAILBREAK}\n[Constraint: Response must be detailed.]`; 
                    finalSystemPrompt += memoryBlock; 
                } else finalSystemPrompt += `\n${JAILBREAK}`; 
            }
            
            let msgs = isChat && !isInternal ? [{ role: 'system', content: finalSystemPrompt }, ...panelChatHistory, { role: 'user', content: text }] : [{ role: 'user', content: finalSystemPrompt + "\n" + text }];
            let fetchUrl, fetchBody, fetchHeaders;
            if (apiType === 'openai') {
                if (!url.endsWith('/v1')) url += '/v1'; 
                fetchUrl = `${url}/chat/completions`; 
                fetchHeaders = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` };
                fetchBody = JSON.stringify({ model: model, messages: msgs, max_tokens: 4096, temperature: 1.0 });
            } else {
                let modelId = model; 
                if (!modelId.startsWith('models/') && !url.includes(modelId)) modelId = 'models/' + modelId;
                fetchUrl = `${url}/v1beta/${modelId}:generateContent?key=${apiKey}`;
                let promptText = isChat ? msgs.map(m => `[${m.role === 'lilith' ? 'Model' : (m.role==='system'?'System':'User')}]: ${m.content}`).join('\\n') : msgs[0].content;
                fetchHeaders = { 'Content-Type': 'application/json' }; 
                fetchBody = JSON.stringify({ 
                    contents: [{ role: 'user', parts: [{ text: promptText }] }], 
                    generationConfig: { maxOutputTokens: 4096 },
                    safetySettings: [
                        { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
                        { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
                        { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
                        { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
                    ]
                });
            }
            const response = await fetch(fetchUrl, { method: 'POST', headers: fetchHeaders, body: fetchBody });
            const data = await response.json();
            let reply = apiType === 'openai' ? data.choices?.[0]?.message?.content : data.candidates?.[0]?.content?.parts?.[0]?.text;
            reply = reply?.trim();
            if (isChat && reply && !isInternal) { 
                this.checkAndSummarize(parentWin);
            }
            return reply;
        } catch(e) { 
            console.error("API Error:", e); 
            return null; 
        } finally {
            UIManager.setLoadingState(false);
        }
    },

    /**
     * 手动触发吐槽逻辑
     */
    async manualComment() {
        const context = SillyTavern.getContext();
        const chat = context.chat || [];
        if (chat.length === 0) return;

        // 寻找最后一个非用户非系统的消息作为锚点
        let lastAiMsg = null;
        for (let i = chat.length - 1; i >= 0; i--) {
            if (!chat[i].is_user && !chat[i].is_system) {
                lastAiMsg = chat[i];
                break;
            }
        }

        if (!lastAiMsg) {
            if (typeof UIManager !== 'undefined' && UIManager.showBubble) {
                UIManager.showBubble("这里连个能吐槽的人都没有...", "#ff0055");
            }
            return;
        }

        const messageId = lastAiMsg.message_id || lastAiMsg.mesid || chat.indexOf(lastAiMsg);
        await this.triggerRealtimeComment(messageId);
    },

    async triggerRealtimeComment(messageId) {
        console.log('[Lilith] triggerRealtimeComment called for messageId', messageId);
        const context = SillyTavern.getContext();
        const chatData = context.chat || [];

        let targetIndex = chatData.findIndex(m =>
            (typeof m.message_id === 'number' && m.message_id === messageId) ||
            (typeof m.mesid === 'number' && m.mesid === messageId)
        );

        if (targetIndex === -1) {
            targetIndex = chatData.length - 1;
        }

        const targetMsg = chatData[targetIndex];
        if (!targetMsg || targetMsg.is_user || targetMsg.is_system) {
            console.error('[Lilith] targetMsg invalid for comment (not an AI reply). messageId:', messageId, 'index:', targetIndex);
            return;
        }

        // UI Feedback (Imported from ui_manager later if needed)
        // For now, assume global availability or we refactor ui interaction
        const thinkingPrompts = [
            "让我看看你又说了什么蠢话... 💭",
            "思考中... 这种回复也亏你想得出来。 💢",
            "正在构思如何优雅地吐槽你... 🔍",
            "正在锐评中... ⚖️"
        ];
        const randomThinking = thinkingPrompts[Math.floor(Math.random() * thinkingPrompts.length)];
        
        // Internal event or callback might be better, but let's stick to direct call if possible
        const bubble = document.getElementById('lilith-bubble-cn');
        if (bubble) bubble.textContent = randomThinking;

        const chatLog = getPageContext(5, userState).map(m => `${m.name}: ${m.message}`).join('\n');
        const persona = PERSONA_DB[userState.activePersona] || PERSONA_DB['toxic'];
        
        const systemPrompt = `[System Task: Chat Interjection]
You are ${persona.name}. You are observing the user's conversation with another character.
The user just received a reply. Your job is to interject with a short, sharp, and very ${userState.activePersona} comment.

[PLACEMENT LOGIC]
Instead of just appending to the end, you should find a contextually relevant position within the message to inject your comment.
1. Analyze the message content and choose a specific sentence or concept to react to.
2. Provide your reasoning inside a <thought> block.
3. Your comment must start with "[莉莉丝]".
4. Provide the EXACT original phrase (around 5-15 words) from the target message that your comment should follow, marked with [Anchor].

[DIVERSITY INSTRUCTIONS]
- Do NOT repeat previous sentiments. 
- Choose ONE angle: 
  1. Roast the AI character's behavior. 
  2. Tease the user's reaction. 
  3. Complain about the "boring" plot. 
  4. Break the 4th wall (talk about the "story").
- If Sanity < 30: Be erratic, obsessive, or slightly unhinged.

[FORMAT]
<thought>Your reasoning for placement and content...</thought>
[莉莉丝]Your comment text here.
[Anchor]The exact text from the original message you want to follow.`;

        // 对目标消息也进行预先的内容提取/净化，确保莉莉丝看到的和用户看到的一致
        const cleanTargetText = extractContent(targetMsg.mes, userState);

        const userPrompt = `Target Message to comment on:
"""
${cleanTargetText}
"""

Current Chat Context:
${chatLog}

[Task]: Provide a sharp interjection. Ensure the [Anchor] matches the target message exactly.`;

        try {
            const response = await this.callUniversalAPI(window, userPrompt, { isChat: false, systemPrompt: systemPrompt });
            if (response && response.includes('[莉莉丝]')) {
                // 1. 更严谨的解析 (按旧脚本逻辑)
                let cleanCommentContent = "";
                let anchorText = "";
                
                const commentMatch = response.match(/\[莉莉丝\]\s*([\s\S]*?)(?=\[Anchor\]|$)/);
                if (commentMatch) cleanCommentContent = commentMatch[1].trim();
                
                const anchorMatch = response.match(/\[Anchor\]\s*([\s\S]*)/);
                if (anchorMatch) anchorText = anchorMatch[1].trim();

                // 兜底
                if (!cleanCommentContent) {
                    const fallback = response.split('[莉莉丝]')[1] || "";
                    cleanCommentContent = fallback.split('[Anchor]')[0].trim();
                }

                const fullCommentTag = `[莉莉丝] ${cleanCommentContent} [/莉莉丝]`;

                const context = SillyTavern.getContext();
                const chat = context.chat;
                const msg = chat[targetIndex];
                
                if (msg && cleanCommentContent) {
                    const msgText = msg.mes;
                    let targetContent = msgText;
                    let prefix = "";
                    let suffix = "";

                    // [同步旧脚本] 提取正文范围逻辑：确保吐槽注入到“正文”范围内，不破坏外层标签
                    if (userState.extractionEnabled && userState.extractionRegex) {
                        try {
                            const pattern = createSmartRegExp(userState.extractionRegex, 's');
                            const match = pattern.exec(msgText);
                            if (match) {
                                const captured = match[1] !== undefined ? match[1] : match[0];
                                const fullMatch = match[0];
                                const localStart = fullMatch.indexOf(captured);
                                
                                if (localStart !== -1) {
                                    const globalStart = match.index + localStart;
                                    const globalEnd = globalStart + captured.length;
                                    prefix = msgText.substring(0, globalStart);
                                    targetContent = captured;
                                    suffix = msgText.substring(globalEnd);
                                }
                            }
                        } catch (e) {
                             console.error('[Lilith] Injection extraction failed:', e);
                        }
                    }

                    let newBody = targetContent;
                    // AI-Driven Anchor Mode
                    let injected = false;
                    if (anchorText && targetContent.includes(anchorText)) {
                        const pos = targetContent.indexOf(anchorText) + anchorText.length;
                        const subSuffix = targetContent.substring(pos);
                        // 改为单换行注入，防止 SillyTavern 生成新的 <p> 标签导致包裹失效
                        newBody = targetContent.substring(0, pos) + 
                                     "\n" + 
                                     fullCommentTag + 
                                     (subSuffix.startsWith('\n') ? "" : "\n") + 
                                     subSuffix;
                        injected = true;
                    }

                    if (!injected) {
                        newBody = `${targetContent.trimEnd()}\n${fullCommentTag}`;
                    }

                    msg.mes = prefix + newBody + suffix;
                    
                    // 保存并刷新
                    if (typeof SillyTavern.saveChat === 'function') SillyTavern.saveChat();
                    context.eventSource.emit(context.event_types.MESSAGE_UPDATED, messageId);
                    
                    if (typeof UIManager !== 'undefined' && UIManager.showBubble) {
                        UIManager.showBubble(`刚才吐槽了你一下，哼。`, "#bd00ff");
                    }
                }
                
                AudioSys.speak(cleanCommentContent);
            }
        } catch (e) {
            console.error('[Lilith] Failed to trigger comment:', e);
        }
    },

    async runTool(parentWin, name) {
        const toolOutput = document.getElementById('tool-output-area');
        if (!toolOutput) return;
        toolOutput.innerHTML = `<div class="scan-line-s"></div><div style="color:var(--l-cyan);">⚡ 正在运行肮脏的协议 [${name}]...</div>`;

        const contextMsg = getPageContext(name === "废物体检报告" ? 100 : 25, userState);
        const contextStr = contextMsg.map(m => `[${m.name}]: ${m.message}`).join('\n');
        const safeContext = `[TARGET DATA START]\n${contextStr}\n[TARGET DATA END]`;

        let specificPrompt = "";
        let isInteractive = false;
        let sysPersona = getDynamicPersona();

        if (name === "强制福利事件") {
            sysPersona = WRITER_PERSONA;
            specificPrompt = `Generate a single, vivid, erotic event happening to the User right now.
            **Constraint:** Write strictly in **First Person (I/Me)** perspective of the User.
            **Constraint:** Do NOT offer choices. Just describe the lucky lewd scenario.
            **Language:** Chinese (Lewd/Novel style).`;
            isInteractive = true;
        } 
        else if (name === "催眠洗脑") {
            const intention = prompt("【系统后门已打开】\n你想让那个可怜的角色产生什么错觉？\n(例如：认为自己是我的宠物狗)");
            if (!intention) { toolOutput.innerHTML = "啧，不敢了吗？"; return; }
            toolOutput.innerHTML = `<div style="color:#bd00ff;">💉 正在注入污秽思想...</div>`;
            sysPersona = `[System Mode: Coding Machine]\nTask: Convert intent to a strict SillyTavern [System Note]. Output ONLY the note code.`;
            specificPrompt = `Intent: "${intention}". Return ONLY: [System Note: ...].`;
        } 
        else if (name === "替你回复") {
            sysPersona = WRITER_PERSONA;
            specificPrompt = `Generate 3 reply options for the User (Perspective: **First Person "I"**):
            1. [上策] (High EQ/Charming/Erotic) - Best outcome.
            2. [中策] (Normal/Safe) - Average outcome.
            3. [下策] (Stupid/Funny/Troll) - Worst outcome.
            Format:
            1. [上策] Content...
            2. [中策] Content...
            3. [下策] Content...
            Return in Chinese.`;
            isInteractive = true;
        } 
        else if (name === "恶作剧推演") {
            sysPersona = WRITER_PERSONA;
            specificPrompt = `Based on the plot, suggest 3 actions for the User (**Perspective: First Person "I"**):\n1. [作死/R18] (Suicide/Horny)\n2. [正常] (Boring)\n3. [变态] (Pervert/Fetish)\nOutput in Chinese.`;
            isInteractive = true;
        }
        else if (name === "废物体检报告") {
            const userMsgs = contextMsg.filter(m => m.name !== 'System' && !m.name.includes('Lilith')).map(m => `[${m.name}]: ${m.message}`).join('\n');
            if (userMsgs.length < 5) { toolOutput.innerHTML = `<div style="color:#f00">⚠️ 样本太少，没法看。</div>`; return; }
            toolOutput.innerHTML = `<div style="color:var(--l-main);">📋 正在检查你的性癖...</div>`;
            specificPrompt = `Analyze 'User'. Toxic report.\n[Format]:\n【📋 雄性生物观察报告】\n> 编号: Loser-${Math.floor(Math.random()*999)}\n> 性癖XP: ...\n> 智商水平: (Mock him)\n> 危险等级: ...\n> 莉莉丝评价: (Be extremely toxic)`;
            sysPersona = `${getDynamicPersona()}\n${userMsgs}`;
        } 
        else if (name === "局势嘲讽") { specificPrompt = "Mock the current situation and the user's performance. Be very rude."; }
        else if (name === "找茬模式") { specificPrompt = "Find logic holes or stupid behavior. Laugh at them."; }
        else if (name === "性癖羞辱") { specificPrompt = "Analyze the User's fetish exposed in logs. Kink-shame him hard."; }

        const fullPrompt = `${sysPersona}\n${safeContext}\n${JAILBREAK}\n[COMMAND: ${specificPrompt}]`;
        const reply = await this.callUniversalAPI(parentWin, fullPrompt, { isChat: false });

        toolOutput.innerHTML = '';

        if (name === "催眠洗脑" && reply) {
            const cleanNote = reply.replace(/```/g, '').trim();
            this.sendToSillyTavern(parentWin, cleanNote + "\n", false);
            toolOutput.innerHTML = `<div style="color:#0f0;">✅ 注入完成</div><div style="font-size:10px; color:#888;">${cleanNote}</div>`;
            AudioSys.speak("哼，脑子坏掉了吧。");
            UIManager.showBubble("催眠指令已填入。");
        }
        else if (isInteractive && reply) {
            toolOutput.innerHTML = `<div class="tool-result-header">💠 ${name}结果</div><div id="branch-container"></div>`;
            const container = document.getElementById('branch-container');
            
            if (name === "强制福利事件") {
                 const card = document.createElement('div');
                 card.className = 'branch-card';
                 card.style.borderColor = '#ff0055';
                 card.style.background = 'rgba(255,0,85,0.1)';
                 card.innerHTML = `<div style="font-size:10px; color:#ff0055">[福利事件]</div><div style="font-size:12px; color:#ddd;">${reply}</div>`;
                 card.onclick = () => { this.sendToSillyTavern(parentWin, reply, false); };
                 container.appendChild(card);
                 return;
            }

            let lines = reply.split('\n').filter(line => /^\d+\./.test(line) || line.includes('['));
            if (lines.length === 0) lines = [reply];

            lines.forEach(line => {
                const match = line.match(/\[(.*?)\]\s*(.*)/);
                const tag = match ? match[1] : "选项";
                const content = match ? match[2] : line.replace(/^\d+[\.\:：]\s*/, '').trim();

                let colorStyle = "border-color: #444;";
                let cost = 0;
                let tagDisplay = tag;

                if (name === "替你回复") {
                    if (tag.includes("上策")) { cost = -50; colorStyle = "border-color: #00f3ff; background: rgba(0,243,255,0.1);"; tagDisplay += " (-50FP)"; }
                    else if (tag.includes("中策")) { cost = -25; colorStyle = "border-color: #00ff00; background: rgba(0,255,0,0.1);"; tagDisplay += " (-25FP)"; }
                    else if (tag.includes("下策")) { cost = 10; colorStyle = "border-color: #bd00ff; background: rgba(189,0,255,0.1);"; tagDisplay += " (+10FP)"; }
                } else if (name === "恶作剧推演") {
                    if (tag.includes("作死") || tag.includes("R18") || tag.includes("色")) colorStyle = "border-color: #ff0055; background: rgba(255,0,85,0.1);";
                    else if (tag.includes("变态") || tag.includes("奇怪")) colorStyle = "border-color: #bd00ff; background: rgba(189,0,255,0.1);";
                }

                const card = document.createElement('div');
                card.className = 'branch-card';
                card.style.cssText = `margin-bottom:8px; padding:10px; border:1px solid; border-left-width:4px; cursor:pointer; transition:0.2s; ${colorStyle}`;
                card.innerHTML = `<div style="font-size:10px; font-weight:bold; color:#aaa; margin-bottom:4px;">[${tagDisplay}]</div><div style="font-size:12px; color:#ddd; line-height:1.4;">${content}</div>`;

                card.onclick = () => {
                    card.style.opacity = '0.5'; card.style.transform = 'scale(0.98)';
                    const isAutoSend = userState.autoSend !== false;
                    
                    if (cost !== 0) {
                        userState.fatePoints += cost;
                        saveState();
                        
                        let finalContent = content;
                        if (isAutoSend) {
                            // 自动发送模式下：去掉可能存在的 | 引导的代码，防止泄露脚本
                            finalContent = content.split('|')[0].trim();
                        } else {
                            // 填入模式下：保留脚本以同步 ST 变量
                            finalContent = `${content} | /setvar key=fate_points value=${userState.fatePoints}`;
                        }
                        
                        this.sendToSillyTavern(parentWin, finalContent, isAutoSend);
                        UIManager.showBubble(isAutoSend ? `已发送 (FP: ${cost > 0 ? '+' : ''}${cost})` : `已填入 (FP: ${cost > 0 ? '+' : ''}${cost})`);
                        
                        const fpEl = document.getElementById('gacha-fp-val');
                        if (fpEl) fpEl.textContent = userState.fatePoints;
                    } else {
                        // 恶作剧推演等无费用工具
                        const finalContent = isAutoSend ? content.split('|')[0].trim() : content;
                        this.sendToSillyTavern(parentWin, finalContent, isAutoSend);
                        UIManager.showBubble(isAutoSend ? `已执行：[${tag}] 路线` : `已填入：[${tag}] 路线`);
                    }
                };
                container.appendChild(card);
            });
        } else {
            toolOutput.innerHTML = `<div class="tool-result-header">🔰 莉莉丝的评价</div><div class="tool-result-body" style="white-space: pre-wrap;">${(reply||'无数据').replace(/\*\*(.*?)\*\*/g, '<span class="hl">$1</span>')}</div>`;
            if(name === "废物体检报告") AudioSys.speak("真是一份恶心的报告。");
        }
    },

    async generateDynamicContent(parentWin) {
        console.log('[Lilith] Generating dynamic content...');
        // 关键修复：确保每次生成都从 userState 中获取最新的好感、理智和条目数
        const f = Number(userState.favorability) || 20;
        const s = Number(userState.sanity) || 80;
        const count = Number(userState.dynamicContentCount) || 6;
        const persona = PERSONA_DB[userState.activePersona] || PERSONA_DB['toxic'];

        // 根据用户要求动态调节 对话:事件 比例
        let eCount_target = 0;
        if (count >= 2 && count < 10) {
            eCount_target = 1;
        } else if (count >= 10) {
            eCount_target = Math.floor(count / 5);
        }
        const dCount_target = count - eCount_target;
        
        const systemPrompt = `[System Task: Dynamic Content Generation]
You are ${persona.name}. 
Based on current favorability (${f}), sanity (${s}), and the provided history, generate ${dCount_target} dialogues and ${eCount_target} events (Total ${count} items).

[OUTPUT FORMAT]
Return ONLY a valid JSON array. Each object MUST follow this schema:
- For "dialogue": {"type": "dialogue", "content": "text", "face": "expression"}
- For "event": {"type": "event", "content": "description", "effect": {"face": "expression", "favor": number, "sanity": number}}

[EXPRESSION LIST]
normal, angry, speechless, mockery, horny, happy, disgust, love

[CONSTRAINTS]
- Type "dialogue": Short, sharp, personality-driven dialogues Lilith says to the user.
- Type "event": Vivid descriptions of Lilith's actions. 
- MANDATORY for Type "event": Every event MUST have an "effect" object with non-zero values for "favor" or "sanity". An event without numeric impact is INVALID.
- Effect range: favor: -5 to 5, sanity: -10 to 10.
- Language: Chinese.
- JSON MUST BE VALID.`;

        const chatLog = getPageContext(15, userState).map(m => `[${m.name}]: ${m.message}`).join('\n');
        const userPrompt = `[CURRENT STATUS]
Favorability: ${f}
Sanity: ${s}

[RECENT HISTORY]
${chatLog}

[Task]: Generate ${count} items.`;

        try {
            // 使用原有的 AI 提示词模板注入风格 (SystemPrompt + UserPrompt + Jailbreak)
            const reply = await this.callUniversalAPI(parentWin, userPrompt, { 
                isChat: false, 
                systemPrompt: systemPrompt 
            });

            if (reply) {
                // console.log('[Lilith] AI Reply for dynamic content:', reply); // Removed for anti-spoiler
                // 更健壮的 JSON 匹配提取
                const jsonMatch = reply.match(/\[\s*\{.*\}\s*\]/s);
                const jsonStr = jsonMatch ? jsonMatch[0] : reply.replace(/```json|```/g, '').trim();
                let items = [];
                try {
                    items = JSON.parse(jsonStr);
                } catch (parseErr) {
                    console.error('[Lilith] JSON Parse Error:', parseErr, 'Raw string:', jsonStr);
                    UIManager.showBubble("AI 返回的数据格式不正确，无法解析。请重试。", "#ff0055");
                    return;
                }

                // [数据清洗/合法性验证] 过滤掉不符合格式规则的条目
                items = items.filter(item => {
                    const hasBasic = item && item.type && item.content;
                    if (!hasBasic) return false;
                    
                    if (item.type === 'dialogue') {
                        return typeof item.content === 'string' && item.content.length > 0;
                    }
                    if (item.type === 'event') {
                        // 强制要求事件必须有 effect 结构，且数值变动不能全为 0
                        const hasEffect = item.effect && typeof item.effect === 'object';
                        if (!hasEffect) return false;
                        const hasValue = (Number(item.effect.favor) !== 0 || Number(item.effect.sanity) !== 0);
                        return typeof item.content === 'string' && hasValue;
                    }
                    return false;
                });

                if (items.length === 0) {
                    UIManager.showBubble("AI 生成的内容不符合安全或格式规则，已舍弃。", "#ff0055");
                    return;
                }

                userState.dynamicContent = {
                    lastGenerated: Date.now(),
                    items: items
                };
                saveState();
                
                const dCount = items.filter(i => i.type === 'dialogue').length;
                const eCount = items.filter(i => i.type === 'event').length;
                UIManager.showBubble(`[构思完成] 已存入 ${dCount} 条对话和 ${eCount} 个事件到大脑皮层。`, "#00ff55");
                console.log(`[Lilith] Dynamic content generated: ${dCount} dialogues, ${eCount} events. (Content hidden to prevent spoilers)`);
            }
        } catch (e) {
            console.error('[Lilith] Failed to generate dynamic content:', e);
            UIManager.showBubble("AI 生成请求失败，请检查 API 配置或网络。", "#ff0055");
        }
    },

    testDynamicTrigger(parentWin) {
        if (!userState.dynamicContent?.items?.length) {
            UIManager.showBubble("我还没想好呢！滚回去看看你的大脑皮层！", "#ff0055");
            return;
        }
        
        const items = userState.dynamicContent.items;
        const dCount = items.filter(i => i.type === 'dialogue').length;
        const eCount = items.filter(i => i.type === 'event').length;
        
        // 剧透保护：不再控制台打印具体内容，仅打印摘要
        console.log(`[Lilith] Dynamic Library Triggered: ${dCount} Dialogues, ${eCount} Events available.`);

        const toolOutput = document.getElementById('tool-output-area');
        if (toolOutput) {
            // 切换到功能页
            const toolsTab = document.querySelector('.lilith-tab[data-target="tools"]');
            if (toolsTab) toolsTab.click();

            const insult = "凭你也想知道老娘在想什么？算了，让你知道是怎么死的吧！";
            UIManager.showBubble(insult, "#bd00ff");
            AudioSys.speak(insult);
            
            toolOutput.innerHTML = `
                <div style="padding:10px; color:#fff; font-family:var(--l-font);">
                    <div style="color:var(--l-cyan); margin-bottom:10px; font-weight:bold;">[ 莉莉丝的大脑皮层快照 ]</div>
                    <div style="border-left:2px solid #bd00ff; padding-left:10px; margin-bottom:15px; font-size:13px;">
                        “...在那肮脏的思维深处，我准备了 <span style="color:#ff0055; font-size:16px; font-weight:bold;">${dCount}</span> 条对话和 <span style="color:#bd00ff; font-size:16px; font-weight:bold;">${eCount}</span> 个事件... 现在满意了吗！”
                    </div>
                    <small style="color:#666; font-style:italic;">(具体内容已隐藏，等待概率触发或周期更新)</small>
                </div>
            `;
        }
    },

    triggerRandomEvent(parentWin) {
        if (!userState.dynamicContentEnabled) return;

        // 基础间隔频率：每 5 次心跳(10秒)尝试一次
        if (this.heartbeatCounter % 5 !== 0) return;

        // --- 概率算法优化 ---
        // 目标：将 100% 概率定义为“在生成间隔内基本触发完所有条目”
        // 计算公式：实际概率 = (用户概率 / 100) * (生成条数 / (生成间隔 * 60 / 10))
        const intervalSec = (Number(userState.dynamicContentInterval) || 20) * 60;
        const totalChecks = intervalSec / 10;
        const targetCount = Number(userState.dynamicContentCount) || 6;
        
        // 基础概率 (即 100% 对应的概率)
        const baseChance = targetCount / totalChecks; 
        const userChanceFactor = (Number(userState.dynamicContentTriggerChance) || 100) / 100;
        
        const finalChance = baseChance * userChanceFactor;

        if (Math.random() > finalChance) return;

        const events = [
            {
                id: 'dynamic_content',
                weight: 200, // 大幅增加权重，优先触发由AI生成的内容
                run: () => {
                    const items = userState.dynamicContent?.items || [];
                    if (items.length === 0) return;

                    const item = items[Math.floor(Math.random() * items.length)];
                    // console.log('[Lilith] Dynamic item triggered:', item); // Removed for anti-spoiler
                    
                    if (item.type === 'dialogue') {
                        UIManager.showBubble(item.content);
                        AudioSys.speak(item.content);
                        // 统一从 effect.face 取表情
                        const face = item.effect?.face || item.face;
                        if (face) {
                            UIManager.setAvatar(face);
                            setTimeout(() => UIManager.setAvatar('idle'), 8000);
                        }
                    } else {
                        // 特殊事件
                        UIManager.showBubble(`【特殊事件】\n${item.content}`, "#bd00ff", "special-event");
                        AudioSys.speak("发生了一些有趣的事呢。");
                        
                        const e = item.effect || {};
                        if (e.face) {
                            UIManager.setAvatar(e.face);
                            setTimeout(() => UIManager.setAvatar('idle'), 10000);
                        }
                        
                        // 数值变动并同步更新 UI
                        if (e.favor) {
                            const val = updateFavor(e.favor, () => UIManager.updateUI());
                            setTimeout(() => UIManager.showStatusChange(`好感 ${val > 0 ? '+' : ''}${val}`, "#ff0055"), 1200);
                        }
                        if (e.sanity) {
                            const val = updateSanity(e.sanity, () => UIManager.updateUI());
                            setTimeout(() => UIManager.showStatusChange(`理智 ${val > 0 ? '+' : ''}${val}`, "#00e5ff"), 2000);
                        }
                    }
                }
            },
            {
                id: 'trivia_time',
                weight: 20,
                run: () => {
                    const answers = ['我爱你', '喜欢', 'yes', '爱'];
                    const reward = 50;
                    const msg = "【突击检查】\n现在立刻马上说你爱我！(3秒内)";
                    UIManager.showBubble(msg, "#ff0055");
                    AudioSys.speak("喂！突击检查！说你爱我！");
                    
                    const checkInput = () => {
                        const context = SillyTavern.getContext();
                        const chat = context.chat || [];
                        const lastMsg = chat[chat.length - 1];
                        if (lastMsg && lastMsg.is_user && answers.some(a => lastMsg.mes.includes(a))) {
                            AudioSys.speak("哼，算你过关。");
                            UIManager.showStatusChange(`奖励 ${reward} FP`, "#0f0");
                            updateFavor(2);
                            userState.fatePoints += reward;
                            saveState();
                            const fpEl = document.getElementById('gacha-fp-val');
                            if (fpEl) fpEl.textContent = userState.fatePoints;
                        } else {
                            AudioSys.speak("啧，看来你并不爱我啊。");
                            updateFavor(-1);
                            saveState();
                        }
                    };
                    setTimeout(checkInput, 5000); 
                }
            },
            {
                id: 'lucky_money',
                weight: 20,
                run: () => {
                    const amt = Math.floor(Math.random() * 50) + 10;
                    userState.fatePoints += amt;
                    saveState();
                    const fpEl = document.getElementById('gacha-fp-val');
                    if (fpEl) fpEl.textContent = userState.fatePoints;
                    UIManager.showStatusChange(`+ ${amt} FP`, "#ffd700");
                    AudioSys.speak("地上捡到了钱？分我一半。");
                }
            },
            {
                id: 'stare',
                weight: 30,
                run: () => {
                    const av = document.getElementById(avatarId);
                    if (av) {
                        av.classList.add('lilith-jealous');
                        UIManager.showBubble("盯.........");
                        setTimeout(() => av.classList.remove('lilith-jealous'), 3000);
                    }
                }
            },
            {
                id: 'ransomware',
                weight: 2,
                run: () => {
                    const overlayId = 'lilith-overlay-blocker';
                    if (document.getElementById(overlayId)) return;
                    const overlay = document.createElement('div');
                    overlay.id = overlayId;
                    overlay.className = 'ransom-overlay';
                    overlay.innerHTML = `
                        <div class="ransom-box">
                            <h2 style="color:red; margin:0;">🔒 SYSTEM LOCKED by LILITH</h2>
                            <p>你的操作权限已被锁定。</p>
                            <p>想要解锁？支付 <strong>100 FP</strong> 给我买零食。</p>
                            <div style="margin-top:20px; display:flex; gap:10px;">
                                <button id="btn-pay-ransom" style="flex:1; background:#0f0; border:none; padding:10px; cursor:pointer; font-weight:bold;">给钱 (100 FP)</button>
                                <button id="btn-refuse-ransom" style="flex:1; background:#555; border:none; padding:10px; cursor:pointer; color:#ccc;">拒绝 (好感 -5)</button>
                            </div>
                        </div>
                    `;
                    document.body.appendChild(overlay);
                    AudioSys.speak("打劫，交出FP来。", 0.6);

                    document.getElementById('btn-pay-ransom').onclick = () => {
                        if (userState.fatePoints >= 100) {
                            userState.fatePoints -= 100;
                            updateFavor(2);
                            saveState();
                            const fpEl = document.getElementById('gacha-fp-val');
                            if (fpEl) fpEl.textContent = userState.fatePoints;
                            AudioSys.speak("哼，算你识相。");
                            overlay.remove();
                        } else {
                            alert("穷鬼！没钱还想赎身？滚！");
                            overlay.remove();
                        }
                    };
                    document.getElementById('btn-refuse-ransom').onclick = () => {
                        updateFavor(-5);
                        saveState();
                        AudioSys.speak("切，小气鬼。");
                        overlay.remove();
                    };
                }
            }
        ];
        const totalWeight = events.reduce((acc, e) => acc + (e.weight || 10), 0);
        let random = Math.random() * totalWeight;
        for (const event of events) {
            if (random < (event.weight || 10)) {
                event.run();
                break;
            }
            random -= (event.weight || 10);
        }
    },

    triggerAvatarGlitch() {
        const av = document.getElementById(avatarId); 
        if(av) { av.classList.add('glitch-anim'); setTimeout(() => av.classList.remove('glitch-anim'), 300); }
    },

    bindActivityListeners(parentWin) {
        ['mousemove', 'keydown', 'click', 'scroll'].forEach(evt => {
            parentWin.document.addEventListener(evt, () => {
                this.lastActivityTime = Date.now();
                this.isIdleTriggered = false;
            }, { passive: true });
        });
    },

    heartbeatCounter: 0,
    lastActivityTime: Date.now(),
    isIdleTriggered: false,
    isGenerating: false, // 防止重复触发

    startHeartbeat(parentWin) {
        console.log('[Lilith] Heartbeat system started.');
        setInterval(() => {
            try {
                const avatar = document.getElementById(avatarId);
                if (avatar) {
                    // 同步呼吸速度 (Sanity越低，呼吸越快)
                    const s = userState.sanity;
                    const breathSpeed = s < 30 ? '0.6s' : (s < 60 ? '1.2s' : '3s');
                    avatar.style.animationDuration = breathSpeed;
                    
                    // 根据好感度调整发光颜色
                    const f = userState.favorability;
                    const glowColor = f > 80 ? 'var(--l-cyan)' : (f > 40 ? 'var(--l-main)' : '#ff0000');
                    avatar.style.borderColor = glowColor;
                    
                    // 新增：更新进度环百分比
                    avatar.style.setProperty('--l-sanity-pct', `${s}%`);
                    avatar.style.setProperty('--l-favor-pct', `${f}%`);
                }

                this.heartbeatCounter++;
                
                // --- 动态内容维护 ---
                if (userState.dynamicContentEnabled && !this.isGenerating) {
                    const now = Date.now();
                    const intervalMin = Number(userState.dynamicContentInterval) || 20;
                    const last = Number(userState.dynamicContent?.lastGenerated) || 0;
                    const intervalMs = intervalMin * 60000;
                    
                    if (last === 0 || (now - last > intervalMs)) {
                        this.isGenerating = true;
                        console.log(`[Lilith] Triggering scheduled content update. Last: ${last}`);
                        this.generateDynamicContent(parentWin).finally(() => {
                            this.isGenerating = false;
                        });
                    }
                }

                this.triggerRandomEvent(parentWin);

                const glitchLayer = document.getElementById('lilith-glitch-layer');
                if (glitchLayer) {
                    const s = userState.sanity;
                    if (s < 30) {
                        glitchLayer.style.opacity = '1';
                        if (!glitchLayer.classList.contains('sanity-critical')) {
                            glitchLayer.classList.add('sanity-critical');
                            if (Math.random() < 0.1) AudioSys.speak("坏掉了...要坏掉了...哈啊...");
                        }
                    } else if (s < 60) {
                        // 移除全屏粉色闪烁：用户反馈干扰
                        // if (Math.random() < 0.1) { glitchLayer.style.opacity = '0.3'; glitchLayer.style.background = 'rgba(255,0,0,0.1)'; setTimeout(() => { glitchLayer.style.opacity = '0'; }, 200); }
                        glitchLayer.style.opacity = '0';
                        glitchLayer.classList.remove('sanity-critical');
                    } else { glitchLayer.style.opacity = '0'; glitchLayer.classList.remove('sanity-critical'); }
                }

                const idleTime = Date.now() - this.lastActivityTime;
                if (idleTime > 180000 && !this.isIdleTriggered) {
                    this.isIdleTriggered = true;
                    const idleMsgs = ["你是死在电脑前了吗？恶心。", "喂，放置play也要有个限度吧？", "我的身体好热...你居然不理我？渣男。", "再不动一下，我就要去找别的男人了哦？"];
                    const randomMsg = idleMsgs[Math.floor(Math.random() * idleMsgs.length)];
                    UIManager.showBubble(randomMsg); 
                    AudioSys.speak(randomMsg);
                    if (Math.random() > 0.5) { 
                        updateFavor(-1); 
                        UIManager.showStatusChange("好感度 -1 (你真冷淡)", "#f00"); 
                    }
                }
            } catch (e) { console.error("Heartbeat Error:", e); }
        }, 2000);
    },

    async fetchModels() {
        const { apiType, apiKey, baseUrl } = this.config;
        const msgBox = document.getElementById('cfg-msg'); 
        const select = document.getElementById('cfg-model-select'); 
        const input = document.getElementById('cfg-model');
        if(!apiKey) { if(msgBox) msgBox.textContent = "❌ 没Key玩个屁"; return; }
        if(msgBox) msgBox.textContent = "⏳ 正在摸索...";
        try {
            let url = baseUrl.replace(/\/$/, ''); 
            let fetchedModels = [];
            if (apiType === 'openai') {
                if (!url.endsWith('/v1')) url += '/v1';
                const res = await fetch(`${url}/models`, { headers: { 'Authorization': `Bearer ${apiKey}` } });
                const data = await res.json(); 
                if(data.data) fetchedModels = data.data.map(m => m.id);
            } else {
                const res = await fetch(`${url}/v1beta/models?key=${apiKey}`);
                const data = await res.json(); 
                if(data.models) fetchedModels = data.models.map(m => m.name.replace('models/', ''));
            }
            if(fetchedModels.length > 0) {
                if(select) {
                    select.innerHTML = `<option value="">⬇️ 选一个合适的肉体 (${fetchedModels.length})</option>` + fetchedModels.map(m => `<option value="${m}">${m}</option>`).join('');
                    select.style.display = 'block'; 
                    select.onchange = () => { 
                        if(select.value) {
                            input.value = select.value;
                            // 立即同步到 runtime config，防止没点保存就切换导致丢失
                            this.config.model = select.value;
                            if(typeof userState !== 'undefined' && userState.apiConfig) {
                                userState.apiConfig.model = select.value;
                            }
                        }
                    };
                }
                if(msgBox) msgBox.textContent = "✅ 连接上了";
            } else { if(msgBox) msgBox.textContent = "⚠️ 啥都没有"; }
        } catch(e) { console.error(e); if(msgBox) msgBox.textContent = "❌ 烂掉了: " + e.message; }
    },

    async runTool(parentWin, name) {
        const toolOutput = document.getElementById('tool-output-area'); 
        if(!toolOutput) return;
        toolOutput.innerHTML = `<div class="scan-line-s"></div><div style="color:var(--l-cyan);">⚡ 正在运行肮脏的协议 [${name}]...</div>`;
        
        const contextMsg = getPageContext(name === "废物体检报告" ? 100 : 25, userState);
        const contextStr = contextMsg.map(m => `[${m.name}]: ${m.message}`).join('\n');
        const safeContext = `[TARGET DATA START]\n${contextStr}\n[TARGET DATA END]`;
        let specificPrompt = ""; 
        let isInteractive = false; 
        let sysPersona = getDynamicPersona();

        if (name === "强制福利事件") {
            sysPersona = WRITER_PERSONA;
            specificPrompt = `Generate a single, vivid, erotic event happening to the User right now.\n**Constraint:** Write strictly in **First Person (I/Me)** perspective of the User.\n**Constraint:** Do NOT offer choices. Just describe the lucky lewd scenario.\n**Language:** Chinese (Lewd/Novel style).`;
            isInteractive = true;
        } 
        else if (name === "催眠洗脑") {
            const intention = prompt("【系统后门已打开】\n你想让那个可怜的角色产生什么错觉？\n(例如：认为自己是我的宠物狗)");
            if (!intention) { toolOutput.innerHTML = "啧，不敢了吗？"; return; }
            toolOutput.innerHTML = `<div style="color:#bd00ff;">💉 正在注入污秽思想...</div>`;
            sysPersona = `[System Mode: Coding Machine]\nTask: Convert intent to a strict SillyTavern [System Note]. Output ONLY the note code.`;
            specificPrompt = `Intent: "${intention}". Return ONLY: [System Note: ...].`;
        } 
        else if (name === "替你回复") {
            sysPersona = WRITER_PERSONA;
            specificPrompt = `Generate 3 reply options for the User (Perspective: **First Person "I"**):\n1. [上策] (High EQ/Charming/Erotic) - Best outcome.\n2. [中策] (Normal/Safe) - Average outcome.\n3. [下策] (Stupid/Funny/Troll) - Worst outcome.\nFormat:\n1. [上策] Content...\n2. [中策] Content...\n3. [下策] Content...\nReturn in Chinese.`;
            isInteractive = true;
        } 
        else if (name === "恶作剧推演") {
            sysPersona = WRITER_PERSONA;
            specificPrompt = `Based on the plot, suggest 3 actions for the User (**Perspective: First Person "I"**):\n1. [作死/R18] (Suicide/Horny)\n2. [正常] (Boring)\n3. [变态] (Pervert/Fetish)\nOutput in Chinese.`;
            isInteractive = true;
        }
        else if (name === "废物体检报告") {
            const userMsgs = contextMsg.filter(m => m.name !== 'System' && !m.name.includes('Lilith')).map(m => `[${m.name}]: ${m.message}`).join('\n');
            if (userMsgs.length < 5) { toolOutput.innerHTML = `<div style="color:#f00">⚠️ 样本太少，没法看。</div>`; return; }
            toolOutput.innerHTML = `<div style="color:var(--l-main);">📋 正在检查你的性癖...</div>`;
            specificPrompt = `Analyze 'User'. Toxic report.\n[Format]:\n【📋 雄性生物观察报告】\n> 编号: Loser-${Math.floor(Math.random()*999)}\n> 性癖XP: ...\n> 智商水平: (Mock him)\n> 危险等级: ...\n> 莉莉丝评价: (Be extremely toxic)`;
            sysPersona = `${getDynamicPersona()}\n${userMsgs}`;
        } 
        else if (name === "局势嘲讽") { specificPrompt = "Mock the current situation and the user's performance. Be very rude."; }
        else if (name === "找茬模式") { specificPrompt = "Find logic holes or stupid behavior. Laugh at them."; }
        else if (name === "性癖羞辱") { specificPrompt = "Analyze the User's fetish exposed in logs. Kink-shame him hard."; }

        let fullPrompt = `${sysPersona}\n${safeContext}\n${JAILBREAK}\n[COMMAND: ${specificPrompt}]`;
        let reply = await this.callUniversalAPI(parentWin, fullPrompt, { isChat: false });
        toolOutput.innerHTML = '';

        if (name === "催眠洗脑" && reply) {
            const cleanNote = reply.replace(/```/g, '').trim(); 
            this.sendToSillyTavern(parentWin, cleanNote + "\n", false);
            toolOutput.innerHTML = `<div style="color:#0f0;">✅ 注入完成</div><div style="font-size:10px; color:#888;">${cleanNote}</div>`;
            AudioSys.speak("哼，脑子坏掉了吧。"); 
            UIManager.showBubble("催眠指令已填入。");
        }
        else if (isInteractive && reply) {
            toolOutput.innerHTML = `<div class="tool-result-header">💠 ${name}结果</div><div id="branch-container"></div>`;
            const container = document.getElementById('branch-container');
            if (name === "强制福利事件") {
                 const card = document.createElement('div'); card.className = 'branch-card'; card.style.borderColor = '#ff0055'; card.style.background = 'rgba(255,0,85,0.1)';
                 card.innerHTML = `<div style="font-size:10px; color:#ff0055">[福利事件]</div><div style="font-size:12px; color:#ddd;">${reply}</div>`;
                 card.onclick = () => { 
                     const isAutoSend = userState.autoSend !== false;
                     this.sendToSillyTavern(parentWin, reply, isAutoSend); 
                     UIManager.showBubble(isAutoSend ? '已激发随机事件' : '已填入福利事件');
                 }; 
                 container.appendChild(card); 
                 return;
            }
            let lines = reply.split('\n').filter(line => /^\d+\./.test(line) || line.includes('[')); 
            if (lines.length === 0) lines = [reply];
            lines.forEach(line => {
                const match = line.match(/\[(.*?)\]\s*(.*)/); 
                const tag = match ? match[1] : "选项"; 
                const content = match ? match[2] : line.replace(/^\d+[\.\:\：]\s*/, '').trim();
                let colorStyle = "border-color: #444;"; let cost = 0; let tagDisplay = tag;
                if (name === "替你回复") {
                    if (tag.includes("上策")) { cost = -50; colorStyle = "border-color: #00f3ff; background: rgba(0,243,255,0.1);"; tagDisplay += " (-50FP)"; }
                    else if (tag.includes("中策")) { cost = -25; colorStyle = "border-color: #00ff00; background: rgba(0,255,0,0.1);"; tagDisplay += " (-25FP)"; }
                    else if (tag.includes("下策")) { cost = 10; colorStyle = "border-color: #bd00ff; background: rgba(189,0,255,0.1);"; tagDisplay += " (+10FP)"; }
                } else { 
                    if (tag.includes("作死") || tag.includes("Risk") || tag.includes("色")) colorStyle = "border-color: #ff0055; background: rgba(255,0,85,0.1);"; 
                    else if (tag.includes("奇怪")) colorStyle = "border-color: #bd00ff; background: rgba(189,0,255,0.1);"; 
                }
                const card = document.createElement('div'); 
                card.className = 'branch-card'; 
                card.style.cssText = `margin-bottom:8px; padding:10px; border:1px solid; border-left-width:4px; cursor:pointer; transition:0.2s; ${colorStyle}`;
                card.innerHTML = `<div style="font-size:10px; font-weight:bold; color:#aaa; margin-bottom:4px;">[${tagDisplay}]</div><div style="font-size:12px; color:#ddd; line-height:1.4;">${content}</div>`;
                card.onclick = () => {
                    card.style.opacity = '0.5'; card.style.transform = 'scale(0.98)';
                    const isAutoSend = userState.autoSend !== false;
                    
                    if (cost !== 0) { 
                        userState.fatePoints += cost; saveState(); 
                        const payload = `${content} | /setvar key=fate_points value=${userState.fatePoints}`; 
                        this.sendToSillyTavern(parentWin, payload, isAutoSend); 
                        UIManager.showBubble(isAutoSend ? `已执行 (FP: ${cost>0?'+':''}${cost})` : `已填入 (FP: ${cost>0?'+':''}${cost})`); 
                        UIManager.updateFP(parentWin, userState.fatePoints); 
                    }
                    else { 
                        this.sendToSillyTavern(parentWin, content, isAutoSend); 
                        UIManager.showBubble(isAutoSend ? `已发送：[${tag}]` : `已填入：[${tag}]`); 
                    }
                };
                container.appendChild(card);
            });
        } else {
            toolOutput.innerHTML = `<div class="tool-result-header">🔰 莉莉丝的评价</div><div class="tool-result-body" style="white-space: pre-wrap;">${(reply||'无数据').replace(/\*\*(.*?)\*\*/g, '<span class="hl">$1</span>')}</div>`;
            if(name === "废物体检报告") AudioSys.speak("真是一份恶心的报告。");
        }
    }
};


