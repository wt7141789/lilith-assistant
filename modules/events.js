// modules/events.js
import { UIManager } from './ui_manager.js';
import { assistantManager } from './assistant_manager.js';
import { userState } from './storage.js';
import { AudioSys } from './audio.js';

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
                        }, 100);
                    });
                }
            });

            // Initial full scan for existing messages
            setTimeout(() => {
                console.log('[Lilith] Scanning initial messages...');
                document.querySelectorAll('.mes').forEach(el => UIManager.applyLilithFormatting(el));
            }, 1000);

            // 2. Generation Ended Hook (AI Interjection / Commenting)
            eventSource.on(event_types.GENERATION_ENDED, async () => {
                const currentChat = SillyTavern.getContext().chat;
                if (!currentChat || currentChat.length === 0) return;

                const lastMsg = currentChat[currentChat.length - 1];
                if (!lastMsg) return;

                // Update Lilith's expression based on the AI's response
                if (!lastMsg.is_user && !lastMsg.is_system && lastMsg.mes) {
                    UIManager.updateAvatarExpression(lastMsg.mes);
                }

                const messageId = lastMsg.message_id || lastMsg.mesid || (currentChat.length - 1);

                // Conditions for interjection
                if (!lastMsg.is_user && !lastMsg.is_system && lastMsg.mes && !lastMsg.mes.includes('[莉莉丝]')) {
                    const freq = userState.commentFrequency || 50;
                    if (Math.random() * 100 < freq) {
                        console.log('[Lilith] Random interjection triggered.');
                        setTimeout(() => assistantManager.triggerRealtimeComment(messageId), 1500);
                    }
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

            // 4. MutationObserver for dynamic message loading (Fallback)
            const chatObserver = new MutationObserver((mutations) => {
                mutations.forEach(mutation => {
                    mutation.addedNodes.forEach(node => {
                        if (node.nodeType === 1) {
                            if (node.classList.contains('mes')) {
                                UIManager.applyLilithFormatting(node);
                            } else {
                                const mesElem = node.querySelector('.mes');
                                if (mesElem) UIManager.applyLilithFormatting(mesElem);
                            }
                        }
                    });
                });
            });
            const chatContainer = document.getElementById('chat');
            if (chatContainer) {
                chatObserver.observe(chatContainer, { childList: true, subtree: true });
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
