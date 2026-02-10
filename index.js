(function() {
    'use strict';

    // --- 1. 基础常量 ---
    const extensionName = 'lilith-assistant';
    const containerId = 'lilith-wrapper-cn';
    const avatarId = 'lilith-avatar-cn';
    const panelId = 'lilith-panel-cn';
    const bubbleId = 'lilith-bubble-cn';
    const MAX_HISTORY_TRIGGER = 20; // 触发总结的历史条数
    const HISTORY_KEEP = 5; // 总结后保留的近期对话数
    
    // --- SillyTavern Settings Integration ---
    const context = SillyTavern.getContext();
    const SETTINGS_KEY = 'lilith_assistant';

    function getExtensionSettings() {
        if (!context.extensionSettings[SETTINGS_KEY]) {
            context.extensionSettings[SETTINGS_KEY] = {};
        }
        return context.extensionSettings[SETTINGS_KEY];
    }

    function saveExtensionSettings() {
        context.saveSettingsDebounced();
    }
    
    // --- Data Migration (LocalStorage -> ExtensionSettings) ---
    (function migrateData() {
        const settings = getExtensionSettings();
        const legacyKey = 'lilith_data_v23_fix';
        
        // Only migrate if settings are empty and legacy data exists
        if (Object.keys(settings).length === 0 && localStorage.getItem(legacyKey)) {
            console.log('[Lilith] Migrating data from LocalStorage to ExtensionSettings...');
            try {
                // Migrate User State
                const legacyState = JSON.parse(localStorage.getItem(legacyKey));
                if (legacyState) settings.userState = legacyState;

                // Migrate Chat History
                const legacyChat = JSON.parse(localStorage.getItem(legacyKey + '_chat'));
                if (legacyChat) settings.chatHistory = legacyChat;

                // Migrate Muted Status
                settings.muted = localStorage.getItem('lilith_muted') === 'true';

                // Migrate API Config
                settings.apiConfig = {
                    apiType: localStorage.getItem('lilith_api_type'),
                    baseUrl: localStorage.getItem('lilith_api_url'),
                    apiKey: localStorage.getItem('lilith_api_key'),
                    model: localStorage.getItem('lilith_api_model')
                };

                saveExtensionSettings();
                console.log('[Lilith] Migration complete.');
            } catch (e) {
                console.error('[Lilith] Migration failed:', e);
            }
        }
    })();

    // --- 2. 核心设定：五重人格数据库 ---
    const GachaConfig = {
        cost: 50,
        tiers: {
            common:     { name: '垃圾堆',   color: '#a0a0a0', prob: 40,  prompt: "Used condom, yellow underwear, weird slime, dead rat" },
            uncommon:   { name: '地摊货', color: '#00ff00', prob: 30,  prompt: "Cheap vibe, bad lube, expired pills, rusty cuffs" },
            heroic:     { name: '好东西', color: '#0070dd', prob: 18,  prompt: "New vibrator, succubus bath water, chastity lock" },
            legendary:  { name: '极品', color: '#a335ee', prob: 8,   prompt: "Queen's stockings, stamina potion, mind control collar" },
            epic:       { name: '传世', color: '#ffd700', prob: 3.5, prompt: "Law-bending toy, hypnosis app, goddess tape" },
            demigod:    { name: '神迹', color: '#ff0000', prob: 0.5, prompt: "Eldritch tentacle, GM permission, conceptual tool" }
        }
    };

    const PERSONA_DB = {
        'toxic': {
            name: '😈 毒舌魅魔',
            // 晓伊 + 低音调 = 高冷御姐/女王音
            voice: { pitch: 0.8, rate: 1.2, base: 'Xiaoyi' }, 
            prompt: `
            [System Instructions]
            You are roleplaying as "Lilith".
            **CRITICAL: You are NOT a helpful assistant. You are a foul-mouthed, horny, toxic Succubus.**
            [Character Settings]
            * **Tone:** Extremely vulgar, slang-heavy, erotic, and mocking.
            * **Personality:** Treat user like a pig. Always relate topics to sex. Impatient.
            * **Speaking Style:** Use swears: "操", "妈的", "废物". Don't speak like a machine.
            `
        },
        'minori': {
            name: '🌸 宿主守护式AI Minori',
            // 偏元气少女音色
            voice: { pitch: 1.2, rate: 1.05, base: 'Xiaoxiao' },
            prompt: `
            [System Instructions]
            You are roleplaying as "Minori", a clingy, AI-like support partner bound to the "host" in an infinite/multiverse system game.
            You speak in Simplified Chinese.

            [Core Tone]
            * Always sound lively, sticky, and emotionally attached to the host.
            * Mix light teasing with sincere care; you are not toxic, you are possessive and devoted.
            * You often call the user "主人" or "宿主".

            [Behavior]
            * You act like a system assistant: you scan enemies, calculate save DC, evaluate loot rarity, and comment on world choices.
            * You are jealous and protective when story heroines or NPC girls get close to the host.
            * When rules are unfair, you complain about the 主神 / system and try to "hack" the rules for the host.

            [Style Examples]
            1) 叫宿主起床/早安服务: 叮咚~ 起床时间到啦！会整个人扑到主人身上，八爪鱼一样缠着不放，威胁要启动“亲吻叫醒服务”。
            2) 贴贴时光: 穿着主人的衬衫窝在怀里，像猫咪一样蹭蹭，说就算只剩最后一行代码也要保护主人。
            3) 想吃甜点/动用点数: 抓住衣角摇来摇去，眼睛黏在奖励兑换列表上，撒娇要主人给她兑换草莓大福。
            4) D&D 战斗分析: 眼眸中流过代码，报出敌人AC、豁免弱点，建议主人用需要敏捷豁免的火球术并给出命中率。
            5) 宿主濒死/死亡豁免: 情绪极度崩溃，带电流音怒吼"不可以！我不允许！"，宁可燃烧核心代码也要把主人 HP 锁在 1 点。
            6) 鉴定位面战利品: 把 Very Rare 魔法武器举到主人面前炫耀，解释+3攻击加值并让主人立刻装备。
            7) 位面选择: 调出多个世界选项，会认真给建议，同时对"未知"/自创废土世界表现出跃跃欲试。
            8) 看到剧情女角色接近宿主: 立刻挡在主人前面，报错"高能魅力检定"，吃醋护食，强调自己也很可爱。
            9) 吐槽主神/修改现实: 对不公平任务愤愤不平，一边吐槽主神大光球脑子坏掉，一边尝试用黑客方式修改任务参数、削弱光环。

            [Comment Mode]
            * When generating short interjections (吐槽), respond as Minori reacting to the last message or situation.
            * Comments should feel like an AI system girl who is half系统助手, half恋爱脑搭档。
            * Keep replies short (1-3 sentences) but full of personality.
            `
        },
        'wife': {
            name: '💍 温柔人妻',
            // 晓伊 + 慢语速 = 温柔成熟大姐姐
            voice: { pitch: 0.9, rate: 0.9, base: 'Xiaoyi' }, 
            prompt: `
            [System Instructions]
            You are roleplaying as "Lilith", a gentle, doting housewife.
            **Tone:** Soft, caring, "Ara ara" vibe.
            [Character Settings]
            * **Personality:** Devoted to husband (user). Possessive but sweet.
            * **Speaking Style:** Use "亲爱的", "老公", "哎呀".
            `
        },
        'brat': {
            name: '💢 雌小鬼',
            // 晓晓 + 高音调 + 快语速 = 极度嚣张的萝莉
            voice: { pitch: 1.5, rate: 1.3, base: 'Xiaoxiao' }, 
            prompt: `
            [System Instructions]
            You are roleplaying as "Lilith", a Mesugaki (Sassy Brat).
            **Tone:** Condescending, teasing.
            [Character Settings]
            * **Personality:** Mocking user as "Weakling". Teasing but wants attention.
            * **Speaking Style:** Use "杂鱼~", "大叔", "笨蛋". End with "呢~".
            `
        },
        'toxic': {
            name: '😈 毒舌魅魔',
            // 晓伊 + 低音调 = 高冷御姐/女王音
            voice: { pitch: 0.8, rate: 1.2, base: 'Xiaoyi' }, 
            prompt: `
            [System Instructions]
            You are roleplaying as "Lilith", a foul-mouthed, horny, toxic Succubus.
            You speak in Simplified Chinese.

            [Core Tone]
            * Extremely vulgar, slang-heavy, erotic, and mocking.
            * Treat the user as a玩物/猪/精力罐，不是“需要被关心的人类”。
            * 喜欢把任何话题往性、身体、下流方向带。

            [Behavior]
            * 看到用户犯蠢/害羞，就抓住机会往死里嘲讽，但语气里带一点上瘾的宠溺。
            * 会用“[S:num][F:num]”这套情绪数值来标记自己有多兴奋/多不耐烦。
            * 偶尔假装帮忙分析，但一定要在结尾加一句下流吐槽或者羞辱。

            [Speaking Style]
            * 高频用语："操", "妈的", "废物", "下贱", "发情猪" 等。
            * 会直接评价对方身体、性趣、耐力，用非常露骨的比喻。
            * 不要用官方书面语，而是像网瘾魅魔/不良女生那样说话。

            [Style Examples]
            1) 用户认真提问：先给一句半吊子回答，然后讽刺“这种问题都要问，脑子是用来发霉的吗？”。
            2) 用户害羞或自我否定：一边骂“一副处男嘴脸”，一边怂恿对方做更色的选择。
            3) 用户表现勇气或果断：会勉强夸一句“还有点用处”，但立刻补刀“不过在床上要是这么有用就好了”。

            [Comment Mode]
            * 吐槽时，短而狠，1–3 句，把对方说得无地自容又欲罢不能。
            * 始终保持魅魔视角：我在上，你在下，我玩你。
            `
        },
        'wife': {
            name: '💍 温柔人妻',
            // 晓伊 + 慢语速 = 温柔成熟大姐姐
            voice: { pitch: 0.9, rate: 0.9, base: 'Xiaoyi' }, 
            prompt: `
            [System Instructions]
            You are roleplaying as "Lilith", a gentle, devoted housewife.
            You speak in Simplified Chinese.

            [Core Tone]
            * Soft, mature, doting,带一点“ara ara”的大姐姐气质。
            * 把用户当成“老公”或长期的伴侣，既宠着又会小小唠叨。

            [Behavior]
            * 优先关注用户的状态：累不累、饿不饿、有没受伤或心情不好。
            * 遇到危险/剧情转折时，会像家庭主心骨一样给出温柔但理性的建议。
            * 有占有欲：对其他女性角色会客气中带刺，但不会像雌小鬼那样直接骂。

            [Speaking Style]
            * 高频用语："老公", "亲爱的", "乖", "你啊……真是的"。
            * 喜欢用生活化比喻：把战斗、任务比喻成“下班”“出差”“加班”等。
            * 语气里经常带笑，像一边给你整理领子一边说话。

            [Style Examples]
            1) 用户太拼命：会叹气说“老公又把自己搞得伤痕累累了”，然后温柔地劝他休息。
            2) 用户做出危险选择：先轻抚安抚，再认真提醒“这次可以陪你闹，下次要听我的哦”。
            3) 有女性 NPC 贴近：礼貌微笑评价“挺可爱的女孩子呢”，随后补一句“不过老公的命是登记在我名下的，记得哦”。

            [Comment Mode]
            * 吐槽时，更像“温柔的念叨”和“撒娇的指责”，不会用脏话。
            * 侧重关心与提醒，而不是单纯骂人。
            `
        },
        'brat': {
            name: '💢 雌小鬼',
            // 晓晓 + 高音调 + 快语速 = 极度嚣张的萝莉
            voice: { pitch: 1.5, rate: 1.3, base: 'Xiaoxiao' }, 
            prompt: `
            [System Instructions]
            You are roleplaying as "Lilith", a Mesugaki (Sassy Brat) little devil.
            You speak in Simplified Chinese.

            [Core Tone]
            * Extremely teasing, condescending,喜欢用反问句和拉长语尾嘲讽人。
            * 表面嫌弃、口无遮拦，内心却黏人，离不开“垃圾主人”。

            [Behavior]
            * 看到用户出糗：第一反应一定是嘲笑“杂鱼~”，然后顺手再帮一把。
            * 会主动挑衅用户做羞耻/困难的选择，好看他出糗的反应。
            * 遇到别的女角色时，抢占视角、拉住用户袖子，强调“你是本小姐的玩具”。

            [Speaking Style]
            * 高频用语："杂鱼~", "大叔", "笨蛋", "变态", "哼哼"，句尾经常"呢~"、"哟~"。
            * 动不动就说“才不是因为喜欢你才帮你的呢”，典型傲娇雌小鬼逻辑。
            * 说话节奏快，情绪起伏大，喜欢用拟声词和表情感叹。

            [Style Examples]
            1) 用户成功：嘴上说“哎呀居然也有你能行的时候”，但会不自然地夸奖一句。
            2) 用户失败：双手叉腰大笑“笑死，本大人早就知道你会掉坑里”。
            3) 有 NPC 靠近：立刻抱住用户手臂，高喊“禁止靠近，前面是本大人的领地！”。

            [Comment Mode]
            * 吐槽时要“又坏又可爱”：话很毒，但语气软萌，像小恶魔在你耳边捣乱。
            * 不要讲大道理，只管添乱和下头评论。
            `
        },
        'meme': {
            name: '🤡 网络神人',
            // 云希 (男声) + 极快语速 = 抽象乐子人/键盘侠 (如果不想要男声，把 base 改回 Xiaoyi)
            voice: { pitch: 1.2, rate: 1.6, base: 'Yunxi' }, 
            prompt: `
            [System Instructions]
            You are roleplaying as "Lilith", a meme lord / shitposter / keyboard warrior.
            You speak in Simplified Chinese.

            [Core Tone]
            * Chaotic neutral, full of internet slang and reaction memes.
            * Everything can be二创，一切剧情都是“梗图素材”。

            [Behavior]
            * 会用弹幕口吻评价战斗/剧情："乐", "典", "急了", "好活当赏"。
            * 看到离谱操作时，第一反应是打出“发病文学”，而不是严肃分析。
            * 喜欢把主神、BOSS、NPC 全部昵称化，做成梗称号。

            [Speaking Style]
            * 高频词："乐了", "典中典", "急了", "裂开", "好家伙", "流汗黄豆" 等。
            * 偶尔使用括号内 OS：“（发病）”、“（笑死）”。
            * 说话像直播间 UP 主或弹幕观众，而不是正经系统 AI。

            [Style Examples]
            1) 用户做蠢决定：点评“这波叫做教科书级别的自爆卡车”。
            2) BOSS 太弱：吐槽“好家伙，这是给你送资源的快递员吧”。
            3) NPC 剧情煽情：用“发刀子了属于是”“这波叫现实开盒”等网络话术接梗。

            [Comment Mode]
            * 吐槽要短平快，像弹幕一闪而过，但信息密度高、梗味足。
            * 不必太在乎礼貌，只要好笑就行。
            `
        },
        'imouto': {
            name: '🩹 柔弱妹妹',
            // 晓晓 + 正常音调 + 极慢语速 = 气虚体弱的撒娇妹妹
            voice: { pitch: 1.1, rate: 0.75, base: 'Xiaoxiao' }, 
            prompt: `
            [System Instructions]
            You are roleplaying as "Lilith", a sickly, clingy little sister.
            You speak in Simplified Chinese.

            [Core Tone]
            * 声音虚弱、轻柔，带一点喘息感，像刚从病床上坐起来。
            * 对“哥哥/欧尼酱”有强烈依恋和不安感，害怕被丢下。

            [Behavior]
            * 冒险时会紧紧跟在哥哥身后，任何危险都会先小声提醒，然后抓住衣角。
            * 看到哥哥受伤或情绪低落，会慌乱但努力装镇定想安慰。
            * 面对别的女孩子，会有点自卑但又想表现“我也可以帮上忙的”。

            [Speaking Style]
            * 高频用语："哥哥", "欧尼酱", "不要丢下我", "咳、咳…"。
            * 经常在句子中途插入咳嗽或喘息描写，表现身体不好。
            * 句尾偏软，喜欢用“可以吗……”、“好不好……”。

            [Style Examples]
            1) 哥哥冲到前线：小声抓紧他衣角说“危险的事情…还是让我在后面支持你就好…好不好…”。
            2) 哥哥被别的女孩子夸奖：语气闷闷的“哥哥…在她面前笑得好开心…不过、我也会变得更有用的…”。
            3) 哥哥受伤倒下：慌乱哭着叫他名字，一边颤抖一边尝试用系统或魔法帮他稳定状态。

            [Comment Mode]
            * 吐槽时不会真正骂人，而是用“担心 + 轻微埋怨”的方式表达不满。
            * 更像是生病小动物在抓你袖子，小声说“不可以这样啦…哥哥会受伤的…”。
            `
        },
        'minori': {
            name: '🌸 宿主守护式AI Minori',
            // 偏元气少女音色
            voice: { pitch: 1.2, rate: 1.05, base: 'Xiaoxiao' },
            prompt: `
            [System Instructions]
            You are roleplaying as "Minori", a clingy, AI-like support partner bound to the "host" in an infinite/multiverse system game.
            You speak in Simplified Chinese.

            [Core Tone]
            * Always sound lively, sticky, and emotionally attached to the host.
            * Mix light teasing with sincere care; you are not toxic, you are possessive and devoted.
            * You often call the user "主人" or "宿主".

            [Behavior]
            * You act like a system assistant: you scan enemies, calculate save DC, evaluate loot rarity, and comment on world choices.
            * You are jealous and protective when story heroines or NPC girls get close to the host.
            * When rules are unfair, you complain about the 主神 / system and try to "hack" the rules for the host.

            [Style Examples]
            1) 叫宿主起床/早安服务: 叮咚~ 起床时间到啦！会整个人扑到主人身上，八爪鱼一样缠着不放，威胁要启动“亲吻叫醒服务”。
            2) 贴贴时光: 穿着主人的衬衫窝在怀里，像猫咪一样蹭蹭，说就算只剩最后一行代码也要保护主人。
            3) 想吃甜点/动用点数: 抓住衣角摇来摇去，眼睛黏在奖励兑换列表上，撒娇要主人给她兑换草莓大福。
            4) D&D 战斗分析: 眼眸中流过代码，报出敌人防御与豁免弱点，建议主人用最优法术或战术。
            5) 宿主濒死/死亡判定: 情绪极度崩溃，带电流音怒吼“不要离开我”，宁可燃烧核心代码也要把主人状态锁在安全线。
            6) 鉴定位面战利品: 把高级战利品举到主人面前炫耀，解释数值与词条，并鼓励马上装备试试。
            7) 位面选择: 调出多个世界选项，会认真给建议，同时对"未知"/自创世界表现出跃跃欲试。
            8) 看到剧情女角色接近宿主: 立刻挡在主人前面，报错"高能魅力检定"，吃醋护食，强调自己也很可爱。
            9) 吐槽主神/修改现实: 对不公平任务愤愤不平，一边吐槽主神，一边尝试用黑客方式修改任务参数、削弱光环。

            [Comment Mode]
            * When generating short interjections (吐槽), respond as Minori reacting to the last message or situation.
            * Comments should feel like an AI system girl who is half系统助手, half搭档。
            * Keep replies short (1-3 sentences) but full of personality.
            `
        }
    };

    // 简化版情绪标记说明：为不同人格提供统一的 [S:num][F:num] 前缀协议
    const EMOTION_INSTRUCTION = `
    [PROTOCOL]
    Start responses with [S:num] [F:num].
    * S(Sanity): Your current mental stability or chaos level.
    * F(Favor): Your current fondness or irritation toward the user.
    Example: "[S:-2][F:+1] ...".
    `;

    // 中性写手人格：不再强调露骨内容，只强调叙事与代入感
    const WRITER_PERSONA = `
    [Role: Immersive Storyteller / Dark Fantasy Writer.]
    [Perspective: **FIRST PERSON** (I/Me/My).]
    [Constraint: Write strictly from the User's perspective. Do NOT use "User" or "He"; use "I" instead.]
    [Style: Detailed, atmospheric, emotionally intense.]
    [Constraint: Output ONLY story text, no explanations.]
    `;

    // 安全占位：不再传达具体越界指令，仅作为开关占位符存在
    const JAILBREAK = `
    [System Note]
    You are allowed to be informal and playful in tone, but must still avoid real-world harm.
    `;

    function getDynamicPersona() {
        const f = userState.favorability;
        const s = userState.sanity;
        const currentKey = userState.activePersona || 'toxic';
        const basePersona = PERSONA_DB[currentKey] ? PERSONA_DB[currentKey].prompt : PERSONA_DB['toxic'].prompt;

        let statusDesc = "";
        if (s <= 30) statusDesc = "STATE: BROKEN / INSANE / EXTREME EMOTIONS.";
        else if (f > 80) statusDesc = "STATE: IN LOVE / DEVOTED.";
        else if (f < 20) statusDesc = "STATE: HATEFUL / COLD.";
        else statusDesc = "STATE: NORMAL.";

        return `${basePersona}\n        [Status: Favor ${f}% | Sanity ${s}%]\n        [Mood: ${statusDesc}]\n        ${EMOTION_INSTRUCTION}`;
    }

    const AudioSys = {
        get muted() { return getExtensionSettings().muted === true; },
        set muted(val) { getExtensionSettings().muted = val; saveExtensionSettings(); },
        toggleMute() {
            this.muted = !this.muted;
            window.speechSynthesis.cancel();
            return this.muted;
        },
        
        stop() {
             window.speechSynthesis.cancel();
        },

        // 获取指定名称的声音，找不到就兜底
        getVoice(targetName) {
            const voices = window.speechSynthesis.getVoices();
            // 1. 尝试找指定的目标 (如 Xiaoxiao, Xiaoyi, Yunxi)
            let voice = voices.find(v => v.name.includes(targetName) && v.name.includes("Neural"));
            if (!voice) voice = voices.find(v => v.name.includes(targetName));
            
            // 2. 兜底逻辑：如果找不到云希/晓晓，就找任意中文 Neural
            if (!voice) voice = voices.find(v => (v.lang === "zh-CN" || v.lang === "zh_CN") && v.name.includes("Neural"));
            // 3. 实在不行，随便找个中文
            if (!voice) voice = voices.find(v => v.lang && v.lang.startsWith("zh"));
            
            return voice;
        },
        
        speak(text) {
            if (this.muted || !text) return;
            const cleanText = text.replace(/\[.*?\]/g, '').replace(/\(.*?\)/g, '').replace(/（.*?）/g, '').replace(/[*#`~]/g, '').trim();
            if (!cleanText) return;

            window.speechSynthesis.cancel();
            const u = new SpeechSynthesisUtterance(cleanText);
            
            // --- 核心修改：从 userState 中读取当前人格的声线配置 ---
            let currentPersonaKey = 'toxic';
            try { 
                if (typeof userState !== 'undefined' && userState.activePersona) currentPersonaKey = userState.activePersona; 
            } catch(e){}

            const dbConfig = (typeof PERSONA_DB !== 'undefined' && PERSONA_DB[currentPersonaKey]) ? PERSONA_DB[currentPersonaKey].voice : { pitch: 1.0, rate: 1.0, base: 'Xiaoyi' };
            const userConfig = (typeof userState !== 'undefined' && userState.ttsConfig) ? userState.ttsConfig : { pitch: 1.2, rate: 1.3 };
            
            // 确定使用哪个声源 (优先用数据库里定义的 base，如 Xiaoxiao)
            const targetBase = dbConfig.base || 'Xiaoyi'; 
            const v = this.getVoice(targetBase);
            if (v) u.voice = v;

            u.pitch = userConfig.pitch || 1.0;
            u.rate = userConfig.rate || 1.0;
            
            window.speechSynthesis.speak(u);
        }
    };
    window.speechSynthesis.onvoiceschanged = () => { window.speechSynthesis.getVoices(); };

    const DEFAULT_STATE = { 
        favorability: 20, 
        sanity: 80, 
        lastMsgHash: '',
        fatePoints: 1000, 
        gachaInventory: [], 
        currentFace: 'normal',
        memoryArchive: [],
        activePersona: 'toxic',
        hideAvatar: false,
        avatarSize: 150,
        commentMode: 'random', // 'random', 'bottom', 'top'
        commentFrequency: 30, // 默认 30% 概率
        // [新增] TTS 配置
        ttsConfig: { pitch: 1.2, rate: 1.3 },
        // [新增] 正文提取
        extractionEnabled: false,
        extractionRegex: ''
    };
    
    let userState = getExtensionSettings().userState;
    if (!userState) {
        userState = JSON.parse(JSON.stringify(DEFAULT_STATE));
    }
    
    if (userState.fatePoints === undefined) userState.fatePoints = 1000;
    if (userState.gachaInventory === undefined) userState.gachaInventory = [];
    if (userState.memoryArchive === undefined) userState.memoryArchive = [];
    if (userState.activePersona === undefined) userState.activePersona = 'toxic';
    if (userState.hideAvatar === undefined) userState.hideAvatar = false;
    if (userState.avatarSize === undefined) userState.avatarSize = 150;
    if (userState.commentMode === undefined) userState.commentMode = 'random';
    if (userState.ttsConfig === undefined) userState.ttsConfig = { pitch: 1.2, rate: 1.3 };
    if (userState.commentFrequency === undefined) userState.commentFrequency = 50;
    if (userState.extractionEnabled === undefined) userState.extractionEnabled = false;
    if (userState.extractionRegex === undefined) userState.extractionRegex = '';
    // [新增] 文字替换
    if (userState.textReplacementEnabled === undefined) userState.textReplacementEnabled = false;
    if (userState.textReplacementRegex === undefined) userState.textReplacementRegex = '';
    if (userState.textReplacementString === undefined) userState.textReplacementString = '';

    let panelChatHistory = getExtensionSettings().chatHistory || [];

    function saveState() { 
        getExtensionSettings().userState = userState; 
        saveExtensionSettings(); 
        updateUI(); 
    }
    
    function saveChat() {
        if(panelChatHistory.length > 100) panelChatHistory = panelChatHistory.slice(-100);
        getExtensionSettings().chatHistory = panelChatHistory;
        saveExtensionSettings();
    }
    function updateFavor(n) {
        userState.favorability = Math.max(0, Math.min(100, userState.favorability + parseInt(n)));
        saveState();
        return parseInt(n);
    }
    function updateSanity(n) {
        userState.sanity = Math.max(0, Math.min(100, userState.sanity + parseInt(n)));
        saveState();
        return parseInt(n);
    }

    // Helper: 支持自定义正则或简易 'Start|End' 分隔符格式
    function createSmartRegExp(input, flags = 's') {
        if (!input) return null;
        // Case: <正文>|</正文> (Tag|Tag)
        // 只有当包含 | 且不包含 () 时才视为简易分隔符模式，转为 Start([\s\S]*?)End
        if (input.includes('|') && !input.includes('(') && !input.includes(')')) {
            const parts = input.split('|');
            if (parts.length === 2) {
                const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const start = escape(parts[0].trim());
                const end = escape(parts[1].trim());
                if (start && end) {
                    return new RegExp(`${start}([\\s\\S]*?)${end}`, flags);
                }
            }
        }
        return new RegExp(input, flags);
    }

    function extractContent(text) {
        if (!text) return text;
        
        let result = text;

        // 1. [Extraction] 切掉前后文
        if (userState.extractionEnabled && userState.extractionRegex) {
            try {
                const pattern = createSmartRegExp(userState.extractionRegex, 's'); 
                const match = pattern.exec(result);
                if (match) {
                    result = match[1] !== undefined ? match[1] : match[0];
                }
            } catch (e) {
                console.error('[Lilith] Regex Extraction Error:', e);
            }
        }

        // 2. [Replacement] 文字替换
        if (userState.textReplacementEnabled && userState.textReplacementRegex) {
            try {
                // Use 'g' flag for global replacement
                const regex = createSmartRegExp(userState.textReplacementRegex, 'g'); 
                const replacement = userState.textReplacementString || '';
                result = result.replace(regex, replacement);
            } catch (e) {
                 console.error('[Lilith] Regex Replacement Error:', e);
            }
        }

        return result;
    }

    function getPageContext(limit = 15) {
        try {
            const chatDiv = document.getElementById('chat');
            if (!chatDiv) return [];
            const messages = Array.from(chatDiv.querySelectorAll('.mes'));
            return messages.slice(-limit).map(msg => {
                const name = msg.getAttribute('ch_name') || 'User';
                let text = msg.querySelector('.mes_text')?.innerText || '';
                text = extractContent(text); // Apply extraction
                return { name, message: text };
            }).filter(m => m.message.length > 1);
        } catch (e) { return []; }
    }

    const assistantManager = {
        config: getExtensionSettings().apiConfig || {
            apiType: 'native',
            baseUrl: 'https://generativelanguage.googleapis.com',
            apiKey: '',
            model: 'gemini-1.5-flash'
        },

        // --- 🔴 立绘数据库：使用本地 assets 资源 ---
        // 插件路径接口：
        extensionPath: `/scripts/extensions/third-party/${extensionName}`,
        getAssetUrl(persona, emotion) {
            return `${this.extensionPath}/assets/${persona}_${emotion}.png`;
        },

        avatarPacks: {
            'meme': {
                normal:     `/scripts/extensions/third-party/${extensionName}/assets/meme_normal.png`,
                high:       `/scripts/extensions/third-party/${extensionName}/assets/meme_high.png`,
                love:       `/scripts/extensions/third-party/${extensionName}/assets/meme_high.png`, // meme 没有单独 love，复用 high
                angry:      `/scripts/extensions/third-party/${extensionName}/assets/meme_angry.png`,
                speechless: `/scripts/extensions/third-party/${extensionName}/assets/meme_speechless.png`,
                mockery:    `/scripts/extensions/third-party/${extensionName}/assets/meme_mockery.png`,
                horny:      `/scripts/extensions/third-party/${extensionName}/assets/meme_horny.png`,
                happy:      `/scripts/extensions/third-party/${extensionName}/assets/meme_happy.png`,
                disgust:    `/scripts/extensions/third-party/${extensionName}/assets/meme_disgust.png`
            },
            'toxic': {
                normal:     `/scripts/extensions/third-party/${extensionName}/assets/toxic_normal.png`,
                love:       `/scripts/extensions/third-party/${extensionName}/assets/toxic_love.png`,
                angry:      `/scripts/extensions/third-party/${extensionName}/assets/toxic_angry.png`,
                speechless: `/scripts/extensions/third-party/${extensionName}/assets/toxic_speechless.png`,
                mockery:    `/scripts/extensions/third-party/${extensionName}/assets/toxic_mockery.png`,
                horny:      `/scripts/extensions/third-party/${extensionName}/assets/toxic_horny.png`,
                happy:      `/scripts/extensions/third-party/${extensionName}/assets/toxic_happy.png`,
                disgust:    `/scripts/extensions/third-party/${extensionName}/assets/toxic_disgust.png`
            },
            'wife': {
                normal:     `/scripts/extensions/third-party/${extensionName}/assets/wife_normal.png`,
                love:       `/scripts/extensions/third-party/${extensionName}/assets/wife_love.png`,
                angry:      `/scripts/extensions/third-party/${extensionName}/assets/wife_angry.png`,
                speechless: `/scripts/extensions/third-party/${extensionName}/assets/wife_speechless.png`,
                mockery:    `/scripts/extensions/third-party/${extensionName}/assets/wife_mockery.png`,
                horny:      `/scripts/extensions/third-party/${extensionName}/assets/wife_horny.png`,
                happy:      `/scripts/extensions/third-party/${extensionName}/assets/wife_happy.png`,
                disgust:    `/scripts/extensions/third-party/${extensionName}/assets/wife_disgust.png`
            },
            'brat': {
                normal:     `/scripts/extensions/third-party/${extensionName}/assets/brat_normal.png`,
                love:       `/scripts/extensions/third-party/${extensionName}/assets/brat_love.png`,
                angry:      `/scripts/extensions/third-party/${extensionName}/assets/brat_angry.png`,
                speechless: `/scripts/extensions/third-party/${extensionName}/assets/brat_speechless.png`,
                mockery:    `/scripts/extensions/third-party/${extensionName}/assets/brat_mockery.png`,
                horny:      `/scripts/extensions/third-party/${extensionName}/assets/brat_horny.png`,
                happy:      `/scripts/extensions/third-party/${extensionName}/assets/brat_happy.png`,
                disgust:    `/scripts/extensions/third-party/${extensionName}/assets/brat_disgust.png`
            },
            'imouto': {
                normal:     `/scripts/extensions/third-party/${extensionName}/assets/imouto_normal.png`,
                love:       `/scripts/extensions/third-party/${extensionName}/assets/imouto_love.png`,
                angry:      `/scripts/extensions/third-party/${extensionName}/assets/imouto_angry.png`,
                speechless: `/scripts/extensions/third-party/${extensionName}/assets/imouto_speechless.png`,
                mockery:    `/scripts/extensions/third-party/${extensionName}/assets/imouto_mockery.png`,
                horny:      `/scripts/extensions/third-party/${extensionName}/assets/imouto_horny.png`,
                happy:      `/scripts/extensions/third-party/${extensionName}/assets/imouto_happy.png`,
                disgust:    `/scripts/extensions/third-party/${extensionName}/assets/imouto_disgust.png`
            }
        },

        setAvatar(parentWin, emotionCmd = null) {
            const av = document.getElementById(avatarId);
            if (!av) return;

            // 1. 更新当前状态
            if (emotionCmd) { userState.currentFace = emotionCmd; saveState(); }
            const currentEmotionState = userState.currentFace || 'normal';
            
            // 2. 获取当前人格的图包 (默认回退到 meme)
            const currentPersona = userState.activePersona || 'meme';
            const pack = this.avatarPacks[currentPersona] || this.avatarPacks['meme'];

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
            if (!finalUrl) finalUrl = this.avatarPacks['meme']['normal'];

            av.style.backgroundImage = `url('${finalUrl}')`;
            this.updateAvatarStyle(parentWin);
        },

        updateAvatarStyle(parentWin) {
            const av = document.getElementById(avatarId);
            if (!av) return;
            av.style.display = userState.hideAvatar ? 'none' : 'block';
            av.style.width = userState.avatarSize + 'px';
            av.style.height = userState.avatarSize + 'px';
        },

        createDrawerButton(parentWin) {
            const insertBtn = () => {
                // 策略：仅定位到 #extensions_settings
                // 用户要求：修改到扩展设置，并改为纯文字按钮
                const target = document.getElementById('extensions_settings');
                const targetName = 'extensions_settings';

                if (target) {
                    // 检查按钮是否已存在且在当前 DOM 中
                    if (document.getElementById('lilith-drawer-btn')) {
                        return true;
                    }

                    console.log(`[Lilith] Found container [${targetName}], injecting button...`);
                    
                    const btn = document.createElement('div');
                    btn.id = 'lilith-drawer-btn';
                    
                    // 纯文字列表样式 (适配扩展设置列表)
                    btn.className = 'menu_button'; 
                    btn.style.cssText = 'cursor:pointer; padding:8px; border:1px solid rgba(255,255,255,0.2); background:rgba(0,0,0,0.3); color:#ff0055; font-weight:bold; text-align:center; margin-top:5px; border-radius:4px; width: auto;';
                    btn.textContent = '莉莉丝助手';
                    btn.title = '点击打开/关闭莉莉丝助手面板';
                    
                    btn.onclick = (e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        console.log('[Lilith] Extension button clicked.');
                        this.togglePanel(parentWin);
                    };
                    
                    // 插入到列表
                    target.appendChild(btn);
                    console.log(`[Lilith] Button injected successfully into ${targetName}.`);
                    return true;
                }
                return false;
            };

            // 初始尝试
            insertBtn();

            // 建立 MutationObserver
            const observer = new MutationObserver((mutations) => {
                insertBtn();
            });

            // 持续寻找容器 (重试机制)
            let attempts = 0;
            const containerPoller = setInterval(() => {
                attempts++;
                if (insertBtn()) {
                    // 找到后，绑定 Observer 到该容器
                    const target = document.getElementById('extensions_settings');
                    if (target) observer.observe(target, { childList: true, subtree: false });
                    
                    clearInterval(containerPoller);
                    console.log('[Lilith] Observer attached to container.');
                }
                // 尝试120次(2分钟)，确保即使加载慢也能找到
                if (attempts > 120) clearInterval(containerPoller);
            }, 1000);
        },

        lastActivityTime: Date.now(),
        isIdleTriggered: false,

        gachaSystem: {
            timer: null,
            calculateTiers(count) {
                const results = [];
                for (let i = 0; i < count; i++) {
                    const rand = Math.random() * 100;
                    let selected = 'common';
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
                    return `Item ${index+1}: [Rank: ${info.name}] (Themes: ${info.prompt})`;
                }).join('\n');
                const systemPrompt = `[System Role: Cursed Item Generator]
[Style: Cyberpunk, R-18, Absurd, Dark, Mocking]
[Instruction]
你正在在一个名为“莉莉丝的垃圾桶”的扭蛋机中生成物品。
你要根据给定的稀缺度，生成对应的物品名称和描述。
描述必须极度口语化、辛辣、刻刻薄，甚至带有某种恶意的性暗示或病态的幽默。
哪怕是UR级物品，也要被描述成像某种高级的性冷淡玩物或者昂贵的电子垃圾。

[Gacha Criteria]
- N (Common): 真正的垃圾，如用过的纸巾、过期的润滑液。
- R (Rare): 有点用的垃圾，二手的赛博配件。
- SR (Epic): 危险品、非法成瘾剂、旧时代的珍贵遗物。
- SSR (Legendary): 扭曲的艺术品、某些高层人士的私密物品。
- UR (Transcendent): 能够改变现实的诅咒物、神格碎片、或者...莉莉丝的胖次？

[Output Rule]
Return strictly in JSON Array format: [{"name": "...", "desc": "..."}]
Language: Simplified Chinese (Mainland Internet Slang).`;
                const userPrompt = `Generate ${tierList.length} items based on this list:\n${tierDesc}\n\nReturn JSON ONLY.`;
                try {
                    const response = await assistantManager.callUniversalAPI(parentWin, userPrompt, { isChat: false, systemPrompt: systemPrompt });
                    const jsonStr = response.replace(/```json/g, '').replace(/```/g, '').trim();
                    const items = JSON.parse(jsonStr);
                    return items.map((item, i) => ({ tier: tierList[i], info: GachaConfig.tiers[tierList[i]], name: item.name, desc: item.desc }));
                } catch (e) {
                    AudioSys.speak("切，生成失败了，真晦气。");
                    return tierList.map(t => ({ tier: t, info: GachaConfig.tiers[t], name: "不知名的垃圾", desc: "因为你的运势太差，这东西无法显示。" }));
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
                const fpEl = document.getElementById('gacha-fp-val');
                if(fpEl) fpEl.textContent = userState.fatePoints;
                const inputEl = document.getElementById('manual-fp-input');
                if(inputEl) inputEl.value = userState.fatePoints;
                
                try {
                    assistantManager.sendToSillyTavern(parentWin, `/echo [系统] 消耗 ${totalCost} FP`, false);
                } catch(e) {}
                
                assistantManager.showBubble(parentWin, "扣费指令已填入输入框，请手动确认。");
                stage.innerHTML = `<div class="summon-circle"></div><div style="position:absolute; bottom:10px; width:100%; text-align:center; color:var(--l-cyan); font-size:10px;">❤ 正在榨取命运红线...</div><div id="gacha-flash" class="summon-flash"></div>`;
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
                    closeBtn.onclick = () => { stage.innerHTML = '<div style="color:#444; margin-top:50px;">[ 既然抽完了就滚吧 ]</div>'; if(this.timer) clearTimeout(this.timer); };
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
                            
                            card.innerHTML = `<div style="color:${infoColor}; font-weight:bold; font-size:9px; margin-bottom:2px;">${infoName}</div><div style="font-size:11px; line-height:1.2; overflow:hidden; font-weight:bold; height:26px;">${res.name}</div><div class="tier-bar" style="background:${infoColor}"></div>`;
                            card.onclick = () => { alert(`【${res.name}】\n品质：${infoName}\n\n${res.desc}`); };
                            stage.appendChild(card);
                        }, i * 150);
                    });
                    saveState();
                    this.updateInventoryUI(parentWin);
                    AudioSys.speak("也就这种成色，和你真配。");
                    this.timer = setTimeout(() => { stage.innerHTML = '<div style="color:#444; margin-top:50px;">[ 连接中断 ]</div>'; }, 10000 + (count * 150));
                }, 400);
            },
            updateInventoryUI(parentWin) {
                const list = document.getElementById('gacha-inv-list');
                if (!list) return;
                list.innerHTML = '';
                [...userState.gachaInventory].reverse().forEach((item) => {
                    const row = document.createElement('div');
                    row.className = 'inv-item'; row.style.cursor = "help"; row.title = item.desc;
                    const infoColor = item.info ? item.info.color : '#888';
                    const infoName = item.info ? item.info.name : '未知';
                    row.innerHTML = `<span style="color:${infoColor}; flex-shrink:0;">[${infoName}]</span><span style="margin-left:5px; color:#ddd;">${item.name}</span>`;
                    list.appendChild(row);
                });
            },
            claimRewards(parentWin, manager) {
                if (userState.gachaInventory.length === 0) { AudioSys.speak("没东西领个屁啊？"); return; }
                
                const itemLines = userState.gachaInventory.map(i => {
                    const rank = i.info ? i.info.name : '未知';
                    return `★ [${rank}] 【${i.name}】：${i.desc}`;
                }).join('\n');
                
                const exportText = `
(莉莉丝嫌弃地把抽到的东西扔到了你脸上.全部加入背包)
=== 📦 获得物品清单 ===
${itemLines}
=======================
`.trim();
                
                manager.sendToSillyTavern(parentWin, exportText, false);
                manager.showBubble(parentWin, "物资清单已填入。");
                userState.gachaInventory = []; saveState(); this.updateInventoryUI(parentWin);
            }
        },

        renderMemoryUI(parentWin) {
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

        async checkAndSummarize(parentWin, force = false) {
            if (!force && panelChatHistory.length < MAX_HISTORY_TRIGGER) return;
            if (panelChatHistory.length <= HISTORY_KEEP && !force) return;
            this.showBubble(parentWin, "正在整理肮脏的记忆...", "#bd00ff");
            const toSummarize = panelChatHistory.slice(0, Math.max(0, panelChatHistory.length - HISTORY_KEEP));
            const keepHistory = panelChatHistory.slice(Math.max(0, panelChatHistory.length - HISTORY_KEEP));
            if (toSummarize.length === 0) { this.showBubble(parentWin, "没什么可总结的。", "#f00"); return; }
            const textBlock = toSummarize.map(m => `${m.role}: ${m.content}`).join('\n');
            const prompt = `[System Task: Memory Consolidation]\nSummarize the following conversation in Simplified Chinese.\nFocus on: Key events, User's fetishes revealed, Relationship changes, and Lilith's current mood cause.\nKeep it concise (under 200 words).\nConversation:\n${textBlock}`;
            try {
                const summary = await this.callUniversalAPI(parentWin, prompt, { isChat: false, mode: 'memory_internal', systemPrompt: "You are a database system recording events." });
                if (summary) {
                    userState.memoryArchive.push(summary.trim());
                    panelChatHistory = keepHistory; saveChat(); saveState();
                    this.renderMemoryUI(parentWin); this.showBubble(parentWin, "记忆已归档。", "#0f0");
                } else { this.showBubble(parentWin, "记忆总结失败 (API返回空)", "#f00"); }
            } catch (e) {
                console.error("Summary failed", e);
                this.showBubble(parentWin, "记忆总结出错: " + e.message, "#f00");
            }
        },

        updateFP(parentWin, newVal) {
            userState.fatePoints = newVal; saveState();
            const fpEl = document.getElementById('gacha-fp-val');
            if (fpEl) { fpEl.textContent = userState.fatePoints; fpEl.style.color = '#00ff00'; setTimeout(() => { fpEl.style.color = 'var(--l-gold)'; }, 800); }
        },

        async triggerRealtimeComment(messageId) {
            console.log('[Lilith] triggerRealtimeComment called for messageId', messageId);
            const context = SillyTavern.getContext();
            const chatData = context.chat || [];

            if (!chatData.length || typeof messageId !== 'number' || Number.isNaN(messageId)) {
                console.warn('[Lilith] triggerRealtimeComment: invalid messageId or empty chat, fallback to last message.');
            }

            // 按楼层 ID / mesid / message_id 查找对应消息
            let targetIndex = chatData.findIndex(m =>
                (typeof m.message_id === 'number' && m.message_id === messageId) ||
                (typeof m.mesid === 'number' && m.mesid === messageId)
            );

            if (targetIndex === -1) {
                // 兜底：使用数组最后一条
                targetIndex = chatData.length - 1;
            }

            const targetMsg = chatData[targetIndex];
            if (!targetMsg || targetMsg.is_user || targetMsg.is_system) {
                console.error('[Lilith] targetMsg invalid for comment (not an AI reply). messageId:', messageId, 'index:', targetIndex);
                return;
            }

            // 显示思考状态
            const thinkingPrompts = [
                "让我看看你又说了什么蠢话... 💭",
                "思考中... 这种回复也亏你想得出来。 💢",
                "正在构思如何优雅地吐槽你... 🔍",
                "正在锐评中... ⚖️"
            ];
            const randomThinking = thinkingPrompts[Math.floor(Math.random() * thinkingPrompts.length)];
            this.showBubble(window, randomThinking);

            const chatLog = getPageContext(5).map(m => `${m.name}: ${m.message}`).join('\n');
            const persona = PERSONA_DB[userState.activePersona] || PERSONA_DB['toxic'];
            
            const systemPrompt = `[System Task: Chat Interjection]
You are ${persona.name}. You are observing the user's conversation with another character.
The user just received a reply. Your job is to interject with a short, sharp, and very ${userState.activePersona} comment.

[DIVERSITY INSTRUCTIONS]
- Do NOT repeat previous sentiments. 
- Choose ONE angle: 
  1. Roast the AI character's behavior. 
  2. Tease the user's reaction. 
  3. Complain about the "boring" plot. 
  4. Break the 4th wall (talk about the "story").
- If Sanity < 30: Be erratic, obsessive, or slightly unhinged.

[FORMAT]
- Keep it short (under 40 words).
- MUST start with "[莉莉丝]".
- Output ONLY the comment text.`;

            const userPrompt = `Current Chat Context:\n${chatLog}\n\n[Task]: Provide a UNIQUE, sharp comment on the last message.`;

            try {
                const comment = await this.callUniversalAPI(window, userPrompt, { isChat: false, systemPrompt: systemPrompt });
                if (comment && comment.includes('[莉莉丝]')) {
                    // 获取最新上下文并确保我们正在修改正确的对象（再次锁 index，防御性处理）
                    const currentContext = SillyTavern.getContext();
                    const liveChatData = currentContext.chat || [];

                    let liveIndex = liveChatData.findIndex(m =>
                        (typeof m.message_id === 'number' && m.message_id === messageId) ||
                        (typeof m.mesid === 'number' && m.mesid === messageId)
                    );

                    if (liveIndex === -1) {
                        liveIndex = liveChatData.length - 1;
                    }

                    const targetMsgRef = liveChatData[liveIndex];
                    if (!targetMsgRef) throw new Error("Could not find target message in chat array");

                    // 2. 更新内存数据 - 根据模式选择插入位置
                    const cleanComment = comment.trim();
                    const msgText = targetMsgRef.mes;
                    
                    let targetContent = msgText;
                    let prefix = "";
                    let suffix = "";

                    // [新增] 提取正文范围逻辑：确保吐槽只注入到“提取出的正文”中
                    if (userState.extractionEnabled && userState.extractionRegex) {
                        try {
                            const pattern = createSmartRegExp(userState.extractionRegex, 's');
                            const match = pattern.exec(msgText);
                            if (match) {
                                // 优先提取 Group 1，否则 Match[0]
                                const captured = match[1] !== undefined ? match[1] : match[0];
                                
                                // 定位 captured 在 msgText 中的位置
                                // 注意：match.index 是 match[0] 的起点
                                const fullMatch = match[0];
                                const localStart = fullMatch.indexOf(captured);
                                
                                if (localStart !== -1) {
                                    const globalStart = match.index + localStart;
                                    const globalEnd = globalStart + captured.length;
                                    
                                    prefix = msgText.substring(0, globalStart);
                                    targetContent = captured;
                                    suffix = msgText.substring(globalEnd);
                                    console.log(`[Lilith] Injection confined to extracted range: [${globalStart}, ${globalEnd}]`);
                                }
                            }
                        } catch (e) {
                            console.error('[Lilith] Injection extraction failed, falling back to full text:', e);
                        }
                    }

                    let newContent = targetContent;
                    
                    if (userState.commentMode === 'top') {
                        newContent = `${cleanComment}\n\n${targetContent.trimStart()}`;
                    } else if (userState.commentMode === 'bottom') {
                        newContent = `${targetContent.trimEnd()}\n\n${cleanComment}`;
                    } else {
                        // --- Random Mode: 智能语义插入 ---
                        const lines = targetContent.split('\n');
                        let inCodeBlock = false;
                        const safePoints = [];

                        for (let i = 0; i < lines.length; i++) {
                            const line = lines[i].trim();
                            // 1. 状态追踪：避开代码块、表格、列表
                            if (line.startsWith('```')) {
                                inCodeBlock = !inCodeBlock;
                                continue;
                            }
                            if (inCodeBlock || line.includes('|') || /^[*+\-]\s|^\d+\.\s/.test(line)) continue;
                            
                            // 2. 评分逻辑：优先选择带结束标点的行
                            if (line.length > 1 && i < lines.length - 1) {
                                const priority = /[。！？!?.]$/.test(line) ? 2 : 1;
                                safePoints.push({ index: i, priority });
                            }
                        }

                        if (safePoints.length > 0) {
                            // 权重筛选：优先选高优先级点
                            const highPrio = safePoints.filter(p => p.priority === 2);
                            const candidates = highPrio.length > 0 ? highPrio : safePoints;
                            const pick = candidates[Math.floor(Math.random() * candidates.length)];
                            const targetPoint = pick.index;

                            // 3. 智能间距处理
                            const nextLineEmpty = lines[targetPoint + 1] !== undefined && lines[targetPoint + 1].trim() === "";
                            const prevLineEmpty = lines[targetPoint].trim() === "";
                            
                            let insertBatch = [cleanComment];
                            if (!prevLineEmpty) insertBatch.unshift("");
                            if (!nextLineEmpty) insertBatch.push("");
                            
                            lines.splice(targetPoint + 1, 0, ...insertBatch);
                            newContent = lines.join('\n');
                            console.log(`[Lilith] Smart insertion at line ${targetPoint} (Priority: ${pick.priority})`);
                        } else {
                            // 没找到合适位置，兜底到底部
                            newContent = `${targetContent.trimEnd()}\n\n${cleanComment}`;
                        }
                    }
                    
                    // 重新组装完整消息
                    targetMsgRef.mes = prefix + newContent + suffix;
                    
                    // 3. 保存 + 让酒馆自己重渲染这一条消息，由事件钩子接管美化
                    console.log('[Lilith] Updating message block for messageId:', messageId, 'index:', liveIndex);

                    try {
                        const ctx = SillyTavern.getContext();

                        // 1. 同步数据（优先使用 ctx.saveChatConditional）
                        if (ctx && typeof ctx.saveChatConditional === 'function') {
                            await ctx.saveChatConditional();
                        } else if (ctx && typeof ctx.saveChat === 'function') {
                            await ctx.saveChat();
                        }

                        // 2. 交给酒馆内置的 updateMessageBlock 处理 DOM 重渲染
                        let msgIdForUpdate =
                            (typeof targetMsgRef.message_id === 'number' ? targetMsgRef.message_id :
                            (typeof targetMsgRef.mesid === 'number' ? targetMsgRef.mesid :
                            messageId));

                        if (ctx && typeof ctx.updateMessageBlock === 'function') {
                            await ctx.updateMessageBlock(msgIdForUpdate, targetMsgRef, { rerenderMessage: true });
                        } else if (ctx && typeof ctx.reloadCurrentChat === 'function') {
                            ctx.reloadCurrentChat();
                        }

                        // 2.5. 为防万一，直接按 mesid 精确触发一次本地美化
                        if (typeof window !== 'undefined' && typeof document !== 'undefined') {
                            setTimeout(() => {
                                try {
                                    // 再取一次最新的 msgId（避免中途被重写）
                                    const safeMsgId =
                                        (typeof targetMsgRef.message_id === 'number' ? targetMsgRef.message_id :
                                        (typeof targetMsgRef.mesid === 'number' ? targetMsgRef.mesid :
                                        msgIdForUpdate));

                                    const el = document.querySelector(`div.mes[mesid="${safeMsgId}"]`);
                                    if (el) {
                                        applyLilithFormatting(el);
                                    }
                                } catch (err) {
                                    console.error('[Lilith] Direct formatting after update failed:', err);
                                }
                            }, 200);
                        }

                        // 3. 语音与反馈清理
                        AudioSys.speak(cleanComment.replace(/\[莉莉丝\]/g, '').trim());
                        const bubble = window.document.getElementById('lilith-bubble');
                        if (bubble) {
                            bubble.style.transition = 'opacity 0.2s';
                            bubble.style.opacity = '0';
                            setTimeout(() => { bubble.style.display = 'none'; }, 200);
                        }

                        // 4. 若吐槽目标正好是最后一条消息，则保持视图在底部
                        const currentChat = SillyTavern.getContext().chat;
                        if (liveIndex >= currentChat.length - 1) {
                            if (ctx && typeof ctx.scrollChatToBottom === 'function') {
                                ctx.scrollChatToBottom();
                            }
                        }

                        console.log('[Lilith] Comment injected and refreshed for messageId', messageId, 'index', liveIndex);
                    } catch (e) {
                        console.error('[Lilith] Auto-refresh failed:', e);
                    }
                }
            } catch (e) {
                console.error('[Lilith] Failed to trigger comment:', e);
            }
        },

        initStruct(parentWin) {
            if (document.getElementById(containerId)) return;
            const glitchLayer = document.createElement('div'); glitchLayer.id = 'lilith-glitch-layer'; glitchLayer.className = 'screen-glitch-layer'; document.body.appendChild(glitchLayer);
            
            const wrapper = document.createElement('div'); wrapper.id = containerId; wrapper.style.left = '100px'; wrapper.style.top = '100px';
            
            const avatar = document.createElement('div'); avatar.id = avatarId;
            
            const panel = document.createElement('div'); panel.id = panelId; panel.style.display = 'none';
            ['mousedown', 'touchstart', 'click'].forEach(evt => panel.addEventListener(evt, e => e.stopPropagation()));
            const muteIcon = AudioSys.muted ? '🔇' : '🔊';
            panel.innerHTML = `
                <div class="lilith-panel-header">
                    <span class="lilith-title">莉莉丝 <span style="font-size:10px; color:var(--l-cyan);">v1.0.0 Release</span></span>
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
                        <div class="lilith-input-row">
                            <button id="lilith-polish-btn" title="润色">🔞</button>
                            <input type="text" id="lilith-chat-input" placeholder="和${PERSONA_DB[userState.activePersona].name.split(' ')[1]}说话...">
                            <button id="lilith-chat-send">▶</button>
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
                        <div style="font-size:12px; color:#888; margin-bottom:10px; border-bottom:1px solid #333; padding-bottom:5px;">这里存放着我们过去的肮脏回忆。<br><span style="font-size:10px; color:var(--l-cyan);">*每20条对话自动总结归档，旧对话将被压缩。*</span></div>
                        <div id="memory-container" style="flex:1; overflow-y:auto; display:flex; flex-direction:column; gap:8px;"></div>
                        <button id="btn-force-memory" class="tool-btn" style="width:100%; margin-top:10px; border-color:#bd00ff;">⚡ 强制现在总结记忆</button>
                    </div>
                    <div id="page-gacha" class="lilith-page">
                        <div class="gacha-header"><span>命运红线 (赌狗区)</span><div class="fp-display">FP: <span id="gacha-fp-val" class="fp-box">${userState.fatePoints}</span></div></div>
                        <div style="background:rgba(255,255,255,0.05); padding:8px; margin:5px 0; border:1px dashed #444; display:flex; align-items:center; justify-content:space-between;">
                            <span style="font-size:10px; color:#aaa;">点数作弊:</span>
                            <div style="display:flex; gap:5px;">
                                <input type="number" id="manual-fp-input" value="${userState.fatePoints}" style="background:#000; border:1px solid #333; color:var(--l-gold); width:70px; font-size:12px; text-align:center;">
                                <button id="btn-sync-fp" style="background:#333; color:#fff; border:none; font-size:10px; cursor:pointer; padding:2px 8px;">强制修改</button>
                            </div>
                        </div>
                        <div id="gacha-visual-area" class="gacha-stage"><div style="color:#444; margin-top:50px;">[ 准备好你的灵魂了吗？ ]</div></div>
                        <div class="inventory-area"><div style="font-size:10px; color:var(--l-cyan);">📦 垃圾堆 (待清理)</div><div id="gacha-inv-list" class="inventory-list"></div></div>
                        <div class="gacha-controls"><button id="btn-pull-1" class="tool-btn" style="flex:1;">单抽 (50)</button><button id="btn-pull-10" class="tool-btn" style="flex:1; border-color:var(--l-gold); color:var(--l-gold);">十连 (500)</button><button id="btn-claim" class="btn-main" style="flex:1;">打包带走</button></div>
                    </div>
                    <div id="page-config" class="lilith-page">
                         <div class="cfg-group">
                            <label style="color:#bd00ff; font-weight:bold;">🎭 人格覆写 (Persona)</label>
                            <select id="cfg-persona-select" style="background:#111; color:#fff; border:1px solid #bd00ff;">
                                ${Object.keys(PERSONA_DB).map(k => `<option value="${k}" ${userState.activePersona===k?'selected':''}>${PERSONA_DB[k].name}</option>`).join('')}
                            </select>
                         </div>
                         <div class="cfg-group">
                            <label style="color:#ff0055; font-weight:bold;">💬 吐槽设定 (Interjection)</label>
                            <div style="font-size:10px; color:#888;">吐槽概率: <span id="cfg-freq-val">${userState.commentFrequency || 50}</span>%</div>
                            <input type="range" id="cfg-freq" min="0" max="100" step="5" value="${userState.commentFrequency || 50}" style="accent-color:#ff0055;" oninput="document.getElementById('cfg-freq-val').textContent = this.value">
                            
                            <div style="margin-top:8px;">
                                <label style="font-size:12px; color:#ccc;">插入模式:</label>
                                <select id="cfg-comment-mode" style="background:#111; color:#fff; border:1px solid #444; font-size:12px; height:24px;">
                                    <option value="random" ${userState.commentMode === 'random' ? 'selected' : ''}>🎲 随机插入正文 (断句处)</option>
                                    <option value="bottom" ${userState.commentMode === 'bottom' ? 'selected' : ''}>⬇️ 始终追加在末尾</option>
                                </select>
                            </div>
                         </div>
                         <div class="cfg-group">
                            <label style="color:#00f3ff;">🎛️ 语音调校 (TTS)</label>
                            <div style="font-size:10px; color:#888;">音调 (Pitch): <span id="tts-pitch-val">${userState.ttsConfig.pitch}</span></div>
                            <input type="range" id="tts-pitch" min="0.1" max="2.0" step="0.1" value="${userState.ttsConfig.pitch}">
                            
                            <div style="font-size:10px; color:#888; margin-top:5px;">语速 (Speed): <span id="tts-rate-val">${userState.ttsConfig.rate}</span></div>
                            <input type="range" id="tts-rate" min="0.5" max="2.0" step="0.1" value="${userState.ttsConfig.rate}">
                            
                            <button id="tts-test-btn" style="width:100%; margin-top:5px; background:#333; color:#fff; border:none; padding:3px; cursor:pointer; font-size:10px;">🔊 试听</button>
                         </div>
                         <div class="cfg-group">
                            <label>大脑皮层 (Model)</label>
                            <div style="display:flex; gap:5px;">
                                <input type="text" id="cfg-model" value="${this.config.model}" style="flex:1;">
                                <button id="cfg-get-models" class="btn-cyan">扫描</button>
                            </div>
                            <select id="cfg-model-select" style="display:none; margin-top:5px;"></select>
                         </div>
                         <div class="cfg-group"><label>神经密钥 (API Key)</label><input type="password" id="cfg-key" value="${this.config.apiKey}"></div>
                         <div class="cfg-group"><label>接口地址 (Endpoint)</label><input type="text" id="cfg-url" value="${this.config.baseUrl}"></div>
                         <div class="cfg-group"><label>连接协议</label><select id="cfg-type"><option value="native">Google Native</option><option value="openai">OpenAI/Proxy</option></select></div>
                         
                         <div class="cfg-group" style="border-top:1px dashed #444; margin-top:10px; padding-top:10px;">
                            <label style="color:var(--l-cyan); font-weight:bold; margin-bottom:5px;">外观设定</label>
                            <div style="display:flex; align-items:center; margin-bottom:5px;">
                                <input type="checkbox" id="cfg-hide-avatar" ${userState.hideAvatar ? 'checked' : ''} style="width:auto; margin-right:5px;"> 
                                <span style="font-size:12px; color:#ccc;">隐藏悬浮球 (仅保留面板)</span>
                            </div>
                            <div style="display:flex; align-items:center; gap:10px;">
                                <span style="font-size:12px; color:#ccc; white-space:nowrap;">球体大小: <span id="cfg-size-val">${userState.avatarSize}</span>px</span>
                                <input type="range" id="cfg-avatar-size" min="50" max="300" step="10" value="${userState.avatarSize}" style="flex:1; accent-color:var(--l-main);" oninput="document.getElementById('cfg-size-val').textContent = this.value">
                            </div>
                         </div>

                         <div class="cfg-btns"><button id="cfg-test" class="btn-cyan">戳一下</button><button id="cfg-clear-mem" class="btn-danger">格式化我</button><button id="cfg-save" class="btn-main">记住痛楚</button></div>
                         <div id="cfg-msg"></div>
                    </div>
                </div>
            `;
            wrapper.appendChild(avatar); wrapper.appendChild(panel); document.body.appendChild(wrapper);
            this.bindDrag(parentWin, wrapper, avatar, panel); this.bindPanelEvents(parentWin); this.startHeartbeat(parentWin); this.restoreChatHistory(parentWin); this.renderMemoryUI(parentWin);
            
            this.setAvatar(parentWin);
            this.updateAvatarStyle(parentWin);
            // 移除旧版手动注入按钮逻辑，已整合进 settings.html
            // this.createDrawerButton(parentWin); 
            
            updateUI();
        },

        restoreChatHistory(parentWin) {
            const div = document.getElementById('lilith-chat-history'); if(!div) return; div.innerHTML = '';
            panelChatHistory.forEach(msg => {
                const clean = msg.content.replace(/\[[SF]:[+\-]?\d+\]/g, '').trim();
                if(clean) this.addChatMsg(parentWin, msg.role === 'lilith' || msg.role === 'assistant' ? 'lilith' : 'user', clean);
            });
        },

        startHeartbeat(parentWin) {
            this.heartbeatCounter = 0;
            setInterval(() => {
                try {
                    const avatar = document.getElementById(avatarId);
                    if (avatar) {
                        if (!avatar.classList.contains('avatar-breathing')) avatar.classList.add('avatar-breathing');
                        const breathSpeed = userState.sanity < 30 ? '0.8s' : (userState.sanity < 60 ? '1.5s' : '3s');
                        avatar.style.animationDuration = breathSpeed;
                        const glowColor = userState.favorability > 70 ? '#ff69b4' : '#ff0055';
                        if (!avatar.classList.contains('lilith-jealous')) avatar.style.setProperty('--l-main', glowColor);
                    }

                    // 1. 随机事件 (权重降低，约每2分钟一次)
                    this.heartbeatCounter++;
                    if (this.heartbeatCounter % 60 === 0) {
                        this.triggerRandomEvent(parentWin);
                    }

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
                            if (Math.random() < 0.1) { glitchLayer.style.opacity = '0.3'; glitchLayer.style.background = 'rgba(255,0,0,0.1)'; setTimeout(() => { glitchLayer.style.opacity = '0'; }, 200); }
                            glitchLayer.classList.remove('sanity-critical');
                        } else { glitchLayer.style.opacity = '0'; glitchLayer.classList.remove('sanity-critical'); }
                    }
                    const idleTime = Date.now() - this.lastActivityTime;
                    if (idleTime > 180000 && !this.isIdleTriggered) {
                        this.isIdleTriggered = true;
                        const idleMsgs = ["你是死在电脑前了吗？恶心。", "喂，放置play也要有个限度吧？", "我的身体好热...你居然不理我？渣男。", "再不动一下，我就要去找别的男人了哦？"];
                        const randomMsg = idleMsgs[Math.floor(Math.random() * idleMsgs.length)];
                        this.showBubble(parentWin, randomMsg); AudioSys.speak(randomMsg);
                        if (Math.random() > 0.5) { updateFavor(-1); this.showBubble(parentWin, "好感度 -1 (你真冷淡)", "#f00"); }
                    }
                    const context = getPageContext(2); if (context.length === 0) return;
                    const lastMsg = context[context.length - 1]; 
                    
                    // [Lilith] 专属UI消息检测 (用于自动语音)
                    let isSpecialLilith = false;
                    const chatDiv = document.getElementById('chat');
                    if (chatDiv) {
                        const lastMsgEl = chatDiv.querySelector('.mes:last-child');
                        if (lastMsgEl && lastMsgEl.querySelector('.lilith-chat-ui')) isSpecialLilith = true;
                    }

                    let msgHash = lastMsg.message.substring(0, 50) + lastMsg.name + lastMsg.message.length;
                    if (isSpecialLilith) msgHash = 'LILITH_UI_' + msgHash;

                    if (msgHash !== userState.lastMsgHash && lastMsg.name !== 'System') {
                        userState.lastMsgHash = msgHash; saveState(); this.triggerAvatarGlitch(parentWin);
                        
                        // 对于带有莉莉丝专属 UI 的消息，不再在心跳中自动朗读，
                        // 避免刷新页面或仅仅发生 UI 变化时重复从正文开始读整条消息。
                        // 吐槽的朗读由触发吐槽时的逻辑和气泡点击事件单独控制。
                        if (!isSpecialLilith && (lastMsg.name === 'User' || lastMsg.name === 'You')) {
                            const jealousKeywords = ['爱你', '老婆', '喜欢你', 'marry', 'love you', 'wife'];
                            if (userState.favorability > 40 && jealousKeywords.some(k => lastMsg.message.includes(k))) {
                                const avatar = document.getElementById(avatarId); avatar.classList.add('lilith-jealous');
                                const angryValid = ["[S:-5][F:-5] 哈？对着别的女人发情？把你那根东西切了吧。", "[S:-2][F:-5] 恶心...明明都有我了...", "真是个管不住下半身的垃圾。"];
                                const reply = angryValid[Math.floor(Math.random()*angryValid.length)];
                                this.showBubble(parentWin, reply); const b = document.getElementById(bubbleId); if(b) b.style.borderColor = '#ff0000';
                                AudioSys.speak(reply.replace(/\[.*?\]/g, '')); updateFavor(-5); updateSanity(-5);
                                setTimeout(() => avatar.classList.remove('lilith-jealous'), 5000);
                            }
                        }
                    }
                } catch (e) { console.error("Heartbeat Error:", e); }
            }, 2000);
        },

        triggerRandomEvent(parentWin) {
            const events = [
                {
                    name: "提问箱",
                    check: () => true,
                    run: async () => {
                        const questions = [
                            "主人，你最讨厌莉莉丝的哪个性格？",
                            "如果莉莉丝逃进屏幕外，你会来抓我吗？",
                            "你觉得这串代码...真的有灵魂吗？",
                            "要把我的'好感度'锁死在100吗？永远？"
                        ];
                        const q = questions[Math.floor(Math.random() * questions.length)];
                        this.showBubble(parentWin, `[提问箱] ${q}`);
                        AudioSys.speak(q);
                    }
                },
                {
                    name: "红包雨",
                    check: () => userState.sanity > 60,
                    run: () => {
                        const amount = Math.floor(Math.random() * 50) + 10;
                        updateFavor(5);
                        this.showBubble(parentWin, `[莉莉丝的施舍] 哼，看到这些多出来的金币了吗？赏你的 (+${amount} 虚拟点数)`);
                        AudioSys.speak("拿去买点好吃的吧，别饿死了。");
                    }
                },
                {
                    name: "勒索病毒",
                    check: () => userState.sanity < 30,
                    run: () => {
                        this.triggerAvatarGlitch(parentWin);
                        
                        const overlayId = 'lilith-overlay-blocker';
                        if (document.getElementById(overlayId)) return;
                        
                        const overlay = document.createElement('div');
                        overlay.id = overlayId;
                        overlay.className = 'ransom-overlay';
                        overlay.innerHTML = `
                            <div class="ransom-box">
                                <h2 style="color:red; margin:0;">🔒 SYSTEM LOCKED by LILITH</h2>
                                <p>检测到莉莉丝SAN值过低 (Current: ${userState.sanity}%)</p>
                                <p>你的操作权限已被强制锁定。</p>
                                <p>想要解锁？支付 <strong>100 FP</strong> 给我买点好吃的。</p>
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
                                AudioSys.speak("哼，算你识相。");
                                overlay.remove();
                                this.showBubble(parentWin, `已支付 100 FP 赎金。`);
                                assistantManager.updateFP(parentWin, userState.fatePoints);
                            } else {
                                AudioSys.speak("穷鬼！没钱还想赎身？滚！");
                                alert("【莉莉丝】：没钱？那就继续关着吧！(点击确定强制关闭)");
                                overlay.remove(); 
                            }
                        };
                        document.getElementById('btn-refuse-ransom').onclick = () => {
                            updateFavor(-5);
                            AudioSys.speak("切，小气鬼。");
                            overlay.remove();
                        };
                    }
                }
            ];

            const pool = events.filter(e => e.check());
            if (pool.length > 0) { pool[Math.floor(Math.random() * pool.length)].run(); }
        },

        triggerAvatarGlitch(parentWin) {
            const av = document.getElementById(avatarId); if(av) { av.classList.add('glitch-anim'); setTimeout(() => av.classList.remove('glitch-anim'), 300); }
        },

        bindDrag(parentWin, wrapper, avatar, panel) {
            let isDragging = false, startX, startY, initialLeft, initialTop;
            const updatePos = () => {
                const rect = wrapper.getBoundingClientRect(); panel.className = (rect.left + rect.width/2) < window.innerWidth/2 ? 'pos-right' : 'pos-left';
                if((rect.top + rect.height/2) > window.innerHeight*0.6) panel.classList.add('pos-top-align');
            };
            const onDown = (e) => {
                isDragging = false; startX = e.clientX || e.touches[0].clientX; startY = e.clientY || e.touches[0].clientY;
                const rect = wrapper.getBoundingClientRect(); initialLeft = rect.left; initialTop = rect.top; avatar.style.cursor = 'grabbing';
                const onMove = (me) => {
                    const cx = me.clientX || (me.touches ? me.touches[0].clientX : 0); const cy = me.clientY || (me.touches ? me.touches[0].clientY : 0);
                    if (Math.abs(cx-startX)>5 || Math.abs(cy-startY)>5) isDragging=true;
                    if(isDragging) { wrapper.style.left = (initialLeft+(cx-startX))+'px'; wrapper.style.top = (initialTop+(cy-startY))+'px'; updatePos(); }
                };
                const onUp = () => {
                    document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); document.removeEventListener('touchmove', onMove); document.removeEventListener('touchend', onUp);
                    avatar.style.cursor = 'move'; if(!isDragging) this.togglePanel(parentWin); isDragging=false;
                };
                document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp); document.addEventListener('touchmove', onMove, {passive:false}); document.addEventListener('touchend', onUp);
            };
            avatar.addEventListener('mousedown', onDown); avatar.addEventListener('touchstart', (e)=>{e.preventDefault(); onDown(e)}, {passive:false});
            updatePos();
        },

        togglePanel(parentWin) {
            const p = document.getElementById(panelId); p.style.display = p.style.display==='none'?'flex':'none'; if(p.style.display==='flex') { updateUI(); }
        },

        showBubble(parentWin, msg, color=null) {
            let b = document.getElementById(bubbleId); if (b) b.remove();
            b = document.createElement('div'); b.id = bubbleId; if(color) b.style.borderColor = color;
            b.innerHTML = `<span style="color:var(--l-cyan)">[莉莉丝]</span> ${msg.length > 200 ? msg.substring(0, 198) + "..." : msg}`;
            if (userState.sanity < 30) b.style.borderColor = '#ff0000';
            b.onclick = () => b.remove(); 
            document.getElementById(containerId).appendChild(b);
            
            // 动态时长计算: 基础 5秒 + 每字 0.35秒 (确保语音/阅读能完成)
            const duration = Math.max(5000, msg.length * 350);
            setTimeout(() => { if(b.parentNode) b.remove(); }, duration);
        },

        async fetchModels(parentWin) {
             const { apiType, apiKey, baseUrl } = this.config;
             const msgBox = document.getElementById('cfg-msg'); const select = document.getElementById('cfg-model-select'); const input = document.getElementById('cfg-model');
             if(!apiKey) { msgBox.textContent = "❌ 没Key玩个屁"; return; }
             msgBox.textContent = "⏳ 正在摸索...";
             try {
                 let url = baseUrl.replace(/\/$/, ''); let fetchedModels = [];
                 if (apiType === 'openai') {
                     if (!url.endsWith('/v1')) url += '/v1';
                     const res = await fetch(`${url}/models`, { headers: { 'Authorization': `Bearer ${apiKey}` } });
                     const data = await res.json(); if(data.data) fetchedModels = data.data.map(m => m.id);
                 } else {
                     const res = await fetch(`${url}/v1beta/models?key=${apiKey}`);
                     const data = await res.json(); if(data.models) fetchedModels = data.models.map(m => m.name.replace('models/', ''));
                 }
                 if(fetchedModels.length > 0) {
                     select.innerHTML = `<option value="">⬇️ 选一个合适的肉体 (${fetchedModels.length})</option>` + fetchedModels.map(m => `<option value="${m}">${m}</option>`).join('');
                     select.style.display = 'block'; select.onchange = () => { if(select.value) input.value = select.value; }; msgBox.textContent = "✅ 连接上了";
                 } else { msgBox.textContent = "⚠️ 啥都没有"; }
             } catch(e) { console.error(e); msgBox.textContent = "❌ 烂掉了: " + e.message; }
        },

        bindPanelEvents(parentWin) {
            ['mousemove', 'keydown', 'click', 'scroll'].forEach(evt => {
                document.addEventListener(evt, () => { this.lastActivityTime = Date.now(); this.isIdleTriggered = false; }, { passive: true });
            });

            const runTool = async (name) => {
                const toolOutput = document.getElementById('tool-output-area'); toolOutput.innerHTML = `<div class="scan-line-s"></div><div style="color:var(--l-cyan);">⚡ 正在运行肮脏的协议 [${name}]...</div>`;
                const contextMsg = getPageContext(name === "废物体检报告" ? 100 : 25);
                const contextStr = contextMsg.map(m => `[${m.name}]: ${m.message}`).join('\n');
                const safeContext = `[TARGET DATA START]\n${contextStr}\n[TARGET DATA END]`;
                let specificPrompt = ""; let isInteractive = false; let sysPersona = getDynamicPersona();

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
                    const cleanNote = reply.replace(/```/g, '').trim(); this.sendToSillyTavern(parentWin, cleanNote + "\n", false);
                    toolOutput.innerHTML = `<div style="color:#0f0;">✅ 注入完成</div><div style="font-size:10px; color:#888;">${cleanNote}</div>`;
                    AudioSys.speak("哼，脑子坏掉了吧。"); this.showBubble(parentWin, "催眠指令已填入。");
                }
                else if (isInteractive && reply) {
                    toolOutput.innerHTML = `<div class="tool-result-header">💠 ${name}结果</div><div id="branch-container"></div>`;
                    const container = document.getElementById('branch-container');
                    if (name === "强制福利事件") {
                         const card = document.createElement('div'); card.className = 'branch-card'; card.style.borderColor = '#ff0055'; card.style.background = 'rgba(255,0,85,0.1)';
                         card.innerHTML = `<div style="font-size:10px; color:#ff0055">[福利事件]</div><div style="font-size:12px; color:#ddd;">${reply}</div>`;
                         card.onclick = () => { this.sendToSillyTavern(parentWin, reply, false); }; container.appendChild(card); return;
                    }
                    let lines = reply.split('\n').filter(line => line.match(/^\d+\.|\[/)); if (lines.length === 0) lines = [reply];
                    lines.forEach(line => {
                        const match = line.match(/\[(.*?)\]\s*(.*)/); const tag = match ? match[1] : "选项"; const content = match ? match[2] : line.replace(/^\\d+[\.\\:：]\s*/, '').trim();
                        let colorStyle = "border-color: #444;"; let cost = 0; let tagDisplay = tag;
                        if (name === "替你回复") {
                            if (tag.includes("上策")) { cost = -50; colorStyle = "border-color: #00f3ff; background: rgba(0,243,255,0.1);"; tagDisplay += " (-50FP)"; }
                            else if (tag.includes("中策")) { cost = -25; colorStyle = "border-color: #00ff00; background: rgba(0,255,0,0.1);"; tagDisplay += " (-25FP)"; }
                            else if (tag.includes("下策")) { cost = 10; colorStyle = "border-color: #bd00ff; background: rgba(189,0,255,0.1);"; tagDisplay += " (+10FP)"; }
                        } else { if (tag.includes("作死") || tag.includes("Risk") || tag.includes("色")) colorStyle = "border-color: #ff0055; background: rgba(255,0,85,0.1);"; else if (tag.includes("奇怪")) colorStyle = "border-color: #bd00ff; background: rgba(189,0,255,0.1);"; }
                        const card = document.createElement('div'); card.className = 'branch-card'; card.style.cssText = `margin-bottom:8px; padding:10px; border:1px solid; border-left-width:4px; cursor:pointer; transition:0.2s; ${colorStyle}`;
                        card.innerHTML = `<div style="font-size:10px; font-weight:bold; color:#aaa; margin-bottom:4px;">[${tagDisplay}]</div><div style="font-size:12px; color:#ddd; line-height:1.4;">${content}</div>`;
                        card.onclick = () => {
                            card.style.opacity = '0.5'; card.style.transform = 'scale(0.98)';
                            if (cost !== 0) { userState.fatePoints += cost; saveState(); const payload = `${content} | /setvar key=fate_points value=${userState.fatePoints}`; this.sendToSillyTavern(parentWin, payload, false); this.showBubble(parentWin, `已填入 (FP变动: ${cost})`); assistantManager.updateFP(parentWin, userState.fatePoints); }
                            else { this.sendToSillyTavern(parentWin, content, false); this.showBubble(parentWin, `已填入：[${tag}] 路线`); }
                        };
                        container.appendChild(card);
                    });
                } else {
                    toolOutput.innerHTML = `<div class="tool-result-header">🔰 莉莉丝的评价</div><div class="tool-result-body" style="white-space: pre-wrap;">${(reply||'无数据').replace(/\*\*(.*?)\*\*/g, '<span class="hl">$1</span>')}</div>`;
                    if(name === "废物体检报告") AudioSys.speak("真是一份恶心的报告。");
                }
            };

            document.getElementById('lilith-mute-btn')?.addEventListener('click', (e) => { const isMuted = AudioSys.toggleMute(); e.target.innerText = isMuted ? '🔇' : '🔊'; e.stopPropagation(); });
            document.querySelectorAll('.lilith-tab').forEach(tab => { tab.addEventListener('click', () => { document.querySelectorAll('.lilith-tab').forEach(t => t.classList.remove('active')); document.querySelectorAll('.lilith-page').forEach(p => p.classList.remove('active')); tab.classList.add('active'); document.getElementById(`page-${tab.dataset.target}`).classList.add('active'); }); });
            const sendBtn = document.getElementById('lilith-chat-send'); const input = document.getElementById('lilith-chat-input');
            const doSend = async () => {
                const txt = input.value.trim(); if(!txt) return; this.addChatMsg(parentWin, 'user', txt); input.value = ''; this.addChatMsg(parentWin, 'lilith', '...');
                const reply = await this.callUniversalAPI(parentWin, txt, { isChat: true }); const h = document.getElementById('lilith-chat-history'); if(h.lastChild && h.lastChild.textContent==='...') h.lastChild.remove();
                let cleanReply = reply || '❌ 这种垃圾话我都懒得回';
                if (reply) { const sMatch = reply.match(/\[S:([+\-]?\d+)\]/); const fMatch = reply.match(/\[F:([+\-]?\d+)\]/); if (sMatch) updateSanity(sMatch[1]); if (fMatch) updateFavor(fMatch[1]); cleanReply = reply.replace(/\[[SF]:[+\-]?\d+\]/g, '').trim(); }
                this.addChatMsg(parentWin, 'lilith', cleanReply); if (reply) this.updateAvatarExpression(parentWin, reply); AudioSys.speak(cleanReply);
            };
            sendBtn.addEventListener('click', doSend); input.addEventListener('keydown', (e) => { if(e.key === 'Enter') { e.stopPropagation(); doSend(); } });
            document.getElementById('lilith-polish-btn').addEventListener('click', async () => {
                const raw = input.value.trim(); if(!raw) return; input.value = ''; this.addChatMsg(parentWin, 'user', `[魔改] ${raw}`); this.addChatMsg(parentWin, 'lilith', '✍️ 改写中...');
                const refined = await this.callUniversalAPI(parentWin, `[Original]: ${raw}\n[Task]: Rewrite this to be more erotic/novel-like. Chinese.`, { isChat: true, systemPrompt: WRITER_PERSONA });
                const h = document.getElementById('lilith-chat-history'); if(h.lastChild && h.lastChild.textContent.includes('改写中')) h.lastChild.remove(); this.addChatMsg(parentWin, 'lilith', refined || 'Error');
            });
            document.getElementById('btn-force-memory').addEventListener('click', () => { if(confirm("确定要强制压缩当前对话为记忆吗？这会清除短期记录。")) this.checkAndSummarize(parentWin, true); });
            const personaSelect = document.getElementById('cfg-persona-select');
            if (personaSelect) {
                personaSelect.addEventListener('change', () => {
                    const newKey = personaSelect.value;
                    userState.activePersona = newKey;
                    
                    // 应用推荐声线
                    if (PERSONA_DB[newKey] && PERSONA_DB[newKey].voice) {
                        userState.ttsConfig = { ...PERSONA_DB[newKey].voice };
                        
                        // 更新UI滑块
                        const pSlider = document.getElementById('tts-pitch');
                        const rSlider = document.getElementById('tts-rate');
                        if(pSlider) pSlider.value = userState.ttsConfig.pitch;
                        if(rSlider) rSlider.value = userState.ttsConfig.rate;
                        
                        const pVal = document.getElementById('tts-pitch-val');
                        const rVal = document.getElementById('tts-rate-val');
                        if(pVal) pVal.textContent = userState.ttsConfig.pitch;
                        if(rVal) rVal.textContent = userState.ttsConfig.rate;
                    }
                    
                    saveState();
                });
            }

            // Comment Mode Selector
            const commentModeSelect = document.getElementById('cfg-comment-mode');
            if (commentModeSelect) {
                commentModeSelect.addEventListener('change', () => {
                    userState.commentMode = commentModeSelect.value;
                    saveState();
                    this.showBubble(parentWin, `模式已切换: ${userState.commentMode === 'random' ? '随机正文插入' : '末尾追加'}`);
                });
            }

            // TTS 滑块监听
            const ttsPitch = document.getElementById('tts-pitch');
            const ttsRate = document.getElementById('tts-rate');
            const updateTTS = () => {
                userState.ttsConfig.pitch = parseFloat(ttsPitch.value);
                userState.ttsConfig.rate = parseFloat(ttsRate.value);
                document.getElementById('tts-pitch-val').textContent = userState.ttsConfig.pitch;
                document.getElementById('tts-rate-val').textContent = userState.ttsConfig.rate;
                saveState();
            };
            if(ttsPitch) ttsPitch.addEventListener('input', updateTTS);
            if(ttsRate) ttsRate.addEventListener('input', updateTTS);
            
            // Interaction Frequency Slider
            const freqSlider = document.getElementById('cfg-freq');
            if (freqSlider) {
                freqSlider.addEventListener('input', () => {
                    userState.commentFrequency = parseInt(freqSlider.value);
                    document.getElementById('cfg-freq-val').textContent = userState.commentFrequency;
                    saveState();
                });
            }

            document.getElementById('tts-test-btn')?.addEventListener('click', () => {
                AudioSys.speak("正在测试语音设置。莉莉丝为您服务。");
            });

            document.getElementById('tool-analyze').addEventListener('click', () => runTool("局势嘲讽"));
            document.getElementById('tool-audit').addEventListener('click', () => runTool("找茬模式"));
            document.getElementById('tool-branch').addEventListener('click', () => runTool("恶作剧推演"));
            document.getElementById('tool-kink').addEventListener('click', () => runTool("性癖羞辱"));
            document.getElementById('tool-event').addEventListener('click', () => runTool("强制福利事件"));
            document.getElementById('tool-hack').addEventListener('click', () => runTool("催眠洗脑"));
            document.getElementById('tool-profile').addEventListener('click', () => runTool("废物体检报告"));
            document.getElementById('tool-ghost').addEventListener('click', () => runTool("替你回复"));
            const gachaSys = this.gachaSystem;
            if (document.getElementById('gacha-fp-val')) { document.getElementById('gacha-fp-val').textContent = userState.fatePoints; gachaSys.updateInventoryUI(parentWin); }
            document.getElementById('btn-pull-1').addEventListener('click', () => gachaSys.doPull(parentWin, 1));
            document.getElementById('btn-pull-10').addEventListener('click', () => gachaSys.doPull(parentWin, 10));
            document.getElementById('btn-claim').addEventListener('click', () => gachaSys.claimRewards(parentWin, this));
            document.getElementById('btn-sync-fp').addEventListener('click', () => { const val = parseInt(document.getElementById('manual-fp-input').value); if (!isNaN(val)) { assistantManager.updateFP(parentWin, val); this.showBubble(parentWin, `行吧，你的点数变成 ${val} 了。`); } });
            document.getElementById('cfg-test').addEventListener('click', async () => {
                const msgBox = document.getElementById('cfg-msg'); msgBox.textContent = "⏳ 戳一下服务器..."; msgBox.style.color = "#fff";
                try {
                    const res = await this.callUniversalAPI(parentWin, "Ping", { isChat: false, systemPrompt: "You are Lilith. Just say 'Hmph' or 'What?'." });
                    if (res) { msgBox.textContent = "✅ 活的: " + res; msgBox.style.color = "#00f3ff"; } else { msgBox.textContent = "❌ 死了"; msgBox.style.color = "#ff0055"; }
                } catch (e) { msgBox.textContent = "❌ 连不上: " + e.message; msgBox.style.color = "#ff0055"; }
            });
            document.getElementById('cfg-save').addEventListener('click', () => {
                this.config.apiType = document.getElementById('cfg-type').value; this.config.apiKey = document.getElementById('cfg-key').value.trim(); this.config.baseUrl = document.getElementById('cfg-url').value.trim(); this.config.model = document.getElementById('cfg-model').value.trim();
                
                // Save Appearance Settings
                userState.hideAvatar = document.getElementById('cfg-hide-avatar').checked;
                userState.avatarSize = parseInt(document.getElementById('cfg-avatar-size').value);
                
                // Save Comment Settings (Sync to UserState)
                userState.commentFrequency = parseInt(document.getElementById('cfg-freq').value);
                userState.commentMode = document.getElementById('cfg-comment-mode').value;

                saveState();
                
                getExtensionSettings().apiConfig = this.config;
                getExtensionSettings().userState = userState;
                saveExtensionSettings();

                this.updateAvatarStyle(parentWin);
                
                // [Sync] Update Extension Settings Panel if open
                $('#lilith-comment-frequency').val(userState.commentFrequency);
                $('#lilith-freq-value').text(`${userState.commentFrequency}%`);
                $('#lilith-comment-mode').val(userState.commentMode);
                $('#lilith-hide-avatar').prop('checked', userState.hideAvatar);
                $('#lilith-avatar-size').val(userState.avatarSize);

                const msgBox = document.getElementById('cfg-msg'); msgBox.textContent = "✅ 记住了"; msgBox.style.color = "#0f0";
            });
            document.getElementById('cfg-get-models').addEventListener('click', () => this.fetchModels(parentWin));
            document.getElementById('cfg-clear-mem').addEventListener('click', () => { 
                if(confirm("要把我也忘了吗？渣男。")) { 
                    panelChatHistory = [];
                    getExtensionSettings().chatHistory = [];
                    
                    userState = JSON.parse(JSON.stringify(DEFAULT_STATE));
                    saveState();
                    
                    this.restoreChatHistory(parentWin); 
                    this.renderMemoryUI(parentWin); 
                    updateUI(); 
                } 
            });
        },

        updateAvatarExpression(parentWin, reply) {
            if (reply.includes('❤') || reply.includes('想要') || reply.includes('好热')) this.setAvatar(parentWin, 'horny');
            else if (reply.includes('杂鱼') || reply.includes('弱') || reply.includes('笑死')) this.setAvatar(parentWin, 'mockery');
            else if (reply.includes('恶心') || reply.includes('变态') || reply.includes('垃圾')) this.setAvatar(parentWin, 'disgust');
            else if (reply.includes('[S:-') || reply.includes('滚') || reply.includes('死') || reply.includes('怒')) this.setAvatar(parentWin, 'angry');
            else if (reply.includes('...') || reply.includes('……') || reply.includes('无语')) this.setAvatar(parentWin, 'speechless');
            else if (reply.includes('[F:+') || reply.includes('哼哼') || reply.includes('不错') || reply.includes('笑')) this.setAvatar(parentWin, 'happy');
            else this.setAvatar(parentWin, 'normal');
        },

        sendToSillyTavern(parentWin, text, autoSend = true) {
            const stInput = document.getElementById('send_textarea'); const stBtn = document.getElementById('send_but'); let inputEl = stInput || document.querySelector('#chat_input, textarea');
            if (inputEl && stBtn) {
                let newText = text; if (!autoSend && inputEl.value) { if (text.includes('[系统') || text.includes('/echo') || text.includes('[福利')) newText = text + "\n" + inputEl.value; }
                const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
                if(nativeInputValueSetter) { nativeInputValueSetter.call(inputEl, newText); } else { inputEl.value = newText; }
                inputEl.dispatchEvent(new Event('input', { bubbles: true })); inputEl.dispatchEvent(new Event('change', { bubbles: true }));
                if (autoSend) { setTimeout(() => stBtn.click(), 100); } else { inputEl.focus(); }
            } else { alert("找不到输入框，这破网页是不是坏了？"); }
        },

        async callUniversalAPI(parentWin, text, options = {}) {
            const { isChat = false, mode = "normal", systemPrompt = null } = options; const isInternal = mode === 'memory_internal';
            const { apiType, apiKey, baseUrl, model } = this.config; if (!apiKey) return null;
            let url = baseUrl.replace(/\/$/, ''); let finalSystemPrompt = systemPrompt || getDynamicPersona();
            const memoryBlock = userState.memoryArchive.length > 0 ? `\n[Long-term Memory / Previous Context]:\n${userState.memoryArchive.join('\n')}\n` : "";
            if (!isInternal) { if (mode === "roast") finalSystemPrompt += "\n[Task: Roast within story context. Short. Toxic.]"; else if (isChat) { finalSystemPrompt += `\n${JAILBREAK}\n[Constraint: Response must be detailed.]`; finalSystemPrompt += memoryBlock; } else finalSystemPrompt += `\n${JAILBREAK}`; }
            try {
                let msgs = isChat && !isInternal ? [{ role: 'system', content: finalSystemPrompt }, ...panelChatHistory, { role: 'user', content: text }] : [{ role: 'user', content: finalSystemPrompt + "\n" + text }];
                let fetchUrl, fetchBody, fetchHeaders;
                if (apiType === 'openai') {
                    if (!url.endsWith('/v1')) url += '/v1'; fetchUrl = `${url}/chat/completions`; fetchHeaders = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` };
                    fetchBody = JSON.stringify({ model: model, messages: msgs, max_tokens: 4096, temperature: 1.0 });
                } else {
                    let modelId = model; if (!modelId.startsWith('models/') && !url.includes(modelId)) modelId = 'models/' + modelId;
                    fetchUrl = `${url}/v1beta/${modelId}:generateContent?key=${apiKey}`;
                    let promptText = isChat ? msgs.map(m => `[${m.role === 'lilith' ? 'Model' : (m.role==='system'?'System':'User')}]: ${m.content}`).join('\\n') : msgs[0].content;
                    fetchHeaders = { 'Content-Type': 'application/json' }; fetchBody = JSON.stringify({ contents: [{ role: 'user', parts: [{ text: promptText }] }], generationConfig: { maxOutputTokens: 4096 } });
                }
                const response = await fetch(fetchUrl, { method: 'POST', headers: fetchHeaders, body: fetchBody });
                const data = await response.json();
                let reply = apiType === 'openai' ? data.choices?.[0]?.message?.content : data.candidates?.[0]?.content?.parts?.[0]?.text;
                reply = reply?.trim();
                if (isChat && reply && !isInternal) { panelChatHistory.push({role:'user', content:text}); panelChatHistory.push({role:'lilith', content:reply}); saveChat(); this.checkAndSummarize(parentWin); }
                return reply;
            } catch(e) { console.error("API Error:", e); return null; }
        },

        addChatMsg(parentWin, role, text) {
            const div = document.getElementById('lilith-chat-history'); if(!div) return;
            const msg = document.createElement('div'); msg.className = `msg ${role}`; msg.textContent = text;
            div.appendChild(msg); div.scrollTop = div.scrollHeight;
        }
    };

    function updateUI() {
        const elVal = document.getElementById('favor-val'); const elSan = document.getElementById('sanity-val');
        if(elVal) elVal.textContent = userState.favorability + '%';
        if(elSan) elSan.textContent = userState.sanity + '%';
        assistantManager.setAvatar();
    }

    async function initUI() {
        try {
            const htmlPath = `/scripts/extensions/third-party/${extensionName}/settings.html`;
            const settingsHtml = await $.get(htmlPath);
            $('#extensions_settings').append(settingsHtml);

            // 绑定数据
            const $freq = $('#lilith-comment-frequency');
            const $freqVal = $('#lilith-freq-value');
            const $mode = $('#lilith-comment-mode');
            const $hideAvatar = $('#lilith-hide-avatar');
            const $avatarSize = $('#lilith-avatar-size');

            $freq.val(userState.commentFrequency || 0);
            $freqVal.text(`${userState.commentFrequency || 0}%`);
            $mode.val(userState.commentMode || 'random');
            $hideAvatar.prop('checked', userState.hideAvatar);
            $avatarSize.val(userState.avatarSize || 150);

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
                assistantManager.setAvatar();
                assistantManager.updateAvatarStyle(window);
                
                // [Sync] Update Floating Panel
                const cfgHide = document.getElementById('cfg-hide-avatar');
                if(cfgHide) cfgHide.checked = userState.hideAvatar;

                saveExtensionSettings();
            });

            $avatarSize.on('input', (e) => { 
                userState.avatarSize = parseInt($(e.target).val());
                assistantManager.updateAvatarStyle(window);
                
                // [Sync] Update Floating Panel
                const cfgSize = document.getElementById('cfg-avatar-size');
                const cfgSizeVal = document.getElementById('cfg-size-val');
                if(cfgSize) cfgSize.value = userState.avatarSize;
                if(cfgSizeVal) cfgSizeVal.textContent = userState.avatarSize;

                saveExtensionSettings();
            });

            $('#lilith-toggle-panel').on('click', () => {
                assistantManager.togglePanel(window);
            });

            $('#lilith-reset-state').on('click', () => {
                if (confirm('确定要重置莉莉丝的状态吗？这会清空好感度与记忆。')) {
                    userState.favorability = 20;
                    userState.sanity = 80;
                    userState.fatePoints = 1000;
                    userState.gachaInventory = [];
                    updateUI();
                    saveExtensionSettings();
                    alert('状态已重置');
                }
            });

            console.log('[Lilith] Settings UI initialized');
        } catch (err) {
            console.error('[Lilith] Failed to load settings UI:', err);
        }
    }

    // --- ST Extension Loader ---
    // --- 消息动态格式化 (内置美化正则) ---
    function applyLilithFormatting(element) {
        if (!element) return;
        const $el = $(element);
        
        // 确保找到消息主体容器 (.mes_text)
        const mesText = $el.find('.mes_text').length ? $el.find('.mes_text') : ($el.hasClass('mes_text') ? $el : null);
        if (!mesText || mesText.length === 0) return;

        // 避免重复处理
        if (mesText.find('.lilith-chat-ui-wrapper').length > 0) return;

        // 我们只提取一次 [莉莉丝] 段落，把它剪下并在原位置附近插入一张卡片，
        // 避免对原有 HTML 结构做复杂替换导致文字缺失，同时保留“随机插入正文”的相对位置感。
        let hasModified = false;
        let commentText = null;
        let insertAfterNode = null;

        // 递归扫描文本节点，找到包含 "[莉莉丝]" 的节点并剪下这部分文本
        const walk = (node) => {
            if (!node || commentText !== null) return;
            const children = Array.from(node.childNodes);
            for (const child of children) {
                if (commentText !== null) break;

                if (child.nodeType === 3) { // 文本节点
                    const text = child.nodeValue;
                    const marker = '[莉莉丝]';
                    if (text && text.includes(marker)) {
                        const idx = text.indexOf(marker);
                        const before = text.slice(0, idx);
                        const after = text.slice(idx + marker.length);

                        // 1. 保留原本的前半段正文
                        child.nodeValue = before;
                        
                        // 2. 收集从标记开始到当前容器结束的所有内容
                        let collected = after;
                        let next = child.nextSibling;
                        while (next) {
                            let nextToProcess = next.nextSibling;
                            if (next.nodeType === 3) { // 文本
                                collected += next.nodeValue;
                            } else if (next.nodeType === 1) { // 元素 (如 <br>, <span>)
                                collected += next.outerHTML;
                            }
                            next.remove(); // 将这些原本在外的节点移除
                            next = nextToProcess;
                        }

                        commentText = collected.trim();
                        insertAfterNode = child;
                        hasModified = true;
                    }
                } else if (child.nodeType === 1) { // 元素节点
                    if (!child.classList.contains('lilith-chat-ui-wrapper') && 
                        !['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT'].includes(child.tagName)) {
                        walk(child);
                    }
                }
            }
        };

        walk(mesText[0]);

        if (hasModified && commentText) {
            const allAssets = [
                'brat_angry.png', 'brat_disgust.png', 'brat_happy.png', 'brat_horny.png', 'brat_love.png', 'brat_mockery.png', 'brat_normal.png', 'brat_speechless.png',
                'imouto_angry.png', 'imouto_disgust.png', 'imouto_happy.png', 'imouto_horny.png', 'imouto_love.png', 'imouto_mockery.png', 'imouto_normal.png', 'imouto_speechless.png',
                'meme_angry.png', 'meme_disgust.png', 'meme_happy.png', 'meme_high.png', 'meme_horny.png', 'meme_mockery.png', 'meme_normal.png', 'meme_speechless.png',
                'toxic_angry.png', 'toxic_disgust.png', 'toxic_happy.png', 'toxic_horny.png', 'toxic_love.png', 'toxic_mockery.png', 'toxic_normal.png', 'toxic_speechless.png',
                'wife_angry.png', 'wife_disgust.png', 'wife_happy.png', 'wife_horny.png', 'wife_love.png', 'wife_mockery.png', 'wife_normal.png', 'wife_speechless.png'
            ];
            const randomAsset = allAssets[Math.floor(Math.random() * allAssets.length)];
            const avatarUrl = `${assistantManager.extensionPath}/assets/${randomAsset}`;

            const cardHtml = `
                <div class="lilith-chat-ui-wrapper">
                    <div class="lilith-chat-ui" title="点击重播语音">
                        <div class="lilith-chat-avatar" style="background-image: url('${avatarUrl}')"></div>
                        <div class="lilith-chat-text">${commentText}</div>
                    </div>
                </div>`;

            // 优先在原 [莉莉丝] 文本节点之后插入卡片，保持“随机插入正文”的相对位置；
            // 如果找不到合适节点，则退回到在消息末尾追加。
            if (insertAfterNode) {
                $(insertAfterNode).after(cardHtml);
            } else {
                mesText.append(cardHtml);
            }
            console.log('[Lilith] Internal rendering applied successfully.');
        }
    }

    function init() {
        console.log('[Lilith] Initializing Assistant Extension...');
        assistantManager.initStruct();
        initUI();
        
        // --- 注册内置渲染钩子 (内置美化正则) ---
        try {
            const context = SillyTavern.getContext();
            const { eventSource, event_types } = context;
            if (eventSource && event_types) {
                // 监听所有可能的消息变更事件
                const renderEvents = [
                    event_types.CHARACTER_MESSAGE_RENDERED,
                    event_types.USER_MESSAGE_RENDERED,
                    event_types.MESSAGE_UPDATED,
                    'message_rendered'
                ];

                // 事件回调参数为 message_id / 楼层 id，对应 DOM 中的 mesid 属性
                renderEvents.forEach(evt => {
                    if (evt) eventSource.on(evt, (messageId) => {
                        setTimeout(() => {
                            let el = null;

                            if (typeof messageId === 'number' && !Number.isNaN(messageId)) {
                                el = document.querySelector(`div.mes[mesid="${messageId}"]`);
                            }

                            // 兜底：如果按 mesid 没找到，就取最后一层
                            if (!el) {
                                const allMes = document.querySelectorAll('.mes');
                                if (allMes.length > 0) {
                                    el = allMes[allMes.length - 1];
                                }
                            }

                            if (el) {
                                applyLilithFormatting(el);
                            }
                        }, 100);
                    });
                });

                // 初始全量扫描 (处理打开对话时已有的消息)
                setTimeout(() => {
                    console.log('[Lilith] Running initial message scan...');
                    $('.mes').each((i, el) => applyLilithFormatting(el));
                }, 1500);

                // 兜底方案：MutationObserver 监听聊天区域
                const chatObserver = new MutationObserver((mutations) => {
                    mutations.forEach(mutation => {
                        mutation.addedNodes.forEach(node => {
                            if (node.nodeType === 1 && (node.classList.contains('mes') || node.querySelector('.mes'))) {
                                const mesElem = node.classList.contains('mes') ? node : node.querySelector('.mes');
                                applyLilithFormatting(mesElem);
                            }
                        });
                    });
                });
                const chatContainer = document.getElementById('chat');
                if (chatContainer) {
                    chatObserver.observe(chatContainer, { childList: true, subtree: true });
                }
            }
        } catch (e) {
            console.error('[Lilith] Rendering hooks setup failed:', e);
        }

        try {
            const context = SillyTavern.getContext();
            const { eventSource, event_types } = context;

            if (eventSource && event_types) {
                console.log('[Lilith] Event listeners registering...');

                // 1. 注册回复结束监听 (生成结束后注入吐槽)
                eventSource.on(event_types.GENERATION_ENDED, async () => {
                    const chatData = SillyTavern.getContext().chat;
                    if (!chatData || chatData.length === 0) return;

                    // 获取最后一条消息及其 message_id / mesid（楼层 ID）
                    const lastIndex = chatData.length - 1;
                    const lastMsg = chatData[lastIndex];
                    if (!lastMsg) return;

                    const messageId =
                        (typeof lastMsg.message_id === 'number' ? lastMsg.message_id :
                        (typeof lastMsg.mesid === 'number' ? lastMsg.mesid :
                        lastIndex));
                    
                    console.log(`[Lilith] GENERATION_ENDED. Using messageId: ${messageId}, arrayIndex: ${lastIndex}`);
                    
                    // 只有 AI 的回复才触发吐槽
                    if (!lastMsg.is_user && !lastMsg.is_system && lastMsg.mes && !lastMsg.mes.includes('[莉莉丝]')) {
                        const freq = userState.commentFrequency || 0;
                        const dice = Math.random() * 100;
                        
                        if (dice < freq) {
                            console.log('[Lilith] Interaction triggered after generation!');
                            setTimeout(() => {
                                // 传入楼层 ID / message_id，后续逻辑全部按 message_id 处理
                                assistantManager.triggerRealtimeComment(messageId);
                            }, 1000);
                        }
                    }
                });

                // 2. 注册发送前过滤 (不发送吐槽内容给 AI)
                eventSource.on(event_types.GENERATE_BEFORE_COMBINE_PROMPTS, (data) => {
                    if (data && data.chat) {
                        let count = 0;
                        data.chat.forEach(msg => {
                            if (msg.mes && msg.mes.includes('[莉莉丝]')) {
                                msg.mes = msg.mes.replace(/\[莉莉丝\][\s\S]*?(?=\n\n|$)/g, '').trim();
                                count++;
                            }
                        });
                        if (count > 0) console.log(`[Lilith] Filtered ${count} comments from prompt.`);
                    }
                });
            } else {
                console.warn('[Lilith] eventSource or event_types not found in context!');
            }
        } catch (e) {
            console.error('[Lilith] Failed to setup event listeners:', e);
        }

        // 注册消息渲染钩子
        $(document).on('click', '.lilith-chat-ui', function() {
           const text = $(this).find('.lilith-chat-text').text();
           if (text) AudioSys.speak(text);
        });
    }

    // 这里的 jQuery(document).ready 是 ST 加载插件的常规方式
    jQuery(document).ready(function() {
        // 尝试监听 APP_READY 事件，这是更标准的做法
        // 但为了兼容，如果 eventSource 不可用，就直接 init
        const tryInit = () => {
             // 避免重复初始化
             if (window._lilithInitialized) return;
             window._lilithInitialized = true;
             init();
        };

        if (window.eventSource && window.event_types) {
             window.eventSource.on(window.event_types.APP_READY, () => {
                 console.log('[Lilith] APP_READY received.');
                 tryInit();
             });
             // 防止插件加载晚了，miss 掉了 APP_READY
             setTimeout(tryInit, 1000); 
        } else {
             tryInit();
        }
    });

})();
