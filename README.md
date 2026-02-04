# Lilith Assistant (莉莉丝助手) - SillyTavern UI Extension

这是一个专为 SillyTavern (酒馆) 设计的 UI 扩展插件，基于“简短回复版莉莉丝”助手脚本重构。

## 核心功能

- **五重人格切换**: 包含毒舌魅魔、温柔人妻、雌小鬼、网络神人状态、柔弱妹妹等多种人格。
- **动态状态机**: 自动追踪“好感度”与“理智度”。数值变动将影响莉莉丝的回复语气、表情立绘以及界面特效。
- **低理智度特效**: 当理智度过低时，界面会出现故障（Glitch）滤镜效果。
- **抽卡系统**: 消耗命运红线（Fate Points）抽取各种稀奇古怪的物品。
- **记忆归档**: 自动总结短期对话并存入核心记忆，减缓长久对话后的上下文压力。
- **独立 API 侧链**: 可独立于酒馆主对话配置 API，支持 OpenAI 格式、Google Gemini 等。
- **语音支持**: 内置简易的 TTS 调用。

## 安装方法

1.  下载本项目。
2.  将文件夹放入 SillyTavern 安装目录下的 `public/extensions/third-party/lilith-assistant`。
3.  重启 SillyTavern 或刷新浏览器。
4.  在扩展菜单（或页面上出现的莉莉丝头像）中进行配置。

## 开发参考

本项目参考了官方插件开发指南进行重构，使用了标准的 `getContext`、`extensionSettings` 等 API。

## 许可证

MIT
