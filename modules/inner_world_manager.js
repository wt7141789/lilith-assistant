import { userState, saveState } from './storage.js';
import { PERSONA_DB } from './config.js';

/**
 * 里世界管理器 (Inner World Manager)
 * 负责管理数据可视化矩阵，以及与酒馆数据库插件的交互
 */
export const InnerWorldManager = {
    activeTableId: 'dashboard', // 默认展示仪表盘
    isDashCollapsed: true, // 注入看板默认折叠
    
    // 映射外部表格及其用途 (深度扩展关键词以支持 13.40+ 版本习惯)
    tableMapping: {
        protagonist: ['主角信息', '主角', '玩家', 'Player', 'Protagonist', '主控', '自我介绍', '人物卡', 'PC属性', '基础属性'],
        global: ['全局数据', '系统', '全局', 'System', 'Global', '世界设定', '世界观', '背景', '基础设置', '参数', '记录仪', '全局变量', '通用', '世界参量', '世界参数', 'World'],
        skills: ['技能', '能力', 'Skills', 'Abilities', '法术', '招式', '专长', '武学', '魔法', '战技', '武魂', '天赋'],
        characters: ['重要人物', '重要实体', '人物', '角色', 'Characters', 'NPC', '关系', '好感度', '势力', '伙伴', '攻略对象', '羁绊'],
        tasks: ['任务', '进度', 'Tasks', 'Quests', '剧本', '里程碑', '目标', '历程', '剧情推进', '当前目标', '成就'],
        inventory: ['背包', '物品', '资源', '物资', '装备', '仓库', '道具', 'Inventory', 'Items', 'Equipment', '财物', '商店'],
        log: ['日志', '历史', '记录', 'Log', 'History', '传记', '经脉', '状态'],
        locations: ['地点', '环境', '地图', 'Locations', 'Map', 'Scene', '场景', '背景', '区域']
    },

    /**
     * 查找所有匹配关键词的表格 (不仅限于第一个)
     */
    findAllTablesByKeywords(externalData, keywords) {
        if (!externalData) return [];
        const matches = [];
        for (const id in externalData) {
            const table = externalData[id];
            if (!table) continue;
            const name = table.name || id || '';
            if (keywords.some(k => name.toLowerCase().includes(k.toLowerCase()))) {
                matches.push(table);
            }
        }
        return matches;
    },

    /**
     * 获取外部数据库数据
     */
    getExternalDB() {
        const w = window.parent || window;
        const api = w.AutoCardUpdaterAPI || window.AutoCardUpdaterAPI;
        return (api && api.exportTableAsJson) ? api.exportTableAsJson() : null;
    },

    /**
     * 运行一致性检测 (同步状态机检测)
     */
    runConsistencyCheck(db) {
        if (!db || userState.checkConsistency === false) return { warnings: new Set(), details: {} };
        
        const warnings = new Set();
        const indexedTables = [];
        const details = {};

        Object.keys(db).forEach(id => {
            const table = db[id];
            if (table && table.content && table.content[0]) {
                const headers = table.content[0];
                const idx = headers.findIndex(h => String(h).includes('编码索引'));
                if (idx !== -1) {
                    const indices = new Set();
                    const rows = table.content.slice(1);
                    rows.forEach(r => {
                        if (r[idx]) indices.add(String(r[idx]).trim());
                    });
                    indexedTables.push({ id, name: table.name || id, indices, count: indices.size });
                }
            }
        });

        if (indexedTables.length > 1) {
            indexedTables.sort((a, b) => b.count - a.count);
            const base = indexedTables[0];
            const baseSet = base.indices;

            indexedTables.forEach(item => {
                if (item.id === base.id) return;
                
                const missing = [];
                for (const id of baseSet) {
                    if (!item.indices.has(id)) missing.push(id);
                }
                
                if (missing.length > 0) {
                    warnings.add(item.id);
                    details[item.id] = { missing, baseName: base.name };
                }
            });
        }

        return { warnings, details };
    },

    /**
     * 根据关键字查找匹配的表格
     */
    findTableByKeywords(externalData, keywords) {
        return this.findAllTablesByKeywords(externalData, keywords)[0] || null;
    },

    /**
     * 渲染仪表盘卡片
     */
    renderCard(title, icon, contentHtml, color = 'var(--l-cyan)', hasWarning = false, warningDetail = '') {
        return `
            <div class="inner-dashboard-card dash-slot-item" style="background:rgba(128,128,128,0.08); border:1px solid ${hasWarning ? '#ff0055' : 'rgba(128,128,128,0.15)'}; border-radius:6px; padding:12px; margin-bottom:12px; border-left:3px solid ${color}; position:relative;">
                <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px;">
                    <div class="dash-slot-title" style="display:flex; align-items:center; gap:8px; color:${color}; font-size:14px; font-weight:bold; text-transform:uppercase;">
                        <i class="${icon}"></i> ${title}
                    </div>
                    ${hasWarning ? `
                        <div class="consistency-warning-icon" title="检测到数据不一致！参考基准 [${warningDetail}]" style="color:#ff0055; animation: pulse 1s infinite; cursor:help;">
                            <i class="fa-solid fa-triangle-exclamation"></i>
                        </div>
                    ` : ''}
                </div>
                <div class="card-content" style="font-size:12px; color:inherit;">
                    ${contentHtml}
                </div>
            </div>
        `;
    },

    /**
     * 仅渲染汇总看板内容 (用于正文注入)
     * @returns {boolean} 是否成功渲染
     */
    renderDashboardOnly(container, showBubbleMethod, showStatusMethod) {
        if (!container) return false;
        const externalData = this.getExternalDB();
        const currentPersona = PERSONA_DB[userState.activePersona || 'toxic'];
        
        // 我们在注入的卡片中不显示内容区的 Switcher，因为头部已经有了一个更简洁的
        const dashHtml = this.renderDashboard(externalData, currentPersona, { showSwitcher: false });
        if (!dashHtml) {
            container.innerHTML = '';
            container.style.display = 'none'; // 隐藏容器
            return false;
        }

        container.style.display = 'block';
        const isCollapsed = this.isDashCollapsed;
        const styleMode = userState.dashboardStyle || 'modern';
        
        // 获取酒馆头像
        let avatarUrl = '';
        try {
            const ctx = typeof SillyTavern !== 'undefined' ? SillyTavern.getContext() : null;
            if (ctx && ctx.characters && ctx.characterId && ctx.characters[ctx.characterId]) {
                avatarUrl = `/thumbnail?type=avatar&file=${encodeURIComponent(ctx.characters[ctx.characterId].avatar)}`;
            }
        } catch(e) {}

        const html = `
            <div class="lilith-embedded-dash dash-style-${styleMode}" style="border-radius: 8px; padding: 12px; font-family: var(--l-font); min-height: 20px; transition: opacity 0.3s ease; position: relative; overflow: hidden;">
                <!-- 头部作为折叠触发器 -->
                <div class="dash-collapse-trigger" style="display:flex; justify-content:space-between; align-items:center; cursor:pointer; user-select:none; padding:2px 0; gap:12px;">
                    <div style="display:flex; align-items:center; gap:10px; flex:1;">
                        ${avatarUrl ? `<div class="dash-avatar-circle" style="background-image: url('${avatarUrl}'); color:var(--l-main);"></div>` : `<div class="dash-avatar-circle" style="display:flex; align-items:center; justify-content:center; color:var(--l-main);"><i class="fa-solid fa-ghost"></i></div>`}
                        <div>
                            <div class="dash-header-text" style="font-size:13px; font-weight:bold; letter-spacing:1px; display:flex; align-items:center; gap:6px;">
                                <i class="fa-solid fa-atom" style="animation: ${isCollapsed ? 'none' : 'pulse 2s infinite'}; font-size:10px;"></i> 
                                虚空核心 (VOID_CORE)
                                <i class="fa-solid ${isCollapsed ? 'fa-chevron-down' : 'fa-chevron-up'}" style="font-size:10px; opacity:0.5; margin-left:4px;"></i>
                            </div>
                            <div style="font-size:9px; opacity:0.6; font-family:monospace; display: ${isCollapsed ? 'block' : 'none'};">CORE_STATUS: RUNNING</div>
                            <div style="font-size:9px; opacity:0.6; font-family:monospace; display: ${isCollapsed ? 'none' : 'block'};">LILITH_CORE: STYLE_${styleMode.toUpperCase()}</div>
                        </div>
                    </div>
                    
                    <!-- 样式快捷切换 (仅点点) -->
                    <div class="dash-style-switcher">
                        <div class="style-dot ${styleMode === 'modern' ? 'active' : ''}" data-style="modern" title="莉莉丝粉" style="background:var(--l-main);"></div>
                        <div class="style-dot ${styleMode === 'parchment' ? 'active' : ''}" data-style="parchment" title="羊皮卷轴" style="background:#8b4513;"></div>
                        <div class="style-dot ${styleMode === 'ink' ? 'active' : ''}" data-style="ink" title="水墨风" style="background:#000;"></div>
                        <div class="style-dot ${styleMode === 'terminal' ? 'active' : ''}" data-style="terminal" title="赛博终端" style="background:#00ff41;"></div>
                        <div class="style-dot ${styleMode === 'industrial' ? 'active' : ''}" data-style="industrial" title="工业极简" style="background:#bd00ff;"></div>
                    </div>
                </div>
                
                <!-- 内容区 -->
                <div class="dash-content-wrapper" style="display: ${isCollapsed ? 'none' : 'block'}; margin-top:15px;">
                    ${dashHtml}
                </div>
            </div>
        `;
        
        // 性能检查：如果 HTML 内容没变，则不更新 DOM，防止闪烁
        if (container.dataset.lastHtml === html) {
             return true;
        }

        container.innerHTML = html;
        container.dataset.lastHtml = html;
        this.bindEvents(container, showBubbleMethod, showStatusMethod);
        return true;
    },

    /**
     * 渲染里世界主容器内容
     */
    render(container, showBubbleMethod, showStatusMethod) {
        if (!container) return;

        const externalData = this.getExternalDB();
        const currentPersona = PERSONA_DB[userState.activePersona || 'toxic'];

        let html = `
            <div class="inner-world-container" style="display:flex; flex-direction:column; flex:1; box-sizing:border-box; font-family:var(--l-font); overflow:hidden; padding:10px; min-height:0;">
                <!-- 头部: 固定操作区 -->
                <div class="inner-header" style="flex-shrink:0; margin-bottom:12px; border-left:4px solid var(--l-main); padding-left:10px; display:flex; justify-content:space-between; align-items:flex-start;">
                    <div>
                        <h3 style="margin:0; color:var(--l-main); font-size:16px; text-transform:uppercase; letter-spacing:1px;">LILITH · 虚空最核心 (THE_CORE)</h3>
                        <div class="toggle-container" style="display:flex; align-items:center; flex-wrap:wrap; gap:12px; margin-top:4px;">
                            <small style="color:var(--l-cyan); opacity:0.8; font-family: 'Share Tech Mono', monospace;">链路状态: ${externalData ? '同步稳定' : '离线状态'}</small>
                            <div class="toggle-item" title="控制聊天区域下方是否显示虚空核心看板" style="display:flex; align-items:center; border:1px solid rgba(255,0,85,0.2); border-radius:3px; padding:1px 6px; background:rgba(255,0,85,0.05); cursor:pointer;" onclick="const cb = document.getElementById('cfg-inner-inject-dash'); if(cb) { cb.checked = !cb.checked; cb.dispatchEvent(new Event('change')); }">
                                <input type="checkbox" id="cfg-inner-inject-dash" ${userState.injectDashboard ? 'checked' : ''} style="width:10px; height:10px; margin:0 4px 0 0; cursor:pointer;" onclick="event.stopPropagation();"> 
                                <span style="font-size:9px; color:var(--l-main); font-weight:bold; white-space:nowrap; letter-spacing:0.5px;">核心链路注入</span>
                            </div>
                            <!-- [新增] 一致性检测开关 -->
                            <div class="toggle-item" title="监测不同表格间的数据关联是否正确" style="display:flex; align-items:center; border:1px solid rgba(0,243,255,0.2); border-radius:3px; padding:1px 6px; background:rgba(0,243,255,0.05); cursor:pointer;" onclick="const cb = document.getElementById('cfg-inner-consistency-check'); if(cb) { cb.checked = !cb.checked; cb.dispatchEvent(new Event('change')); }">
                                <input type="checkbox" id="cfg-inner-consistency-check" ${userState.checkConsistency !== false ? 'checked' : ''} style="width:10px; height:10px; margin:0 4px 0 0; cursor:pointer;" onclick="event.stopPropagation();"> 
                                <span style="font-size:9px; color:var(--l-cyan); font-weight:bold; white-space:nowrap; letter-spacing:0.5px;">一致性监测</span>
                            </div>
                        </div>
                    </div>
                    <div style="display:flex; gap:6px;">
                        <button class="tool-btn icon-only" id="inner-open-native-btn" title="打开原生编辑器" style="width:28px; height:28px; padding:0; display:flex; align-items:center; justify-content:center; background:rgba(255,255,255,0.05); border:1px solid #333; color:#999; cursor:pointer; transition:all 0.2s;" onmouseover="this.style.color='var(--l-main)'; this.style.borderColor='var(--l-main)';" onmouseout="this.style.color='#999'; this.style.borderColor='#333';">
                            <i class="fa-solid fa-external-link-alt" style="font-size:12px;"></i>
                        </button>
                        <button class="tool-btn icon-only" id="inner-header-sync-btn" title="同步核心变量" style="width:28px; height:28px; padding:0; display:flex; align-items:center; justify-content:center; background:rgba(255,0,85,0.1); border:1px solid var(--l-main); color:var(--l-main); cursor:pointer; transition:all 0.2s;">
                            <i class="fa-solid fa-bolt" style="font-size:12px;"></i>
                        </button>
                        <button class="tool-btn icon-only" id="inner-refresh-btn" title="刷新矩阵" style="width:28px; height:28px; padding:0; display:flex; align-items:center; justify-content:center; background:rgba(255,255,255,0.05); border:1px solid #333; color:#999; cursor:pointer; transition:all 0.2s;" onmouseover="this.style.color='var(--l-cyan)'; this.style.borderColor='var(--l-cyan)';" onmouseout="this.style.color='#999'; this.style.borderColor='#333';">
                            <i class="fa-solid fa-sync-alt" style="font-size:12px;"></i>
                        </button>
                    </div>
                </div>

                <!-- 导航标签 -->
                <div class="inner-table-tabs" style="flex-shrink:0; display:flex; flex-wrap:wrap; gap:5px; margin-bottom:12px; padding-bottom:5px;">
                    <div class="inner-tab ${this.activeTableId === 'dashboard' ? 'active' : ''}" data-id="dashboard" style="padding:4px 10px; font-size:11px; cursor:pointer; border:1px solid ${this.activeTableId === 'dashboard' ? 'var(--l-main)' : '#333'}; border-radius:4px; white-space:nowrap; background:rgba(0,0,0,0.2);">
                        虚空核心
                    </div>
                    ${externalData ? Object.keys(externalData)
                        .filter(id => id && id !== 'mate' && id !== 'meta' && id !== 'null' && id !== 'undefined' && externalData[id] && typeof externalData[id] === 'object' && externalData[id].content)
                        .map(id => `
                        <div class="inner-tab ${this.activeTableId === id ? 'active' : ''}" data-id="${id}" style="padding:4px 10px; font-size:11px; cursor:pointer; border:1px solid ${this.activeTableId === id ? 'var(--l-main)' : '#333'}; border-radius:4px; white-space:nowrap; background:rgba(0,0,0,0.2);">
                            ${externalData[id].name || id || '未命名表格'}
                        </div>
                    `).join('') : ''}
                </div>

                <!-- 内容滚动区 -->
                <div class="inner-scroll-area" style="flex:1; overflow-y:auto; overflow-x:hidden; padding-right:5px; min-height:0;">
                    ${this.activeTableId === 'dashboard' ? this.renderDashboard(externalData, currentPersona) : this.renderSingleTable(this.activeTableId, externalData[this.activeTableId])}
                </div>

                <!-- 底部: 核心同步按钮 (全宽且固定) -->
                <div class="inner-footer" style="flex-shrink:0; margin-top:5px; padding:8px 0; border-top:1px solid rgba(255,255,255,0.05); width:100%;">
                    <button class="tool-btn" id="inner-sync-btn" style="display:flex; align-items:center; justify-content:center; gap:8px; width:100%; font-size:11px; color:var(--l-main); border:1px solid var(--l-main); height:36px; background:rgba(255,0,85,0.08); font-weight:bold; letter-spacing:1px; cursor:pointer; transition:all 0.2s;">
                        <i class="fa-solid fa-bolt"></i> 属性变更强制同步 (SLASH_SYNC)
                    </button>
                </div>
            </div>
        `;

        container.innerHTML = html;
        this.bindEvents(container, showBubbleMethod, showStatusMethod);
    },

    /**
     * 根据规则提取表格属性
     * @param {Object} table 原始表格数据
     * @param {String} tableId 表格唯一标识
     * @param {String} rule 'kv' (属性对) 或 'capsule' (清单列表)
     * @param {Array} priorityKeys 优先排序并显示的键名 (用于汇总看板)
     * @param {Number} preferredCol 预期的核心列索引 (-1 则自动探测)
     */
    extractByRule(table, tableId, rule = 'kv', maxRows = 30, priorityKeys = [], preferredCol = -1) {
        if (!table || !table.content || table.content.length === 0) return null;
        
        const content = table.content.filter(row => row && row.length > 0);
        if (content.length === 0) return null;
        
        const headers = (content[0] || []).map(h => (h === null || h === undefined) ? '' : String(h).trim());
        const junkKeywords = ['id', '序号', 'index', 'idx', 'no', 'guid', 'uid', 'time', '更新', '创建', '像素', 'uuid', '__v', '时间', 'null', 'undefined', '编码索引', '索引', 'key'];
        
        // 模式 A: 键值对提取 (表头 + 第一行数据)
        if (rule === 'kv') {
            const dataRow = content[1]; // 取第一行有效数据作为当前状态
            if (!dataRow) return null;

            let items = headers.map((h, i) => {
                const val = (dataRow[i] === null || dataRow[i] === undefined) ? '-' : String(dataRow[i]).trim();
                return { key: h, value: val, tableId, rowIndex: 0, colIndex: i };
            }).filter(item => {
                const isPriority = priorityKeys.includes(item.key);
                return item.key && 
                       item.key !== 'null' && 
                       item.key !== 'undefined' &&
                       !item.key.includes('__') && 
                       (isPriority || !junkKeywords.some(k => item.key.toLowerCase().includes(k)));
            });

            // 如果有优先级键，根据优先级排序并置顶内容
            if (priorityKeys.length > 0) {
                const prioritized = [];
                const others = [];
                priorityKeys.forEach(pk => {
                    const found = items.find(it => it.key === pk);
                    if (found) prioritized.push(found);
                });
                items.forEach(it => {
                    if (!priorityKeys.includes(it.key)) others.push(it);
                });
                return [...prioritized, ...others].slice(0, maxRows);
            }

            return items.slice(0, maxRows);
        }
        
        // 模式 B: 胶囊清单提取 (多行数据的核心列)
        if (rule === 'capsule') {
            // A. 第一优先级：自动寻找最像“名称”的列
            let nameIdx = headers.findIndex(h => h && /名称|名字|name|人物|角色|技能|物品|道具|描述|核心|标题/i.test(h));
            
            // B. 第二优先级：如果没找到名称列，且指定了有效核心列，则使用指定列
            if (nameIdx === -1 && preferredCol >= 0 && preferredCol < headers.length) {
                nameIdx = preferredCol;
            }
            
            // C. 第三优先级：避开 ID 类的第一列，尝试寻找第一列或第二列
            if (nameIdx === -1) {
                const firstColHeader = (headers[0] || '').toLowerCase();
                const isJunk = junkKeywords.some(k => firstColHeader.includes(k)) && !priorityKeys.includes(headers[0]);
                nameIdx = (isJunk || /^\d+$/.test(String(content[1]?.[0] || ''))) ? 1 : 0;
            }
            if (nameIdx >= headers.length) nameIdx = 0;

            return content.slice(1, maxRows).map((row, rIdx) => {
                const key = (row[nameIdx] === null || row[nameIdx] === undefined) ? '' : String(row[nameIdx]).trim();
                // 详情由同行其他非垃圾列组成
                const detail = row.map((c, i) => {
                    if (i === nameIdx) return null;
                    const isPriority = priorityKeys.includes(headers[i]);
                    if (!headers[i] || (!isPriority && junkKeywords.some(k => headers[i].toLowerCase().includes(k)))) return null;
                    if (c === null || c === undefined || c === '' || c === '0' || c === '-') return null;
                    return `${headers[i]}: ${String(c).trim()}`;
                }).filter(v => v).join(' | ');

                return { key, value: detail || key, tableId, rowIndex: rIdx, colIndex: nameIdx };
            }).filter(item => item.key && item.key !== 'null' && item.key !== 'undefined' && item.key !== '-' && item.key !== '0');
        }
        
        return null;
    },

    /**
     * 渲染槽位内容
     */
    renderSlot(title, icon, info, rule = 'kv', color = 'var(--l-cyan)', slotId = '', hasWarning = false, warningDetail = '') {
        if (!info || info.length === 0) return '';
        
        // 核心状态(core)与世界参数(world)设为只读
        const isReadOnly = slotId === 'world' || slotId === 'core';
        let contentHtml = '';
        if (rule === 'kv') {
            const html = info.map(it => `
                <div class="${isReadOnly ? '' : 'dashboard-pop-trigger'} inner-data-item" 
                     data-slot="${slotId}"
                     data-table-id="${it.tableId}"
                     data-row-index="${it.rowIndex}"
                     data-col-index="${it.colIndex}"
                     data-title="${it.key}" 
                     data-val="${it.value}" 
                     style="padding-bottom:2px; overflow:hidden; ${isReadOnly ? 'cursor:default;' : 'cursor:pointer;'}">
                    <span style="color:inherit; opacity:0.6; font-size:10px; white-space:nowrap;">${it.key}</span><br>
                    <span style="color:${color}; font-size:13px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; display:block; font-weight:bold;">${it.value}</span>
                </div>`).join('');
            contentHtml = `<div style="display:grid; grid-template-columns:1fr 1fr; gap:6px;">${html}</div>`;
        } else if (rule === 'capsule') {
            const html = info.map(it => `
                <div class="${isReadOnly ? '' : 'dashboard-pop-trigger'} inner-data-item capsule-item" 
                     data-slot="${slotId}"
                     data-table-id="${it.tableId}"
                     data-row-index="${it.rowIndex}"
                     data-col-index="${it.colIndex}"
                     data-title="${it.key}" 
                     data-val="${it.value}" 
                     style="background:rgba(128,128,128,0.1); border:1px solid rgba(128,128,128,0.15); border-radius:12px; padding:2px 8px; font-size:12px; color:inherit; white-space:nowrap; border-left:2px solid ${color}; cursor:${isReadOnly ? 'default' : 'pointer'}; font-weight:bold;">
                    ${it.key}
                </div>`).join('');
            contentHtml = `<div style="display:flex; flex-wrap:wrap; gap:4px; max-height:100px; overflow-y:auto; padding-right:2px;">${html}</div>`;
        }

        return this.renderCard(title, icon, contentHtml, color, hasWarning, warningDetail);
    },

    /**
     * 渲染汇总仪表盘 (采用关键词模糊映射 + 双模解析逻辑)
     */
    renderDashboard(externalData, currentPersona, options = { showSwitcher: true }) {
        // 关键逻辑：如果数据未变且容器已存在，可跳过重渲染以提高性能 (可选)
        // 但为了“实时”响应，我们在这里总是获取最新 DB
        const db = externalData || this.getExternalDB();
        const styleMode = userState.dashboardStyle || 'modern';
        
        if (!db) {
            return `
                <div style="padding:40px 20px; text-align:center; color:#444; border:1px dashed #222; margin:10px; border-radius:8px;">
                    <div style="font-size:32px; margin-bottom:10px; filter:grayscale(1);">🌌</div>
                    <div style="font-size:13px; color:#666; font-family:'Share Tech Mono';">链路连接失败：未检测到数据库 (LINK_FAILURE)</div>
                    <p style="font-size:11px; margin-top:5px; opacity:0.5;">请检查 [酒馆数据库] 插件是否已启用或含有数据表格</p>
                </div>
            `;
        }

        // 运行一致性检测
        const { warnings, details } = this.runConsistencyCheck(db);

        // 汇总看板的槽位定义
        const slots = [
            { id: 'core', title: '核心状态', icon: 'fa-solid fa-user-shield', kw: this.tableMapping.protagonist, rule: 'kv', color: '#00d4ff' },
            { 
                id: 'world',
                title: '世界参数', 
                icon: 'fa-solid fa-microchip', 
                kw: this.tableMapping.global, 
                rule: 'kv', 
                color: '#94a3b8',
                priority: ['当前主要地区', '当前次要地区', '当前详细地点', '上轮场景时间', '经过的时间', '当前时间']
            },
            { id: 'characters', title: '重要人物', icon: 'fa-solid fa-user-tag', kw: this.tableMapping.characters, rule: 'capsule', color: '#a335ee', preferredCol: 1 },
            { id: 'skills', title: '战技库', icon: 'fa-solid fa-bolt-lightning', kw: this.tableMapping.skills, rule: 'capsule', color: 'var(--l-main)', preferredCol: 1 },
            { id: 'items', title: '存储清单', icon: 'fa-solid fa-boxes-stacked', kw: this.tableMapping.inventory, rule: 'capsule', color: '#ffcc00', preferredCol: 1 },
            { id: 'tasks', title: '目标链路', icon: 'fa-solid fa-scroll', kw: this.tableMapping.tasks, rule: 'capsule', color: '#10b981', preferredCol: 1 },
            { id: 'locations', title: '地理环境', icon: 'fa-solid fa-map-location-dot', kw: this.tableMapping.locations, rule: 'capsule', color: '#3b82f6', preferredCol: 1 }
        ];

        let slotHtml = '';
        slots.forEach(slot => {
            // 改进寻表逻辑：优先根据关键字顺序进行精确或半精确匹配
            let targetId = null;
            
            // 阶段 1: 寻找最匹配的关键字
            for (const k of slot.kw) {
                targetId = Object.keys(db).find(id => {
                    const tableName = (db[id]?.name || id).toLowerCase();
                    const key = k.toLowerCase();
                    // 精确匹配，或者包含“表/表格”后缀的匹配
                    return tableName === key || tableName === key + '表' || tableName === key + '表格';
                });
                if (targetId) break;
            }
            
            // 阶段 2: 如果没找到，退而求其次寻找模糊包含（仍遵循关键字优先级）
            if (!targetId) {
                for (const k of slot.kw) {
                    targetId = Object.keys(db).find(id => {
                        const tableName = (db[id]?.name || id).toLowerCase();
                        return tableName.includes(k.toLowerCase());
                    });
                    if (targetId) break;
                }
            }

            const targetTable = targetId ? db[targetId] : null;
            if (targetTable) {
                const info = this.extractByRule(targetTable, targetId, slot.rule, 30, slot.priority || [], slot.preferredCol);
                if (info && info.length > 0) {
                    const hasWarning = warnings.has(targetId);
                    const warningTxt = hasWarning ? details[targetId].baseName : '';
                    slotHtml += this.renderSlot(slot.title, slot.icon, info, slot.rule, slot.color, slot.id, hasWarning, warningTxt);
                }
            }
        });

        if (!slotHtml) {
            return `
                <div style="padding:40px 20px; text-align:center; color:#444; border:1px dashed #222; margin:10px; border-radius:8px;">
                    <div style="font-size:32px; margin-bottom:10px; filter:grayscale(1);">🌌</div>
                    <div style="font-size:13px; color:#666; font-family:'Share Tech Mono';">链路数据为空 (LINK_EMPTY)</div>
                </div>
            `;
        }

        const switcherHtml = options.showSwitcher ? `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px; border-bottom:1px solid rgba(255,255,255,0.05); padding-bottom:8px;">
                <span style="font-size:10px; color:#666; font-family:'Share Tech Mono';">VIEW_THEME: ${styleMode.toUpperCase()}</span>
                <div class="dash-style-switcher">
                    <div class="style-dot ${styleMode === 'modern' ? 'active' : ''}" data-style="modern" title="莉莉丝粉" style="background:var(--l-main);"></div>
                    <div class="style-dot ${styleMode === 'parchment' ? 'active' : ''}" data-style="parchment" title="羊皮卷轴" style="background:#8b4513;"></div>
                    <div class="style-dot ${styleMode === 'ink' ? 'active' : ''}" data-style="ink" title="水墨风" style="background:#000;"></div>
                    <div class="style-dot ${styleMode === 'terminal' ? 'active' : ''}" data-style="terminal" title="赛博终端" style="background:#00ff41;"></div>
                    <div class="style-dot ${styleMode === 'industrial' ? 'active' : ''}" data-style="industrial" title="工业极简" style="background:#bd00ff;"></div>
                </div>
            </div>
        ` : '';

        return `
            <div class="dash-style-${styleMode}" style="padding:10px; border-radius:8px;">
                ${switcherHtml}
                <div class="inner-dashboard-grid" style="animation: matrix-fade-in 0.4s ease;">
                    ${slotHtml}
                </div>
            </div>
        `;
    },

    /**
     * 渲染单个表格（详细视图 - 核心采用气泡/卡片化展示）
     */
    renderSingleTable(tableId, table) {
        if (!table || !table.content || table.content.length === 0) return '';
        
        const headers = table.content[0] || [];
        const rows = table.content.slice(1);
        const junkKeywords = ['id', 'uuid', '__v', '序号', 'index', 'idx']; // 缩小屏蔽范围，避免误伤用户自定义的固定数据

        if (rows.length === 0) {
            return `<div style="padding:40px 20px; text-align:center; color:#444; border:1px dashed #222; margin:10px; border-radius:8px; font-size:12px;">该表格暂无数据内容</div>`;
        }

        const cardsHtml = rows.map((row, rowIndex) => {
            // 提取“前方固定数据” (通常是第一列的 ID 或 序号)
            const fixedData = row[0] || (rowIndex + 1);
            
            const fieldsHtml = row.map((cell, colIndex) => {
                const header = headers[colIndex] || '';
                const headerStr = String(header).toLowerCase();
                
                // 仅物理屏蔽第一列 (作为固定 ID 处理)，以及明确的系统垃圾字段
                if (colIndex === 0) return '';
                if (junkKeywords.some(k => headerStr.includes(k) && !header.includes('名'))) return '';
                
                // 仅显示 perforated 的字段，保持页面整洁
                if (cell === null || cell === undefined || cell === '' || cell === '-' || cell === '0') return '';

                const isPlaceholder = cell === '数据未写入';

                return `
                    <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px; padding:4px 0; border-bottom:1px solid rgba(128,128,128,0.1);">
                        <span style="color:inherit; opacity:0.5; font-size:10px; flex-shrink:0; padding-top:1px; font-family:'Share Tech Mono'; font-weight:bold;">${header || `属性_${colIndex}`}</span>
                        <div class="clickable-fill" 
                             data-table-id="${tableId}"
                             data-row-index="${rowIndex}"
                             data-col-index="${colIndex}"
                             data-header="${header || `未命名属性_${colIndex}`}" 
                             data-val="${cell}" 
                             title="单元格操作: ${header || `未命名属性_${colIndex}`}" 
                             style="color:inherit; opacity:${isPlaceholder ? '0.3' : '1'}; font-size:11px; text-align:right; word-break:break-all; cursor:pointer; background:${isPlaceholder ? 'transparent' : 'rgba(128,128,128,0.1)'}; padding:1px 6px; border-radius:3px; transition:all 0.1s; font-weight:700; ${isPlaceholder ? 'font-style:italic;' : ''}">
                            ${cell}
                        </div>
                    </div>
                `;
            }).filter(h => h).join('');

            // 如果整行数据除了“固定 ID”之外全为空 (比如新插入的行)，显示占位符
            const cardContent = fieldsHtml || `
                <div class="clickable-fill" 
                     data-table-id="${tableId}" data-row-index="${rowIndex}" data-col-index="1" data-header="空节点" data-val=""
                     style="text-align:center; padding:15px; background:rgba(0,229,255,0.03); border:1px dashed rgba(0,229,255,0.2); border-radius:8px; cursor:pointer; margin-top:5px;">
                    <i class="fa-solid fa-plus" style="color:var(--l-cyan); opacity:0.6; margin-bottom:5px;"></i>
                    <div style="font-size:10px; color:var(--l-cyan); opacity:0.5; font-family:'Share Tech Mono';">空节点：点击进行编辑 (EMPTY_NODE)</div>
                </div>
            `;

            return `
                <div class="inner-data-card" style="background:rgba(128,128,128,0.1); border:1px solid rgba(128,128,128,0.15); border-radius:8px; padding:10px; margin-bottom:8px; position:relative; overflow:hidden;">
                    <div style="position:absolute; top:0; left:0; width:2px; height:100%; background:var(--l-main); opacity:0.8;"></div>
                    <div style="font-size:9px; color:var(--l-main); margin-bottom:6px; display:flex; justify-content:space-between; align-items:center;">
                        <span style="font-weight:bold; letter-spacing:0.5px; opacity:0.7;">数据节点 (DATA_NODE): <span style="color:#fff;">#${fixedData}</span></span>
                        <span style="opacity:0.3; font-family:monospace; font-size:8px;">${table.name || 'DB'}</span>
                    </div>
                    <div class="card-bubble-fields" style="display:flex; flex-direction:column;">
                        ${cardContent}
                    </div>
                </div>
            `;
        }).join('');

        return `
            <div class="external-table-bubbles" style="padding:5px 10px 30px 5px; animation: matrix-fade-in 0.4s ease;">
                ${cardsHtml}
            </div>
        `;
    },

    /**
     * 绑定事件
     */
    bindEvents(container, showBubbleMethod, showStatusMethod) {
        // 1. 全域链路概览折叠切换
        const collapseTrigger = container.querySelector('.dash-collapse-trigger');
        if (collapseTrigger) {
            ['click', 'touchstart'].forEach(evt => {
                collapseTrigger.addEventListener(evt, (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    this.isDashCollapsed = !this.isDashCollapsed;
                    this.renderDashboardOnly(container, showBubbleMethod, showStatusMethod);
                });
            });
        }

        // 2. 全局设置绑定: 全域链路概览注入正文
        const innerInjectDash = container.querySelector('#cfg-inner-inject-dash');
        if (innerInjectDash) {
            innerInjectDash.addEventListener('change', () => {
                if (window.UIManager && window.UIManager.syncDashboardInjection) {
                    window.UIManager.syncDashboardInjection(innerInjectDash.checked);
                } else {
                    // 兜底逻辑
                    userState.injectDashboard = innerInjectDash.checked;
                    if (userState.injectDashboard) {
                        const toast = window.toastr || { info: (m) => showStatusMethod?.(m, "var(--l-main)") };
                        toast.info("注入设置已更新，将在下条回复生效");
                    }
                }
            });
        }

        // 2.2 全局设置绑定: 一致性检测开关
        const innerConsistencyCheck = container.querySelector('#cfg-inner-consistency-check');
        if (innerConsistencyCheck) {
            innerConsistencyCheck.addEventListener('change', () => {
                userState.checkConsistency = innerConsistencyCheck.checked;
                saveState();
                
                // 重新渲染本体以查看效果
                this.render(container, showBubbleMethod, showStatusMethod);
                showStatusMethod?.(userState.checkConsistency ? "一致性监测已激活" : "一致性监测已禁用", userState.checkConsistency ? "var(--l-cyan)" : "#888");
            });
        }

        container.querySelectorAll('.inner-tab').forEach(tab => {
            ['click', 'touchstart'].forEach(evt => {
                tab.addEventListener(evt, (e) => {
                    e.preventDefault();
                    const id = tab.getAttribute('data-id');
                    this.activeTableId = id;
                    this.render(container, showBubbleMethod, showStatusMethod);
                });
            });
        });

        const refreshBtn = container.querySelector('#inner-refresh-btn');
        if (refreshBtn) {
            ['click', 'touchstart'].forEach(evt => {
                refreshBtn.addEventListener(evt, (e) => {
                    e.preventDefault();
                    this.render(container, showBubbleMethod, showStatusMethod);
                    showStatusMethod?.("矩阵感知重置完毕", "var(--l-cyan)");
                });
            });
        }

        const openNativeBtn = container.querySelector('#inner-open-native-btn');
        if (openNativeBtn) {
            ['click', 'touchstart'].forEach(evt => {
                openNativeBtn.addEventListener(evt, (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (window.toastr) window.toastr.info('正在唤醒原生编辑器...');
                    
                    const w = window.parent || window;
                    const api = w.AutoCardUpdaterAPI || window.AutoCardUpdaterAPI;
                    
                    if (api && api.openVisualizer) {
                        api.openVisualizer();
                    } else {
                        window.dispatchEvent(new CustomEvent('acu:open_visualizer'));
                        setTimeout(() => {
                            if (!document.querySelector('.acu-modal')) {
                                showStatusMethod?.("未探测到原生编辑器接口，请确保已安装相应插件", "#e74c3c");
                            }
                        }, 100);
                    }
                });
            });
        }

        const syncCoreLogic = async () => {
             const w = window.parent || window;
             const api = w.AutoCardUpdaterAPI || window.AutoCardUpdaterAPI;
             
             showStatusMethod?.("正在重构变量链路...", "var(--l-main)");
             
             if (api && api.manualUpdate) {
                api.manualUpdate();
             }

             await new Promise(r => setTimeout(r, 500));
             
             const externalData = this.getExternalDB();
             const results = await this.syncToSillyTavern(externalData);
             
             this.render(container, showBubbleMethod, showStatusMethod);
             
             if (results.count > 0) {
                showBubbleMethod?.(`矩阵同步成功: 已更新 ${results.count} 个核心变量。`, "var(--l-main)");
             } else {
                showBubbleMethod?.("同步完成，未发现有效的键值对变更。", "var(--l-cyan)");
             }
        };

        const syncBtn = container.querySelector('#inner-sync-btn');
        if (syncBtn) {
            ['click', 'touchstart'].forEach(evt => {
                syncBtn.addEventListener(evt, (e) => {
                    e.preventDefault();
                    syncCoreLogic();
                });
            });
        }

        const headerSyncBtn = container.querySelector('#inner-header-sync-btn');
        if (headerSyncBtn) {
            ['click', 'touchstart'].forEach(evt => {
                headerSyncBtn.addEventListener(evt, (e) => {
                    e.preventDefault();
                    syncCoreLogic();
                });
            });
        }

        // 3. 样式切换绑定
        container.querySelectorAll('.style-dot').forEach(dot => {
            ['click', 'touchstart'].forEach(evt => {
                dot.addEventListener(evt, (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const style = dot.dataset.style;
                    userState.dashboardStyle = style;
                    saveState();
                    
                    // 判断当前是在侧边栏还是正文嵌入
                    const isSidebar = container.classList.contains('inner-world-container') || container.querySelector('.inner-world-container');
                    if (isSidebar) {
                        // 如果在侧边栏，重新渲染整个里世界界面
                        const sidebarRoot = container.classList.contains('inner-world-container') ? container.parentElement : container;
                        this.render(sidebarRoot, showBubbleMethod, showStatusMethod);
                    } else {
                        // 如果在正文，只重新渲染看板
                        this.renderDashboardOnly(container, showBubbleMethod, showStatusMethod);
                    }
                    
                    showStatusMethod?.(`已切换至 ${dot.title} 风格`, "var(--l-cyan)");
                });
            });
        });

        // 汇总仪表盘弹出气泡 UI
        container.querySelectorAll('.dashboard-pop-trigger').forEach(item => {
            ['click', 'touchstart'].forEach(evt => {
                item.addEventListener(evt, (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const slotId = item.dataset.slot;
                    const title = item.dataset.title;
                    const tableId = item.dataset.tableId;
                    const rowIndex = parseInt(item.dataset.rowIndex);
                    const colIndex = parseInt(item.dataset.colIndex);
                    const val = item.dataset.val;

                    if (slotId === 'core' || slotId === 'world') {
                        const cleanVal = val.split(' | ').map(v => `<div style="margin-bottom:6px; border-bottom:1px solid rgba(255,255,255,0.05); padding-bottom:6px;">${v}</div>`).join('');
                        this.showDataPopup(title, cleanVal, showStatusMethod);
                        return;
                    }

                    this.showQuickBubble(e, tableId, rowIndex, colIndex, title, val, showStatusMethod);
                });
            });
        });

        // 快速操作菜单 (仅限详细表格视图)
        container.querySelectorAll('.clickable-fill').forEach(item => {
            ['click', 'touchstart'].forEach(evt => {
                item.addEventListener(evt, (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const tableId = item.dataset.tableId;
                    const rowIndex = parseInt(item.dataset.rowIndex);
                    const colIndex = parseInt(item.dataset.colIndex);
                    const title = item.dataset.header || 'DATA';
                    const val = item.dataset.val || ''; 
                    
                    this.showActionMenu(e, tableId, rowIndex, colIndex, title, val, showStatusMethod);
                });
            });
        });
    },

    /**
     * 显示数据行动菜单 (完全复刻可视化前端逻辑)
     */
    showActionMenu(e, tableId, rowIndex, colIndex, title, value, showStatusMethod) {
        document.querySelectorAll('.inner-action-menu-overlay').forEach(el => el.remove());

        const overlay = document.createElement('div');
        overlay.className = 'inner-action-menu-overlay';
        overlay.style = `
            position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
            background: transparent; z-index: 2147483640;
        `;

        const menu = document.createElement('div');
        menu.className = 'inner-action-menu';
        menu.style = `
            position: fixed; background: #111; border: 1px solid var(--l-main);
            border-radius: 8px; box-shadow: 0 10px 40px rgba(0,0,0,0.8);
            z-index: 2147483647; min-width: 160px; padding: 5px;
            animation: matrix-fade-in 0.1s ease;
            backdrop-filter: blur(15px);
            font-family: var(--l-font);
        `;

        let left = e.clientX + 5;
        let top = e.clientY + 5;
        if (left + 170 > window.innerWidth) left = e.clientX - 170;
        if (top + 200 > window.innerHeight) top = e.clientY - 200;
        menu.style.left = `${left}px`;
        menu.style.top = `${top}px`;

        menu.innerHTML = `
            <div style="font-size:9px; color:#555; padding:5px 10px; border-bottom:1px solid #222; margin-bottom:5px; text-transform:uppercase;">
                Node: ${tableId}_R${rowIndex}
            </div>
            <div class="menu-item" id="act-edit" style="padding:10px 12px; cursor:pointer; font-size:12px; color:#eee; display:flex; align-items:center; gap:10px;">
                <i class="fa-solid fa-pen" style="width:14px; color:var(--l-cyan);"></i> 编辑内容
            </div>
            <div class="menu-item" id="act-edit-card" style="padding:10px 12px; cursor:pointer; font-size:12px; color:#eee; display:flex; align-items:center; gap:10px;">
                <i class="fa-solid fa-edit" style="width:14px; color:var(--l-main);"></i> 整体编辑
            </div>
            <div class="menu-item" id="act-insert" style="padding:10px 12px; cursor:pointer; font-size:12px; color:#eee; display:flex; align-items:center; gap:10px;">
                <i class="fa-solid fa-plus" style="width:14px; color:#2980b9;"></i> 插入新行
            </div>
            <div class="menu-item" id="act-delete" style="padding:10px 12px; cursor:pointer; font-size:12px; color:#e74c3c; display:flex; align-items:center; gap:10px; border-top:1px solid #222;">
                <i class="fa-solid fa-trash" style="width:14px;"></i> 删除整行
            </div>
            <div class="menu-item" id="act-fill" style="padding:10px 12px; cursor:pointer; font-size:12px; color:#c0c0c0; display:flex; align-items:center; gap:10px; margin-top:5px; background:rgba(255,255,255,0.03);">
                <i class="fa-solid fa-pen-nib" style="width:14px;"></i> 填入输入框
            </div>
        `;

        overlay.appendChild(menu);
        document.body.appendChild(overlay);

        const closeMenu = () => overlay.remove();
        overlay.onclick = closeMenu;

        // 编辑内容
        menu.querySelector('#act-edit').onclick = (ev) => {
            ev.stopPropagation();
            closeMenu();
            this.showEditDialog(tableId, rowIndex, colIndex, title, value, showStatusMethod);
        };

        // 整体编辑
        menu.querySelector('#act-edit-card').onclick = (ev) => {
            ev.stopPropagation();
            closeMenu();
            this.showCardEditDialog(tableId, rowIndex, showStatusMethod);
        };

        // 插入新行
        menu.querySelector('#act-insert').onclick = async (ev) => {
            ev.stopPropagation();
            const db = this.getExternalDB();
            if (db && db[tableId]) {
                const sheet = db[tableId];
                const headers = sheet.content[0] || [];
                const sourceRow = sheet.content[rowIndex + 1] || [];
                const headerLen = headers.length || 2;
                
                // 构造新行：初始初始化为“数据未写入”占位符，以维持表格结构的完整性
                const newRow = new Array(headerLen).fill('');
                
                for (let i = 1; i < headerLen; i++) {
                    // 彻底遵循结构初始化：所有定义了标题的列默认填充占位符
                    if (headers[i]) {
                        newRow[i] = '数据未写入';
                    }
                    
                    // 继承逻辑修正：仅当表头明确包含“名”、“类”、“归属”等指示其为分类属性时才进行继承。
                    // 避免像“地区”、“时间”这类具体数值被错误复制。
                    const h = String(headers[i] || '').toLowerCase();
                    const isStructural = h.includes('名') || h.includes('类') || h.includes('属') || h.includes('type') || h.includes('cat');
                    
                    if (i < 3 && isStructural && sourceRow[i] && sourceRow[i] !== '数据未写入') {
                        newRow[i] = sourceRow[i];
                    }
                }
                
                // 复刻原脚本逻辑：首列填充当前 content 长度作为临时 ID (覆盖继承值)
                if (headerLen > 0) {
                    newRow[0] = String(sheet.content.length);
                }

                // 插入逻辑：插在当前点击行的下一行
                sheet.content.splice(rowIndex + 2, 0, newRow);
                await this.saveToDB(db);
                
                const toast = window.toastr || { info: (m) => showStatusMethod?.(m, "var(--l-cyan)") };
                toast.info("已完成结构初始化：固定字段已填充占位符");

                // 重新渲染并直接打开该行的整体编辑界面
                this.render(document.querySelector('.inner-world-container'), null, showStatusMethod);
                
                // 实时同步正文画布
                if (window.UIManager && window.UIManager.injectEmbeddedDashboard) {
                    window.UIManager.injectEmbeddedDashboard();
                }

                setTimeout(() => {
                    this.showCardEditDialog(tableId, rowIndex + 1, showStatusMethod);
                }, 200);
            }
            closeMenu();
        };

        // 删除整行
        menu.querySelector('#act-delete').onclick = async (ev) => {
            ev.stopPropagation();
            if (confirm(`DETECTED_ACTION: 确认将节点 #${rowIndex + 1} 从当前矩阵中抹除吗？`)) {
                const db = this.getExternalDB();
                if (db && db[tableId]) {
                    db[tableId].content.splice(rowIndex + 1, 1);
                    await this.saveToDB(db);
                    
                    const toast = window.toastr || { warning: (m) => showStatusMethod?.(m, "#e74c3c") };
                    toast.warning("目标节点已抹除");
                    
                    this.render(document.querySelector('.inner-world-container'), null, showStatusMethod);

                    // 实时同步正文画布
                    if (window.UIManager && window.UIManager.injectEmbeddedDashboard) {
                        window.UIManager.injectEmbeddedDashboard();
                    }
                }
            }
            closeMenu();
        };

        // 获取填入按键逻辑
        menu.querySelector('#act-fill').onclick = (ev) => {
            ev.stopPropagation();
            const w = window.parent || window;
            const ta = w.document.getElementById('send_textarea');
            if (ta) {
                ta.value = (ta.value || '') + (ta.value ? ' ' : '') + value;
                ta.dispatchEvent(new Event('input', { bubbles: true }));
                ta.focus();
                
                const toast = window.toastr || { success: (m) => showStatusMethod?.(m, "var(--l-cyan)") };
                toast.success("内容已提取至输入终端");
            }
            closeMenu();
        };
    },

    /**
     * 显示快捷详情气泡 (非全屏，悬浮在点击位置附近)
     */
    showQuickBubble(e, tableId, rowIndex, colIndex, title, value, showStatusMethod) {
        document.querySelectorAll('.inner-action-menu-overlay').forEach(el => el.remove());

        const overlay = document.createElement('div');
        overlay.className = 'inner-action-menu-overlay';
        overlay.style = `position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: transparent; z-index: 2147483640;`;

        const bubble = document.createElement('div');
        bubble.className = 'inner-quick-bubble';
        bubble.style = `
            position: absolute; width: 220px; background: #0a0a0a; border: 1px solid var(--l-main);
            border-radius: 8px; box-shadow: 0 10px 30px rgba(0,0,0,0.8); padding: 12px;
            z-index: 2147483641; animation: matrix-pop 0.2s ease; font-family: var(--l-font);
            max-height: 300px; overflow-y: auto; custom-scrollbar;
        `;

        let left = e.clientX + 10;
        let top = e.clientY + 10;
        if (left + 220 > window.innerWidth) left = e.clientX - 230;
        if (top + 200 > window.innerHeight) top = e.clientY - 210;
        bubble.style.left = `${left}px`;
        bubble.style.top = `${top}px`;

        const db = this.getExternalDB();
        const table = db ? db[tableId] : null;
        let detailsHtml = '';

        if (table && table.content[rowIndex + 1]) {
            const headers = table.content[0];
            const row = table.content[rowIndex + 1];
            detailsHtml = row.map((cell, i) => {
                if (i === 0 || !cell || cell === '0' || cell === '-' || cell === '数据未写入') return '';
                return `
                    <div style="margin-bottom:6px; border-bottom:1px solid rgba(255,255,255,0.03); padding-bottom:4px;">
                        <div style="font-size:9px; color:#666; font-weight:bold;">${headers[i] || `ATTR_${i}`}</div>
                        <div style="font-size:11px; color:#fff; word-break:break-all;">${cell}</div>
                    </div>
                `;
            }).filter(h => h).join('');
        } else {
            detailsHtml = `<div style="font-size:11px; color:#fff;">${value}</div>`;
        }

        bubble.innerHTML = `
            <div style="font-size:10px; color:var(--l-main); margin-bottom:10px; font-weight:bold; border-bottom:1px solid var(--l-main); padding-bottom:5px; text-transform:uppercase;">
                <i class="fa-solid fa-circle-info"></i> NODE_DETAIL: ${title}
            </div>
            <div style="max-height:240px; overflow-y:auto;">
                ${detailsHtml}
            </div>
            <div style="margin-top:10px; text-align:right;">
                <button id="act-jump" style="background:rgba(255,255,255,0.05); border:1px solid #333; color:#999; font-size:9px; padding:2px 8px; border-radius:4px; cursor:pointer; transition:all 0.2s;">前往表格</button>
            </div>
        `;

        overlay.appendChild(bubble);
        document.body.appendChild(overlay);

        const close = () => overlay.remove();
        overlay.onclick = close;
        bubble.onclick = (ev) => ev.stopPropagation();
        
        bubble.querySelector('#act-jump').onclick = () => {
            this.activeTableId = tableId;
            const container = document.querySelector('.inner-world-container');
            if (container) this.render(container, null, showStatusMethod);
            close();
        };
    },

    /**
     * 单个单元格编辑对话框
     */
    showEditDialog(tableId, rowIndex, colIndex, title, value, showStatusMethod) {
        this.showDataPopup(`编辑属性: ${title}`, `
            <textarea id="edit-cell-content" style="width:100%; height:140px; background:#000; color:#fff; border:1px solid var(--l-cyan); padding:10px; font-size:12px; border-radius:4px; outline:none; font-family:inherit; box-sizing:border-box;">${value}</textarea>
        `, showStatusMethod, async () => {
            const newVal = document.getElementById('edit-cell-content').value;
            const db = this.getExternalDB();
            if (db && db[tableId] && db[tableId].content[rowIndex + 1]) {
                db[tableId].content[rowIndex + 1][colIndex] = newVal;
                await this.saveToDB(db);
                showStatusMethod?.("属性同步成功", "var(--l-cyan)");
                this.render(document.querySelector('.inner-world-container'), null, showStatusMethod);
                
                // 实时同步正文画布
                if (window.UIManager && window.UIManager.injectEmbeddedDashboard) {
                    window.UIManager.injectEmbeddedDashboard();
                }
            }
        });
    },

    /**
     * 整行卡片编辑对话框
     */
    showCardEditDialog(tableId, rowIndex, showStatusMethod) {
        const db = this.getExternalDB();
        if (!db || !db[tableId]) return;
        
        const headers = db[tableId].content[0] || [];
        const row = db[tableId].content[rowIndex + 1];
        if (!row) return;

        // 根据用户要求，彻底屏蔽 ID/UUID/序号等辅助字段，且从第2列(索引1)开始展示以避免 Column_0
        const junkKeywords = ['id', 'uuid', '__v', '序号', 'index', 'idx', 'column', '字段'];

        let itemsHtml = row.map((cell, i) => {
            // 彻底屏蔽第一列 (通常为内部 ID)
            if (i === 0) return '';
            
            const header = headers[i];
            const headerStr = String(header || '').toLowerCase();
            
            // 过滤辅助性或垃圾字段
            if (junkKeywords.some(k => headerStr.includes(k))) return '';

            // 如果表头确实为空，使用一个简洁的占位符，而不是 Column_X
            const displayHeader = header || `未定义属性_${i}`;

            return `
                <div style="margin-bottom:12px;">
                    <div style="font-size:10px; color:#666; margin-bottom:4px; font-family:'Share Tech Mono'; font-weight:bold; letter-spacing:0.5px;">[ ${displayHeader} ]</div>
                    <textarea class="card-edit-field" data-idx="${i}" 
                        style="width:100%; height:55px; background:rgba(0,0,0,0.6); color:#eee; border:1px solid rgba(255,255,255,0.1); padding:10px; border-radius:4px; font-size:12px; outline:none; box-sizing:border-box; font-family:inherit; transition:all 0.2s;" 
                        onfocus="this.style.borderColor='var(--l-main)'; this.style.background='#000';" 
                        onblur="this.style.borderColor='rgba(255,255,255,0.1)'; this.style.background='rgba(0,0,0,0.6)';"
                    >${row[i] || ''}</textarea>
                </div>
            `;
        }).filter(item => item).join('');

        this.showDataPopup(`整体重构: 节点_${rowIndex + 1}`, `
            <div style="max-height:50vh; overflow-y:auto; padding-right:8px; custom-scrollbar;">
                <div style="font-size:10px; color:rgba(255,255,255,0.3); margin-bottom:15px; border-left:2px solid var(--l-main); padding-left:10px; font-style:italic;">
                    正在对索引 #${rowIndex + 1} 的多维数据执行矩阵改写。
                </div>
                ${itemsHtml}
            </div>
        `, showStatusMethod, async () => {
            const textareas = document.querySelectorAll('.card-edit-field');
            textareas.forEach(ta => {
                const idx = parseInt(ta.dataset.idx);
                row[idx] = ta.value;
            });
            await this.saveToDB(db);
            
            const toast = window.toastr || { info: (m) => showStatusMethod?.(m, "var(--l-main)") };
            toast.info("数据矩阵重组完毕");
            
            this.render(document.querySelector('.inner-world-container'), null, showStatusMethod);
            
            // 实时同步正文画布
            if (window.UIManager && window.UIManager.injectEmbeddedDashboard) {
                window.UIManager.injectEmbeddedDashboard();
            }
        });
    },

    /**
     * 保存数据到外部数据库
     */
    async saveToDB(tableData) {
        const w = window.parent || window;
        const api = w.AutoCardUpdaterAPI || window.AutoCardUpdaterAPI;
        if (api && api.importTableAsJson) {
            return await api.importTableAsJson(JSON.stringify(tableData));
        }
        return false;
    },

    /**
     * 显示数据详情弹窗 (Body Append, 高 z-index 以解决遮挡)
     */
    showDataPopup(title, contentHtml, showStatusMethod, onConfirm = null) {
        document.querySelectorAll('.inner-data-popup-overlay').forEach(el => el.remove());

        const overlay = document.createElement('div');
        overlay.className = 'inner-data-popup-overlay';
        overlay.style = `
            position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
            background: rgba(0,0,0,0.85); backdrop-filter: blur(12px);
            display: flex; align-items: center; justify-content: center;
            z-index: 2147483648; animation: matrix-fade-in 0.2s ease;
        `;

        const card = document.createElement('div');
        card.style = `
            background: #0a0a0a; border: 1px solid var(--l-main);
            border-radius: 12px; padding: 22px; width: 360px;
            max-height: 90%; display: flex; flex-direction: column; 
            box-shadow: 0 30px 100px rgba(0,0,0,1);
            position: relative; animation: matrix-pop 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
            box-sizing: border-box;
        `;

        card.innerHTML = `
            <div style="color:var(--l-main); font-size:13px; font-weight:bold; margin-bottom:18px; border-bottom:1px solid rgba(255,0,85,0.4); padding-bottom:12px; display:flex; justify-content:space-between; align-items:center;">
                <span style="letter-spacing:1px; text-transform:uppercase;"><i class="fa-solid fa-bolt"></i> ACCESS_CONSOLE // ${title}</span>
                <i class="fa-solid fa-xmark" id="close-pop" style="cursor:pointer; font-size:20px; transition:color 0.2s;" onmouseover="this.style.color='#fff'" onmouseout="this.style.color='var(--l-main)'"></i>
            </div>
            <div style="flex:1; overflow-y:auto; color:#eee; font-size:12px; line-height:1.7; font-family:'Share Tech Mono', sans-serif; padding-right:10px;">
                ${contentHtml}
            </div>
            <div style="margin-top:25px; display:flex; gap:12px; flex-shrink:0;">
                <button class="tool-btn" id="pop-confirm-btn" style="flex:1.5; font-size:11px; height:38px; font-weight:bold; ${onConfirm ? '' : 'display:none;'} background:var(--l-main); color:#fff; border:none; cursor:pointer; border-radius:4px; letter-spacing:1px;">EXECUTE_SYNC</button>
                <button class="tool-btn" id="pop-close-btn" style="flex:1; font-size:11px; height:38px; background:transparent; border:1px solid #333; color:#777; cursor:pointer; border-radius:4px; letter-spacing:1px;">TERMINATE</button>
            </div>
        `;

        overlay.appendChild(card);
        document.body.appendChild(overlay);

        const close = () => overlay.remove();
        overlay.querySelector('#close-pop').onclick = close;
        overlay.querySelector('#pop-close-btn').onclick = close;
        
        const confirmBtn = overlay.querySelector('#pop-confirm-btn');
        if (confirmBtn) {
            confirmBtn.onclick = async () => {
                confirmBtn.disabled = true;
                confirmBtn.style.opacity = '0.5';
                confirmBtn.innerText = 'SYNCING...';
                if (onConfirm) await onConfirm();
                close();
            };
        }

        overlay.onclick = (e) => { if (e.target === overlay) close(); };
    },

    /**
     * 核心逻辑: 将汇总的数据同步到 SillyTavern 角色变量
     */
    async syncToSillyTavern(externalData) {
        if (!externalData) return { count: 0 };
        
        let count = 0;
        const protoTables = this.findAllTablesByKeywords(externalData, this.tableMapping.protagonist);
        const skillTables = this.findAllTablesByKeywords(externalData, this.tableMapping.skills);
        
        let allVars = [];
        [...protoTables, ...skillTables].forEach(t => {
            const info = this.extractTableInfo(t, 30);
            if (info) allVars.push(...info);
        });

        // 获取 ST 执行命令接口 (尝试多种链路)
        const w = window.parent || window;
        const executeCmd = w.executeSlashCommandsWithOptions || 
                           w.SillyTavern?.getContext?.()?.executeSlashCommandsWithOptions;

        if (!executeCmd) {
            console.warn('[Lilith] SillyTavern executeSlashCommandsWithOptions not found.');
            return { count: 0 };
        }

        for (const it of allVars) {
            if (it.key && it.value && it.value !== '-' && it.key.length < 20) {
                // 仅同步看起来像变量的简短内容
                if (it.value.length < 100 && !it.key.includes(' ') && !it.key.includes('|')) {
                    await executeCmd(`/setvar ${it.key} ${it.value}`);
                    count++;
                }
            }
        }

        return { count };
    },

    /**
     * 获取用于 AI 提示词注入的文本上下文
     */
    getPromptContext() {
        if (!userState.injectDashboard) return "";
        
        const db = this.getExternalDB();
        if (!db) return "";

        let context = "\n[Virtual Void Core / Linked Data Tables]:\n";
        let hasData = false;

        const tableIds = Object.keys(db).filter(id => 
            id && id !== 'meta' && id !== 'null' && id !== 'undefined' && 
            db[id] && db[id].content && db[id].content.length > 0
        );

        if (tableIds.length === 0) return "";

        // 仅导出前 5 个最相关的表格防止上下文太长
        tableIds.slice(0, 5).forEach(id => {
            const table = db[id];
            const name = table.name || id;
            context += `### Table: ${name}\n`;
            
            // 限制行数防止 Token 溢出 (表头 + 前 8 行)
            const rows = table.content.slice(0, 9); 
            if (rows.length > 0) {
                const headers = rows[0];
                const alignment = headers.map(() => '---');
                context += `| ${headers.join(' | ')} |\n`;
                context += `| ${alignment.join(' | ')} |\n`;
                
                rows.slice(1).forEach(row => {
                    context += `| ${row.map(c => String(c === null || c === undefined ? '' : c).replace(/\|/g, '\\|')).join(' | ')} |\n`;
                });
                context += "\n";
                hasData = true;
            }
        });

        return hasData ? context : "";
    },

    /**
     * 获取全域链路概览文本 (用于 AI 注入)
     */
    getSummaryContext() {
        if (!userState.injectDashboard) return "";
        
        const db = this.getExternalDB();
        if (!db) return "";

        const slots = [
            { title: 'Protagonist Status', kw: this.tableMapping.protagonist, rule: 'kv' },
            { title: 'World Environment', kw: this.tableMapping.global, rule: 'kv' },
            { title: 'Active Characters', kw: this.tableMapping.characters, rule: 'capsule', preferredCol: 1 },
            { title: 'Skills/Abilities', kw: this.tableMapping.skills, rule: 'capsule', preferredCol: 1 },
            { title: 'Inventory/Items', kw: this.tableMapping.inventory, rule: 'capsule', preferredCol: 1 },
            { title: 'Current Tasks', kw: this.tableMapping.tasks, rule: 'capsule', preferredCol: 1 }
        ];

        let summary = "\n[OMNI-LINK: CORE DATA SUMMARY]\n";
        summary += "The following is a real-time synchronized summary of the current story state (World/Character/Inventory). ";
        summary += "Please use this information as the absolute ground truth for your roleplay and logic.\n\n";

        let hasData = false;

        slots.forEach(slot => {
            let targetId = null;
            // 按优先级寻找匹配表格
            for (const k of slot.kw) {
                targetId = Object.keys(db).find(id => {
                    const tableName = (db[id]?.name || id).toLowerCase();
                    const key = k.toLowerCase();
                    return tableName === key || tableName === key + '表' || tableName === key + '表格';
                });
                if (targetId) break;
            }
            if (!targetId) {
                for (const k of slot.kw) {
                    targetId = Object.keys(db).find(id => {
                        const tableName = (db[id]?.name || id).toLowerCase();
                        return tableName.includes(k.toLowerCase());
                    });
                    if (targetId) break;
                }
            }
            
            if (targetId && db[targetId]) {
                const info = this.extractByRule(db[targetId], targetId, slot.rule, 15, [], slot.preferredCol);
                if (info && info.length > 0) {
                    hasData = true;
                    summary += `### ${slot.title}:\n`;
                    if (slot.rule === 'kv') {
                        summary += info.map(i => `- ${i.key}: ${i.value}`).join('\n') + "\n";
                    } else {
                        summary += `- [Content]: ${info.map(i => i.value).join(', ')}\n`;
                    }
                }
            }
        });

        summary += "\n[INSTRUCTION]: Incorporate these details naturally. Do not explicitly mention 'System Labels' unless requested.\n";
        
        return hasData ? summary : "";
    }
};