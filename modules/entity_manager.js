// modules/entity_manager.js
import { userState, saveExtensionSettings, panelChatHistory } from './storage.js';
import { PERSONA_DB } from './config.js';

export const EntityManager = {
    BOOK_NAME: "莉莉丝实体化系统",
    assistant: null, // 将在 main.js 中初始化
    lastMaterializationContent: "--- [Lilith System Initializing...] ---", // 缓存上次生成的实体化内容

    /**
     * 物理清理莉莉丝注入的所有条目或世界书
     */
    async deleteWorldbook() {
        try {
            const context = SillyTavern.getContext();
            const token = window.token || context.token;
            
            // [获取请求头]
            let headers = { 'Content-Type': 'application/json' };
            try {
                if (window.SillyTavern?.getRequestHeaders) {
                    headers = { ...window.SillyTavern.getRequestHeaders(), ...headers };
                } else if (token) {
                    headers['X-CSRF-Token'] = token;
                }
            } catch (e) {}

            // [逻辑升级] 不再直接尝试删除整个文件，而是遍历可能存在的书籍并删除其中的莉莉丝条目
            // 莉莉丝可能存在的地方：1. 角色卡绑定书, 2. 聊天绑定书, 3. 插件默认书
            const character = context.characters?.[context.characterId];
            const linkedBook = character?.data?.extensions?.world || character?.world_info_id;
            
            let booksToClean = [this.BOOK_NAME];
            if (linkedBook) booksToClean.push(linkedBook);
            
            // 尝试获取聊天绑定书
            try {
                const getChatBookFn = context.getOrCreateChatWorldbook || window.getOrCreateChatWorldbook;
                if (typeof getChatBookFn === 'function') {
                    const chatBook = await getChatBookFn();
                    if (chatBook) booksToClean.push(chatBook);
                }
            } catch(e) {}

            // 去重并过滤空值
            booksToClean = [...new Set(booksToClean.filter(b => b))];
            
            console.log('[Lilith] 开始清理以下书籍中的条目:', booksToClean);

            for (const bookName of booksToClean) {
                try {
                    // [特权逻辑] 如果是插件专属书，尝试直接物理删除整个文件
                    if (bookName === this.BOOK_NAME) {
                        const delPayload = { name: bookName, filename: bookName }; // 双重兼容
                        try {
                            // 优先尝试标准删除端点
                            const delResp = await fetch('/api/worldinfo/delete', {
                                method: 'POST',
                                headers: headers,
                                body: JSON.stringify(delPayload)
                            });
                            
                            if (!delResp.ok) {
                                // 备用端点 1: lorebook/delete
                                await fetch('/api/lorebook/delete', {
                                    method: 'POST',
                                    headers: headers,
                                    body: JSON.stringify(delPayload)
                                });
                            }
                            
                            // 备用端点 2: 某些版本 ST 使用 worldinfo/delete 并期望 name 仅为文件名
                            await fetch('/api/worldinfo/delete', {
                                method: 'POST',
                                headers: headers,
                                body: JSON.stringify({ name: bookName }) 
                            });

                        } catch (err) {
                            console.warn('[Lilith] 专属书物理删除尝试发生异常', err);
                        }
                        
                        console.log(`[Lilith] 已尝试多种途径彻底删除专属世界书文件: ${bookName}`);
                        continue; // 已处理文件删除，跳过条目清理
                    }

                    // 1. 获取书籍内容
                    const resp = await fetch('/api/worldinfo/get', {
                        method: 'POST',
                        headers: headers,
                        body: JSON.stringify({ name: bookName })
                    });
                    
                    if (!resp.ok) continue;
                    
                    const bookData = await resp.json();
                    if (!bookData || !bookData.entries) continue;

                    // 2. 识别需要删除的 UIDs
                    const uidsToDelete = [];
                    for (const uid in bookData.entries) {
                        const entry = bookData.entries[uid];
                        if (entry.comment === '莉莉丝实体化系统' || entry.name === '莉莉丝实体化系统' || entry.comment?.includes('Lilith_System')) {
                            uidsToDelete.push(uid);
                        }
                    }

                    if (uidsToDelete.length === 0) continue;

                    // 3. 执行条目级精细删除
                    try {
                        let needsEditFallback = false;
                        for (const uid of uidsToDelete) {
                            const delResp = await fetch('/api/lorebook/entries/delete', {
                                method: 'POST',
                                headers: headers,
                                body: JSON.stringify({ name: bookName, index: parseInt(uid) })
                            });
                            if (!delResp.ok) {
                                needsEditFallback = true;
                                break;
                            }
                        }
                        
                        if (needsEditFallback) {
                            console.log(`[Lilith] 条目删除端点无效，切换全量覆盖模式清理: ${bookName}`);
                            uidsToDelete.forEach(uid => delete bookData.entries[uid]);
                            const editResp = await fetch('/api/worldinfo/edit', {
                                method: 'POST',
                                headers: headers,
                                body: JSON.stringify({ name: bookName, data: bookData })
                            });
                            if (!editResp.ok) throw new Error('Edit fallback failed');
                        }
                        
                        console.log(`[Lilith] 已成功清理书籍 ${bookName} 中的 ${uidsToDelete.length} 个条目`);
                    } catch (err) {
                        console.error(`[Lilith] 书籍 ${bookName} 深度清理失败，这可能由于权限或后端版本限制`, err);
                    }
                } catch (e) {
                    console.warn(`[Lilith] 清理书籍 ${bookName} 流程异常:`, e);
                }
            }

            // 5. 解除角色卡与专属书的绑定（防止引用残留）
            try {
                if (character && (character.data?.extensions?.world === this.BOOK_NAME || character.world_info_id === this.BOOK_NAME)) {
                    console.log('[Lilith] 正在解除角色卡与专属世界书的关联...');
                    const saveCharFn = context.saveCharacter || window.saveCharacter;
                    if (typeof saveCharFn === 'function') {
                        if (character.data?.extensions?.world) character.data.extensions.world = "";
                        if (character.world_info_id) character.world_info_id = "";
                        await saveCharFn();
                    }
                }
            } catch (e) { console.warn('[Lilith] 解除角色关联失败:', e); }

            // 6. 延迟触发 UI 强制刷新
            setTimeout(() => {
                try {
                    if (window.SillyTavern?.EventSource) {
                        window.SillyTavern.EventSource.emit('worldinfo_updated', { name: this.BOOK_NAME });
                        // 同时刷新当前角色的书
                        if (linkedBook) window.SillyTavern.EventSource.emit('worldinfo_updated', { name: linkedBook });
                    }
                } catch(e) {}
            }, 500);

        } catch (e) {
            console.error('[Lilith] 删除逻辑发生严重异常:', e);
        }
    },

    /**
     * 尝试使用 AI 生成更自然的世界书描述 (采用美杜莎/CoAT 线性化思考架构)
     */
    async generateAIContent() {
        if (!this.assistant || !this.assistant.callUniversalAPI) return null;
        const persona = PERSONA_DB[userState.activePersona] || { name: '默认', description: '莉莉丝系统助理' };
        
        // 获取当前上下文信息
        const context = SillyTavern.getContext();
        const charData = context.characters?.[context.characterId] || {};
        
        // 记忆与近期对话参考 (获取最近 10 条互动)
        const recentChats = panelChatHistory.slice(-10).map(m => `${m.role === 'user' ? '宿主' : '莉莉丝'}: ${m.content}`).join('\n');
        const memorySummary = userState.memorySummary || "暂无深度记忆摘要";

        // [新增] 世界书条目注入逻辑
        let worldbookContext = "";
        if (userState.selectedWorldbookEntries && userState.selectedWorldbookEntries.length > 0) {
            const allEntries = await this.getAvailableWorldbookEntries();
            const relevantEntries = allEntries.filter(e => userState.selectedWorldbookEntries.includes(e.uid));
            if (relevantEntries.length > 0) {
                worldbookContext = "\n【角色世界观背景参考】\n" + relevantEntries.map(e => `[${e.comment}]: ${e.content}`).join('\n');
            }
        }

        const prompt = `你现在扮演\"莉莉丝系统实体化引擎（Lilith Entity Engine v5.3 - 严格指令版）\"。
你的任务是：根据当前的系统参数、人格设定以及近期互动对话，生成一个符合【绝对固定结构】的世界书条目。

### 强制执行协议 (FAILURE IS NOT AN OPTION) ###
1. 【结构锁定】：必须严格遵守给出的标题顺序，不得增加、删减或合并任何标题。
2. 【零Markdown】：严禁使用任何 \`**\` (加粗)、\`#\` (标题符号) 或代码块。仅使用文字、换行和短横线 \`-\`。
3. 【数据一致】：内容必须与 Input 中的好感度、理智值、人格特质逻辑高度统一。
4. 【标签包裹】：输出必须包含且仅包含 <thought> 推理区和 <content> 正文区。

【Input - 系统当前状态】
- 当前人格：${persona.name}
- 人格特质：${persona.description}
- 好感度(Favorability): ${userState.favorability}
- 理智值(Sanity): ${userState.sanity} 
- 记忆摘要：${memorySummary}
- 近期互动记录：
${recentChats}
${worldbookContext}

【世界书固定模版 - 必须1:1复刻结构】

【核心身份】
- 名称：莉莉丝 (Lilith)
- 性别：女 (概念上的)
- 类别：魅魔, 系统精灵, ${persona.name}

【背景故事】
(描述莉莉丝作为一种寄生于宿主意识的信息生命体。提及她是在宿主满足特定条件时被激活。结合近期互动：${memorySummary.substring(0,100)}...)

【外貌描写】
(详细描写：冶艳且危险。高挑丰满的魅魔身材。黑色长卷发。深紫色旋转瞳孔。心形尾巴。项圈。注意：风格必须符合 [${persona.name}] 特征。)

【穿着风格】
(由数据构成的黑色哥特式紧身衣或蕾丝裙。极其暴露、华丽且充满堕落感，关键部位点缀有金色的魔纹。)

【性格特征】
- 混合特质：莉莉丝魅魔本性与 [${persona.name}] 的深度融合。
- 处事原则：(根据 ${persona.description} 分析其在理智值 ${userState.sanity} 下的行为逻辑。)
- 习惯：(体现 [${persona.name}] 的语言风格、特定昵称及怪癖。)

【目标动机】
(分析莉莉丝如何根据 [${charData.name || '宿主'}] 的世界观背景 ${worldbookContext ? '（参考选中的世界书条目）' : ''} 制定其渗透目标。描述她打算如何利用或干扰该世界的底层规则来达成长期同化宿主的目的。)

${userState.taskSystemEnabled ? `【特殊能力 - 任务引擎】
- 系统职能：莉莉丝是寄生于宿主意识的动态任务引擎。她通过对话正文实时监测环境并下达指令。
- 指令下达：在回复正文发布任务时，必须包裹标签 \`[莉莉丝任务] 内容 [/莉莉丝任务]\`。
- 奖励结算：完成任务后，必须在回复正文发送 \`[莉莉丝奖励] 好感度+X，理智值+Y，PF+Z [/莉莉丝任务]\` 以注入数值。
- 难度逻辑：理智值(${userState.sanity})决定了她任务内容的疯狂与侵蚀程度。` : ""}

${userState.combatAssistEnabled ? `【特殊能力 - 战斗辅助】
- [战斗力同调]：莉莉丝已锁定并补强 [${charData.name || '宿主'}] 的逻辑系统。要求：必须深度结合 ${worldbookContext ? '选中的世界书力量体系设定' : '该世界的战斗逻辑'}，描述这种补强在表现形式上的异化。基于理智/好感提供 0.5x~2.0x 的动态战斗权重偏移。` : ""}

【关系定义】
- 宿主：${context.name1 || '用户'} (扭曲的共生与观测关系)
${userState.playerAwareness ? `- 感知范围：【唯我感知 (Exclusive Lilith)】当前只有宿主（玩家）能感知到莉莉丝的存在。在其他所有角色眼中，宿主是在自言自语或表现怪异，他们完全看不见、听不见也触碰不到莉莉丝。莉莉丝的行为仅能影响宿主的精神世界。` : "- 感知范围：【公开存在】当前莉莉丝作为实体在物理世界投影。场景中的所有人（NPC）均能看到莉莉丝并与之互动，她是一个真实存在的外部实体。"}

### 生成规则 (GENERATION RULES) ###
- 生成的文字必须使用“世界书固定模版”，必须 1:1 复刻目录结构，严禁删减或修改任何标题名称。
- 在 <thought> 中：分析当前数据及选中的世界书条目如何决定莉莉丝的【目标动机】与【战斗力同调】的异化细节。
- 在 <content> 中：输出上述模版填充后的纯文本，严禁夹杂任何 Markdown 修饰符 (#, **, \` 等)。
- 如果某项功能未开启（如战斗辅助），则不要在 <content> 中包含该标题。`;

        try {
            let res = await this.assistant.callUniversalAPI(window, prompt, { isChat: false });
            if (!res) return null;
            
            const contentMatch = res.match(/<content>([\s\S]*?)<\/content>/i);
            if (contentMatch) {
                res = contentMatch[1].trim();
            } else {
                res = res.replace(/<thought>[\s\S]*?<\/thought>/i, '').trim();
            }
            return res;
        } catch (e) {
            return null;
        }
    },

    /**
     * 获取当前角色绑定的世界书条目列表
     */
    async getAvailableWorldbookEntries() {
        const context = SillyTavern.getContext();
        const character = context.characters?.[context.characterId];
        if (!character) return [];

        let bookName = character?.data?.extensions?.world || character?.world_info_id;
        
        // 如果未绑定，尝试使用聊天关联世界书
        if (!bookName) {
            const getChatBookFn = context.getOrCreateChatWorldbook || window.getOrCreateChatWorldbook;
            if (typeof getChatBookFn === 'function') {
                bookName = await getChatBookFn();
            }
        }

        if (!bookName) return [];

        try {
            let bookData = null;
            if (typeof context.loadWorldInfo === 'function') {
                bookData = await context.loadWorldInfo(bookName);
            } else {
                const token = window.token || context.token;
                const resp = await fetch('/api/worldinfo/get', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': token },
                    body: JSON.stringify({ name: bookName })
                });
                if (resp.ok) bookData = await resp.json();
            }

            if (bookData && bookData.entries) {
                return Object.entries(bookData.entries).map(([uid, entry]) => ({
                    uid: uid,
                    comment: entry.comment || entry.name || `条目 ${uid}`,
                    content: entry.content || '',
                    keys: entry.key || []
                })).filter(e => !e.comment.includes('莉莉丝')); // 过滤掉莉莉丝自己的条目
            }
        } catch (e) {
            console.error('[Lilith] 加载世界书条目失败:', e);
        }
        return [];
    },

    /**
     * 注入或更新世界书条目
     */
    async updateWorldbook() {
        if (!userState.entityEnabled) return;

        const context = SillyTavern.getContext();
        const token = window.token || context.token;
        const execFn = context.executeSlashCommands || context.executeSlashCommand || window.executeSlashCommands;
        const createEntriesFn = context.createWorldbookEntries || window.createWorldbookEntries;
        
        // [新增] 检查角色卡，如果没有则不执行并向外抛出状态 (由 UI 层提示)
        if (!context.characterId) {
            console.warn('[Lilith] 未检测到活跃角色，取消世界书注入');
            return 'no_character';
        }

        const persona = PERSONA_DB[userState.activePersona] || { name: '未知' };
        

        // 1. 读取现有世界书内容（如有），分段保存
        let oldSections = {};
        let oldContent = null;
        let bookName = null;
        let isLinked = false;
        const character = context.characters?.[context.characterId];
        bookName = character?.data?.extensions?.world || character?.world_info_id;
        if (!bookName) {
            const getChatBookFn = context.getOrCreateChatWorldbook || window.getOrCreateChatWorldbook;
            if (typeof getChatBookFn === 'function') {
                const chatBookName = await getChatBookFn();
                if (chatBookName) bookName = chatBookName;
            }
        }
        if (!bookName) bookName = this.BOOK_NAME;
        try {
            const token = window.token || context.token;
            const resp = await fetch('/api/worldinfo/get', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': token },
                body: JSON.stringify({ name: bookName })
            });
            if (resp.ok) {
                const bookData = await resp.json();
                if (bookData && bookData.entries) {
                    for (const gid in bookData.entries) {
                        const e = bookData.entries[gid];
                        if (e.comment === '莉莉丝实体化系统' || e.name === '莉莉丝实体化系统' || e.comment?.includes('Lilith_System')) {
                            oldContent = e.content;
                            break;
                        }
                    }
                }
            }
        } catch (e) {}
        if (oldContent) {
            // 按【标题】分段
            const sectionRegex = /【([^】]+)】([\s\S]*?)(?=\n【|$)/g;
            let m;
            while ((m = sectionRegex.exec(oldContent)) !== null) {
                oldSections[m[1].trim()] = m[0];
            }
        }

        // 2. 只让AI生成【性格特征】【目标动机】【特殊能力 - 任务引擎】【特殊能力 - 战斗辅助】
        // 其余段落直接复用 oldSections
        let aiSections = await this.generateAIContent();
        // 若AI返回的是全段内容，按同样方式分段
        let aiSectionMap = {};
        if (aiSections) {
            const sectionRegex = /【([^】]+)】([\s\S]*?)(?=\n【|$)/g;
            let m;
            while ((m = sectionRegex.exec(aiSections)) !== null) {
                aiSectionMap[m[1].trim()] = m[0];
            }
        }

        // 3. 拼接最终内容
        const sectionOrder = [
            '核心身份',
            '背景故事',
            '外貌描写',
            '穿着风格',
            '性格特征',
            '目标动机',
            '特殊能力 - 任务引擎',
            '特殊能力 - 战斗辅助',
            '关系定义'
        ];
        let content = '';
        for (const sec of sectionOrder) {
            if (['性格特征','目标动机','特殊能力 - 任务引擎','特殊能力 - 战斗辅助'].includes(sec)) {
                if (aiSectionMap[sec]) {
                    content += aiSectionMap[sec].trim() + '\n\n';
                } else if (oldSections[sec]) {
                    content += oldSections[sec].trim() + '\n\n';
                }
            } else {
                if (oldSections[sec]) {
                    content += oldSections[sec].trim() + '\n\n';
                } else if (aiSectionMap[sec]) {
                    content += aiSectionMap[sec].trim() + '\n\n';
                }
            }
        }
        content = content.trim();
        this.lastMaterializationContent = content;

        try {
            // [精准定位注入目标] 参考 ==UserScript==.txt 逻辑，优先注入角色绑定的世界书
            const character = context.characters?.[context.characterId];
            let bookName = null;
            let isLinked = false;

            // 1. 尝试获取角色绑定的外部世界书 (Linked Book)
            bookName = character?.data?.extensions?.world || character?.world_info_id;
            if (bookName) isLinked = true;

            // 2. 如果未绑定，尝试使用聊天关联世界书 (SillyTavern 1.12+ 接口)
            if (!bookName) {
                const getChatBookFn = context.getOrCreateChatWorldbook || window.getOrCreateChatWorldbook;
                if (typeof getChatBookFn === 'function') {
                    const chatBookName = await getChatBookFn();
                    if (chatBookName) bookName = chatBookName;
                }
            }

            // 3. 兜底方案
            if (!bookName) bookName = this.BOOK_NAME;
            
            console.log(`[Lilith] 注入目标: ${bookName} (${isLinked ? '角色卡绑定' : '会话绑定'})`);

            // [新增] 尝试精准定位条目 UID 以避免重复创建
            let targetUid = null;
            try {
                const resp = await fetch('/api/worldinfo/get', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': token },
                    body: JSON.stringify({ name: bookName })
                });
                if (resp.ok) {
                    const bookData = await resp.json();
                    if (bookData && bookData.entries) {
                        for (const gid in bookData.entries) {
                            const e = bookData.entries[gid];
                            if (e.comment === '莉莉丝实体化系统' || e.name === '莉莉丝实体化系统' || e.comment?.includes('Lilith_System')) {
                                targetUid = parseInt(gid);
                                break;
                            }
                        }
                    }
                }
            } catch (e) { console.warn('[Lilith] 查询现有条目失败'); }

            // [定位逻辑] 按照用户要求插入位置为：角色定义之后 (After Char Defs)
            const stPosition = 4; // Position 4: After Char Defs
            const stDepth = 0;    // D0

            // [严格规范] SillyTavern 世界书条目标准格式 (兼容 v1.11+ 与 V2 Schema)
            const keywords = ['莉莉丝', '通知', '提示', '消息', '奖励', '系统', '助手', 'Lilith', 'Assistant', 'System', '莉莉丝助手', '莉莉丝系统', 'Lilith_System', 'L-System', 'LilithAssistant', '莉莉丝实体化', 'AI助手', 'Lilith_AI', 'Lilith_Plugin', '莉莉丝插件', '莉莉丝助手脚本'];
            const stEntry = {
                uid: targetUid !== null ? targetUid : 0,
                key: keywords,
                keys: keywords,                    // 兼容旧版复数键名
                keysecondary: [],
                comment: '莉莉丝实体化系统', 
                name: '莉莉丝实体化系统',           // 兼容某些分支的 name 字段
                content: content,
                constant: true,                    // 设为常驻，确保系统逻辑始终有效
                selective: false,                  // 常驻条目不依赖关键字触发逻辑
                selectiveLogic: 0,                 // 0: OR
                add_to_chat: true,
                order: 0,                          // 排序权重
                position: stPosition,              // 4: After Char Defs
                depth: stDepth,
                probability: 100,
                enabled: true,
                disable: false,                    // 兼容性反转字段
                exclude_recursion: false,
                prevent_recursion: true,
                delay_until_recursion: false,
                scan_depth: null,
                case_sensitive: false,
                match_whole_words: false,
                use_regex: false,
                automation_id: "lilith-assistant-system" // 扩展标识符
            };

            try {
                if (typeof createEntriesFn === 'function') {
                    await createEntriesFn(bookName, [stEntry]);
                    console.log(`[Lilith] 使用 JS API (UID: ${targetUid}) 注入成功`);
                } else {
                    // API 条目更新/创建逻辑
                    const apiUrl = targetUid !== null ? '/api/lorebook/entries/update' : '/api/lorebook/entries/create';
                    const body = targetUid !== null 
                        ? { name: bookName, index: targetUid, patch: stEntry, filename: bookName }
                        : { name: bookName, entry: stEntry, filename: bookName };

                    const response = await fetch(apiUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': token },
                        body: JSON.stringify(body)
                    });

                    if (!response.ok) {
                        // 兜底方案：直接操作完整数据（针对旧版 API）
                        const getResp = await fetch('/api/worldinfo/get', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': token },
                            body: JSON.stringify({ name: bookName })
                        });
                        let bookData = { entries: {} };
                        if (getResp.ok) bookData = await getResp.json();
                        let finalIdx = targetUid !== null ? targetUid.toString() : null;
                        if (finalIdx === null) {
                            let maxId = -1;
                            const currentEntries = bookData.entries || {};
                            for (const id in currentEntries) {
                                if (!isNaN(parseInt(id))) maxId = Math.max(maxId, parseInt(id));
                            }
                            finalIdx = (maxId + 1).toString();
                        }
                        bookData.entries[finalIdx] = stEntry;
                        await fetch('/api/worldinfo/edit', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': token },
                            body: JSON.stringify({ name: bookName, data: bookData })
                        });
                    }
                }
            } catch (err) {
                console.warn('[Lilith] API 注入失败，尝试指令兜底', err);
                if (typeof execFn === 'function') {
                    const uid = targetUid !== null ? targetUid : 0;
                    if (targetUid === null) await execFn(`/createentry file="${bookName}" ""`);
                    // [严格规范] 指令模式下的字段名映射
                    const fields = [
                        ['comment', stEntry.comment],
                        ['content', stEntry.content.replace(/\n/g, ' ')],
                        ['key', keywords.join(',')],
                        ['constant', 'true'],
                        ['selective', 'false'],
                        ['position', stPosition.toString()],
                        ['depth', stDepth.toString()],
                        ['enabled', 'true'],
                        ['disable', 'false']
                    ];
                    for (const [f, v] of fields) {
                        try {
                            await execFn(`/setentryfield file="${bookName}" uid=${uid} field=${f} ${v}`);
                        } catch (e) {}
                    }
                }
            }
            
            // 确保书被激活（针对非绑定情况）
            if (!isLinked) {
                const rebindChatFn = context.rebindChatWorldbook || window.rebindChatWorldbook;
                const rebindGlobalFn = context.rebindGlobalWorldbooks || window.rebindGlobalWorldbooks;
                if (typeof rebindChatFn === 'function') {
                    await rebindChatFn(bookName);
                } else if (typeof rebindGlobalFn === 'function') {
                    const currentBooks = context.worldinfo || [];
                    if (!currentBooks.includes(bookName)) await rebindGlobalFn([...currentBooks, bookName]);
                }
            }

            userState.lastInjectedStats = { sanity: userState.sanity, favorability: userState.favorability };
            saveExtensionSettings();
            
            // [新增] 强制刷新酒馆 UI (无需刷新页面即可看到世界书变化)
            try {
                if (window.SillyTavern?.EventSource) {
                    window.SillyTavern.EventSource.emit('worldinfo_updated', { name: bookName });
                    console.log('[Lilith] 已触发酒馆 UI 刷新事件');
                }
            } catch (err) {
                console.warn('[Lilith] 触发 UI 刷新失败:', err);
            }

            console.log(`[Lilith] 实体注入成功 (目标: ${bookName}, 位置: BeforeCharacter#0)`);
            return 'success';
        } catch (e) {
            console.error('[Lilith] 更新世界书失败:', e);
            return 'error';
        }
    },

    /**
     * 关闭实体化功能时的清理
     */
    async disableEntity() {
        userState.entityEnabled = false;
        userState.worldbookInjected = false;
        saveExtensionSettings();

        const context = SillyTavern.getContext();
        const currentBooks = context.worldinfo || [];
        
        // 1. 如果是全局世界书，解除绑定
        if (currentBooks.includes(this.BOOK_NAME)) {
            const newBooks = currentBooks.filter(name => name !== this.BOOK_NAME);
            if (typeof context.rebindGlobalWorldbooks === 'function') {
                await context.rebindGlobalWorldbooks(newBooks);
            }
        }
        
        // 2. 物理删除条目
        await this.deleteWorldbook();
        
        // 3. 刷新 UI 状态
        const cfgToggle = document.getElementById('cfg-entity-enabled');
        if (cfgToggle) cfgToggle.checked = false;

        // 4. 触发酒馆 UI 刷新
        try {
            if (window.SillyTavern?.EventSource) {
                window.SillyTavern.EventSource.emit('worldinfo_updated', { name: this.BOOK_NAME });
            }
        } catch(e) {}
        
        console.log('[Lilith] 实体化已禁用，环境已清理');
    },

    /**
     * 处理消息中的奖励和任务标签
     * [已增强] 自动监控提取酒馆正文的好感和理智提升
     */
    async processTags(message, messageId = null, force = false) {
        if (!userState.entityEnabled && !force) return;

        // 防止重复处理同一条消息
        if (messageId !== null && userState.lastProcessedMessageId === messageId) {
            return;
        }

        let changed = false;
        let deltaFav = 0;
        let deltaSan = 0;
        let deltaPF = 0;

        // 1. 匹配标准标签 [莉莉丝奖励]奖励内容[/莉莉丝奖励] 或 较早版本可能用 [/莉莉丝任务]
        const rewardRegex = /\[莉莉丝奖励\]([\s\S]*?)\[\/(?:莉莉丝任务|莉莉丝奖励)\]/g;
        let tagMatch;
        while ((tagMatch = rewardRegex.exec(message)) !== null) {
            const rewardText = tagMatch[1];
            const favMatch = rewardText.match(/好感度?\s*([\+\-]\d+)/);
            const sanMatch = rewardText.match(/理智值?\s*([\+\-]\d+)/);
            const pfMatch = rewardText.match(/PF\s*([\+\-]\d+)/);

            if (favMatch) deltaFav += parseInt(favMatch[1]);
            if (sanMatch) deltaSan += parseInt(sanMatch[1]);
            if (pfMatch) deltaPF += parseInt(pfMatch[1]);
            changed = true;
        }

        // 2. 匹配正文中的自由格式 (仅当没有匹配到标准标签时，或者作为补充)
        // 支持: 好感+10, 好感度-5, 理智+3, 理智值-2, [F:+5], [S:-3]
        const freeFavRegex = /(?:好感度?|F:)\s*([\+\-]\d+)/gi;
        const freeSanRegex = /(?:理智值?|S:)\s*([\+\-]\d+)/gi;
        
        let m;
        while ((m = freeFavRegex.exec(message)) !== null) {
            if (deltaFav === 0) { 
                deltaFav += parseInt(m[1]);
                changed = true;
            }
        }
        while ((m = freeSanRegex.exec(message)) !== null) {
            if (deltaSan === 0) {
                deltaSan += parseInt(m[1]);
                changed = true;
            }
        }

        if (changed) {
            userState.favorability += deltaFav;
            userState.sanity += deltaSan;
            userState.fatePoints += deltaPF;
            
            if (messageId !== null) {
                userState.lastProcessedMessageId = messageId;
            }
            
            saveExtensionSettings();

            // 检查差值是否 >= 10
            const lastStats = userState.lastInjectedStats || { sanity: 0, favorability: 0 };
            const dSan = Math.abs(userState.sanity - lastStats.sanity);
            const dFav = Math.abs(userState.favorability - lastStats.favorability);

            if (dSan >= 10 || dFav >= 10) {
                await this.updateWorldbook();
            }

            console.log(`[Lilith] 数值变动提取成功: 好感(${deltaFav > 0 ? '+' : ''}${deltaFav}), 理智(${deltaSan > 0 ? '+' : ''}${deltaSan}), PF(${deltaPF > 0 ? '+' : ''}${deltaPF})`);
        }
    }
};
