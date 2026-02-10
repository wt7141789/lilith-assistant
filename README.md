# 莉莉丝助手 (Lilith Assistant) - SillyTavern 插件

![Version](https://img.shields.io/badge/version-2.5.0--Final-purple)
![SillyTavern](https://img.shields.io/badge/SillyTavern-Extension-blue)

一个为人格化助手“莉莉丝”设计的 SillyTavern (酒馆) 扩展组件。本项目已全面升级至 **v2.5.0 正式版**，核心逻辑完全模块化设计。

> **v2.5.0 更新亮点**：
> 1. **🛡️ 正则清理方案 (RegEx Schemes)**：新增独立的正则方案管理系统，支持正文提取、文字替换及其启用状态的一键归档与切换。
> 2. **💬 手动吐槽功能**：在互动界面和功能页新增手动吐槽入口，莉莉丝将基于经过正则净化的上下文对主线剧情进行实时锐评。
> 3. **🔒 保护标记系统**：引入 `[莉莉丝] ... [/莉莉丝]` 双闭合标记，完美解决酒馆正文渲染导致的回答泄露与正文污染问题。
> 4. **📱 现代 UI 重构**：采用“胶囊型”输入框、FontAwesome 专业图标库、优化的头像呼吸灯特效及更符合直觉的设置布局。
> 5. **🔄 深度同步联动**：悬浮面板与酒馆侧边栏设置实现双向实时同步，确保操作体验高度一致。

## 🌟 核心功能

- **🎭 五重人格切换**：毒舌魅魔、温柔人妻、雌小鬼、网络神人、柔弱妹妹。
- **📊 动态数值系统**：内置好感度 (Favorability) 与 理智值 (Sanity)，根据聊天内容动态增减。
- **🛡️ 智能正则盾**：支持自定义正则规则，自动过滤 AI 回复中的冗余内容或特定的剧情标签。
- **🎲 赌狗抽卡系统**：消耗 FP 点数从垃圾堆到神迹品质的随机道具获取。
- **🧠 记忆压缩归档**：自动对长对话进行 AI 总结并归档至“记忆碎片”，减少上下文压力。
- **✨ 模块化架构**：核心逻辑高度解耦，响应迅速，支持多种 API 协议 (OpenAI/Gemini)。

## 📂 插件结构

重构后的插件采用分层模块化设计，方便开发者进行二次开发或自定义：

```text
lilith-assistant/
├── index.js                # 插件入口，负责系统引导与启动
├── manifest.json           # 插件元数据配置
├── style.css               # UI 样式表
├── modules/                # 核心功能模块
│   ├── config.js           # 集中存放常量、配置及人格定义 (PERSONA_DB)
│   ├── storage.js          # 持久化存储，负责与酒馆 extensionSettings 同步
│   ├── assistant_manager.js# 逻辑中枢 (API 调用、心跳、抽卡、任务系统)
│   ├── ui_manager.js       # 渲染引擎 (HTML 生成、立绘管理、消息格式化)
│   ├── events.js           # 系统钩子 (监听酒馆消息渲染、发送前过滤等)
│   ├── audio.js            # 语音合成与播报
│   ├── persona.js          # 动态人格生成逻辑
│   └── utils.js            # 共享工具函数
└── assets/                 # 静态资源 (头像包、导出数据等)
```

## 🚀 安装方法

1.  打开 SillyTavern (酒馆)。
2.  进入 **扩展菜单 (Extensions)** -> **安装新扩展 (Install New Extension)**。
3.  在 URL 框中输入：`https://github.com/wt7141789/lilith-assistant`
4.  点击 **安装 (Install)**。
5.  在扩展设置中启用插件。

## ⚙️ 配置说明

插件支持三种连接模式：
- **酒馆内核 (推荐)**：使用酒馆当前的 API 设置。
- **OpenAI 兼容接口**：自定义 API Key 和 Endpoint。
- **Google Native**：直接连接 Gemini 接口。

## 🛠️ 测试版说明
当前为测试版本 (Beta)，可能存在 API 连接不稳定性或 UI 显示瑕疵。欢迎在 Issues 中反馈问题。

## 📜 鸣谢

[@516985_](https://discord.com/channels/1134557553011998840/1463201289767878891)
驱动开发
---
*“杂鱼~ 既然装了我的插件，就乖乖当我的奴隶吧~ ❤”*
