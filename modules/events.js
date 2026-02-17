// modules/events.js
import { UIManager } from './ui_manager.js';
import { assistantManager } from './assistant_manager.js';
import { userState } from './storage.js';
import { AudioSys } from './audio.js';
import { extractContent } from './utils.js';
import { InnerWorldManager } from './inner_world_manager.js';
import { EntityManager } from './entity_manager.js';

/**
 * Handles all SillyTavern system events and DOM mutation observers.
 */
export const EventManager = {
    init() {
        console.log('[Lilith] Initializing Event Manager...');
        try {
            const context = SillyTavern.getContext();
            const { eventSource, event_types } = context;
            
            if (!eventSource || !event_types) {
                console.error('[Lilith] SillyTavern Event API not found!');
                return;
            }

            // 1. Message Rendering Hooks (Lilith Message Formatting)
            const renderEvents = [
                event_types.CHARACTER_MESSAGE_RENDERED,
                event_types.USER_MESSAGE_RENDERED,
                event_types.MESSAGE_UPDATED,
                'message_rendered'
            ];

            renderEvents.forEach(evt => {
                if (evt) {
                    eventSource.on(evt, (messageId) => {
                        // 稳定性补丁：当消息刷新时，同时扫描当前指定消息和周围消息
                        setTimeout(() => {
                            let el = null;
                            if (typeof messageId === 'number' && !Number.isNaN(messageId)) {
                                el = document.querySelector(`div.mes[mesid="${messageId}"]`);
                            } else if (typeof messageId === 'string') {
                                // 尝试通过 ID 属性查找
                                el = document.getElementById(`mes-${messageId}`) || document.querySelector(`div.mes[message_id="${messageId}"]`);
                            }

                            // 如果找到了特定消息，立即在它及它之后的消息应用美化（防止注入偏移）
                            if (el) {
                                UIManager.applyLilithFormatting(el);
                                // 同时检查相邻的，以防止酒馆渲染器把多个消息搅乱
                                const next = el.nextElementSibling;
                                if (next && next.classList.contains('mes')) UIManager.applyLilithFormatting(next);
                            } else {
                                // 保底规则：如果找不到 ID，全量扫描一遍最后三条消息
                                const allMes = document.querySelectorAll('.mes');
                                for (let i = Math.max(0, allMes.length - 3); i < allMes.length; i++) {
                                    UIManager.applyLilithFormatting(allMes[i]);
                                }
                            }

                            if (!UIManager.isLocked) UIManager.injectEmbeddedDashboard();
                        }, 200); // 增加延迟以对抗异步渲染
                    });
                }
            });

            // Initial full scan for existing messages
            setTimeout(() => {
                if (UIManager.isLocked) return;
                console.log('[Lilith] Scanning initial messages...');
                document.querySelectorAll('.mes').forEach(el => UIManager.applyLilithFormatting(el));
                UIManager.injectEmbeddedDashboard();
            }, 1000);

            // 2. Generation Ended Hook (AI Interjection / Commenting)
            eventSource.on(event_types.GENERATION_ENDED, async () => {
                if (UIManager.isLocked) return; // [锁定策略] 锁定期间停止响应
                const currentChat = SillyTavern.getContext().chat;
                if (!currentChat || currentChat.length === 0) return;

                const lastMsg = currentChat[currentChat.length - 1];
                if (!lastMsg) return;

                const messageId = lastMsg.message_id || lastMsg.mesid || (currentChat.length - 1);

                // [实体化] 处理奖励与任务标签 (增强版：自动监控提取数值)
                let statsChanged = false;
                if (lastMsg.mes) {
                    const oldFav = userState.favorability;
                    const oldSan = userState.sanity;
                    await EntityManager.processTags(lastMsg.mes, messageId);
                    if (oldFav !== userState.favorability || oldSan !== userState.sanity) {
                        statsChanged = true;
                    }
                }

                // 确保新生成结束后刷新看板位置及数据
                const innerContainer = document.querySelector('.inner-world-container');
                if (innerContainer) {
                    InnerWorldManager.render(innerContainer, UIManager.showBubble.bind(UIManager), UIManager.showStatusChange.bind(UIManager));
                    
                    // 如果数值有变动，额外展示一个状态变化提示
                    if (statsChanged && typeof UIManager.showStatusChange === 'function') {
                        // 简易逻辑：在控制台已打印，这里确保 UI 刷新即可
                    }
                }
                UIManager.injectEmbeddedDashboard();

                // Update Lilith's expression based on the AI's response (Optimized via Regex if enabled)
                if (!lastMsg.is_user && !lastMsg.is_system && lastMsg.mes) {
                    const optimizedContent = extractContent(lastMsg.mes, userState);
                    UIManager.updateAvatarExpression(optimizedContent);
                }

                // Conditions for interjection
                if (!lastMsg.is_user && !lastMsg.is_system && lastMsg.mes && !lastMsg.mes.includes('[莉莉丝]')) {
                    const freq = (typeof userState.commentFrequency === 'number') ? userState.commentFrequency : 30;
                    
                    console.log(`[Lilith] Interjection check: freq=${freq}, roll...`);
                    
                    if (Math.random() * 100 < freq) {
                        console.log('[Lilith] Random interjection triggered.');
                        // [IMPORTANT] triggerRealtimeComment handles its own internal UI refresh and formatting.
                        // Do not change this unless you are re-writing the refresh logic in assistant_manager.js.
                        setTimeout(() => assistantManager.triggerRealtimeComment(messageId), 1500);
                    } else {
                        console.log('[Lilith] Random interjection rolled skip.');
                    }
                } else {
                    console.log('[Lilith] Interjection conditions not met:', {
                        is_user: lastMsg.is_user,
                        is_system: lastMsg.is_system,
                        has_mes: !!lastMsg.mes,
                        already_has_tag: lastMsg.mes?.includes('[莉莉丝]')
                    });
                }
            });

            // 2.5 Character Selection Hook (Auto-Inject Worldbook)
            eventSource.on(event_types.CHARACTER_SELECTED, () => {
                console.log('[Lilith] Character selected, updating worldbook...');
                if (userState.entityEnabled) {
                    setTimeout(() => EntityManager.updateWorldbook(), 1000);
                }
            });

            // 3. Before Combine Prompts (Cleanup Lilith content from AI prompt)
            eventSource.on(event_types.GENERATE_BEFORE_COMBINE_PROMPTS, (data) => {
                if (!data) return;

                // [实体化增强] 在角色定义之前插入实体化系统 prompt
                if (userState.entityEnabled) {
                    try {
                        const materialContent = EntityManager.lastMaterializationContent;
                        if (materialContent) {
                            const injectionPrefix = `### LILITH_ENTITY_SYSTEM_INJECTION ###\n${materialContent}\n### END_OF_LILITH_ENTITY_SYSTEM ###\n\n`;
                            
                            // 插入到角色描述 (description) 的最前面
                            const originalDescription = data.description || "";
                            data.description = injectionPrefix + originalDescription;

                            // [自动检测] 验证注入是否成功
                            if (data.description.startsWith(injectionPrefix)) {
                                console.log('[Lilith] Prompt injection successful (Entity Materialization)');
                                UIManager.showBubble("莉莉丝系统实体化：已精准注入核心定义之前", "#00ff88");
                            } else {
                                console.warn('[Lilith] Prompt injection failed: startsWith verification failed');
                                UIManager.showBubble("莉莉丝实体化注入可能失败，请检查设置！", "#ff0055");
                            }
                        } else {
                            // 内容为空，可能是还没初始化，尝试调用一次强制更新 (虽然它是异步的，但可能下次就好)
                            console.warn('[Lilith] Entity content is empty during prompt generation.');
                            EntityManager.updateWorldbook();
                            UIManager.showBubble("实体化内容初始化中，本次注入跳过", "#ffaa00");
                        }
                    } catch (err) {
                        console.error('[Lilith] Entity prompt injection error:', err);
                        UIManager.showBubble("实体化注入过程发生异常！", "#ff0055");
                    }
                }

                // 继续原有的清理逻辑
                if (data.chat) {
                    data.chat.forEach(msg => {
                        if (msg.mes && msg.mes.includes('[莉莉丝]')) {
                            // Strip [Lilith] comments so AI doesn't see its own previous interjections as part of the character's core response
                            msg.mes = msg.mes.replace(/\[莉莉丝\][\s\S]*?(?=\n\n|$)/g, '').trim();
                        }
                    });
                }
            });

            // 5. Database Update Listener (ACU Sync)
            window.addEventListener('acu:data_updated', () => {
                if (UIManager.isLocked) return; // [锁定策略] 锁定期间停止UI刷新
                console.log('[Lilith] Global Database Update Detected -> Refreshing UI');
                
                // 刷新主控制窗 (如果开启)
                const innerContainer = document.querySelector('.inner-world-container');
                if (innerContainer) {
                    InnerWorldManager.render(innerContainer, UIManager.showBubble.bind(UIManager), UIManager.showStatusChange.bind(UIManager));
                }
                
                // 刷新全域链路概览
                UIManager.injectEmbeddedDashboard();
            });

            // 4. MutationObserver for dynamic message loading & Dashboard Persistence
            const chatObserver = new MutationObserver((mutations) => {
                let shouldInject = false;
                
                // [优化拦截] 识别我们的 UI 变动函数
                const isOurUI = (node) => {
                    if (!node || node.nodeType !== 1) return false;
                    return node.classList.contains('lilith-embedded-dashboard-container') || 
                           node.classList.contains('lilith-embedded-dash') ||
                           node.closest?.('.lilith-embedded-dashboard-container');
                };

                mutations.forEach(mutation => {
                    // 1. 如果变动目标本身属于我们的面板，直接忽略
                    const targetNode = mutation.target.nodeType === 3 ? mutation.target.parentElement : mutation.target;
                    if (isOurUI(targetNode)) return;

                    // 2. 如果是 childList 变动，检查新增或删除的节点是否全是我们自己的东西
                    if (mutation.type === 'childList') {
                        const hasOthers = (nodes) => Array.from(nodes).some(n => !isOurUI(n));
                        if (mutation.addedNodes.length > 0 && !hasOthers(mutation.addedNodes)) return;
                        if (mutation.removedNodes.length > 0 && !hasOthers(mutation.removedNodes)) return;
                    }

                    mutation.addedNodes.forEach(node => {
                        if (node.nodeType === 1) {
                            if (node.classList.contains('mes')) {
                                UIManager.applyLilithFormatting(node);
                                shouldInject = true;
                            } else {
                                const mesElem = node.querySelector('.mes');
                                if (mesElem) {
                                    UIManager.applyLilithFormatting(mesElem);
                                    shouldInject = true;
                                }
                            }
                        }
                    });

                    // 如果消息内容变化（例如在流式传输或被其他脚本修改），确保链路概览还在
                    if (mutation.type === 'characterData' || mutation.type === 'childList') {
                        const target = targetNode?.closest ? targetNode.closest('.mes') : null;
                        if (target && target === document.querySelector('.mes:last-child')) {
                            shouldInject = true;
                        }
                    }
                });

                if (shouldInject) {
                    // 稳定性优化：增加防抖时间。在流式传输期间，频繁的 DOM 变动不需要实时跟随。
                    // 500ms 的延迟足以让大多数渲染平滑进行。
                    if (this._dashTimeout) clearTimeout(this._dashTimeout);
                    this._dashTimeout = setTimeout(() => UIManager.injectEmbeddedDashboard(), 500);
                }
            });
            const chatContainer = document.getElementById('chat');
            if (chatContainer) {
                chatObserver.observe(chatContainer, { childList: true, subtree: true, characterData: true });
            }

            // 5. Global Message Card Clicks (Replay Audio)
            $(document).on('click', '.lilith-chat-ui', function() {
                // 优先查找正文文本，如果没找到则查找通用文本类，最后取整个容器文本
                const text = $(this).find('.l-speech-text').text() || $(this).find('.lilith-chat-text').text() || $(this).text();
                if (text) {
                    // 清理一些符号和标签
                    const cleanText = text.replace(/🩸|💭|\*/g, '').trim();
                    if (cleanText) AudioSys.speak(cleanText);
                }
            });

        } catch (e) {
            console.error('[Lilith] Event registration failed:', e);
        }
    }
};
