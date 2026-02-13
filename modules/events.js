// modules/events.js
import { UIManager } from './ui_manager.js';
import { assistantManager } from './assistant_manager.js';
import { userState } from './storage.js';
import { AudioSys } from './audio.js';
import { extractContent } from './utils.js';
import { InnerWorldManager } from './inner_world_manager.js';

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
                        // Delay slightly to ensure DOM is ready
                        setTimeout(() => {
                            let el = null;
                            if (typeof messageId === 'number' && !Number.isNaN(messageId)) {
                                el = document.querySelector(`div.mes[mesid="${messageId}"]`);
                            }
                            // Fallback to last message if id not found
                            if (!el) {
                                const allMes = document.querySelectorAll('.mes');
                                if (allMes.length > 0) el = allMes[allMes.length - 1];
                            }
                            if (el) UIManager.applyLilithFormatting(el);
                            // 注入全域看板
                            if (!UIManager.isLocked) UIManager.injectEmbeddedDashboard();
                        }, 100);
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

                // 确保新生成结束后刷新看板位置及数据
                const innerContainer = document.querySelector('.inner-world-container');
                if (innerContainer) {
                    InnerWorldManager.render(innerContainer, UIManager.showBubble.bind(UIManager), UIManager.showStatusChange.bind(UIManager));
                }
                UIManager.injectEmbeddedDashboard();

                const lastMsg = currentChat[currentChat.length - 1];
                if (!lastMsg) return;

                // Update Lilith's expression based on the AI's response (Optimized via Regex if enabled)
                if (!lastMsg.is_user && !lastMsg.is_system && lastMsg.mes) {
                    const optimizedContent = extractContent(lastMsg.mes, userState);
                    UIManager.updateAvatarExpression(optimizedContent);
                }

                const messageId = lastMsg.message_id || lastMsg.mesid || (currentChat.length - 1);

                // Conditions for interjection
                if (!lastMsg.is_user && !lastMsg.is_system && lastMsg.mes && !lastMsg.mes.includes('[莉莉丝]')) {
                    const freq = (typeof userState.commentFrequency === 'number') ? userState.commentFrequency : 30;
                    
                    console.log(`[Lilith] Interjection check: freq=${freq}, roll...`);
                    
                    if (Math.random() * 100 < freq) {
                        console.log('[Lilith] Random interjection triggered.');
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

            // 3. Before Combine Prompts (Cleanup Lilith content from AI prompt)
            eventSource.on(event_types.GENERATE_BEFORE_COMBINE_PROMPTS, (data) => {
                if (data && data.chat) {
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
                if (UIManager.isLocked) return; // [锁定策略] 锁定期间停止DOM扫描
                let shouldInject = false;
                mutations.forEach(mutation => {
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
                        const target = mutation.target.closest ? mutation.target.closest('.mes') : (mutation.target.parentElement?.closest ? mutation.target.parentElement.closest('.mes') : null);
                        if (target && target === document.querySelector('.mes:last-child')) {
                            shouldInject = true;
                        }
                    }
                });

                if (shouldInject) {
                    if (this._dashTimeout) clearTimeout(this._dashTimeout);
                    this._dashTimeout = setTimeout(() => UIManager.injectEmbeddedDashboard(), 200);
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
