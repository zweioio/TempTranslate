# 临时翻译 - 智能翻译助手

基于 AI 的智能翻译助手，支持 Chrome 侧边栏快速翻译与双向回译核对。

## 功能特性

- **双向回译核对**：自动将翻译结果译回源语言，确保语义准确。
- **AI 智能双引擎**：结合 Google 翻译与 AI 深度理解。
- **侧边栏集成**：深度适配 Chrome Side Panel，无需切换标签页。
- **一键智能粘贴**：自动识别剪贴板内容。
- **实时语音朗读**：支持多国语言朗读。

## 项目结构

- `/`：插件源代码（Manifest v3）。
- `/website`：插件官方展示及下载页面。
- `/icons`：插件图标资源。

## 安装教程

1. **下载插件**：访问 [展示页面](https://your-username.github.io/TempTranslate/) 点击下载，或直接下载本仓库中的 `website/TempTranslate.zip`。
2. **解压文件**：将下载的压缩包解压到本地。
3. **加载插件**：
   - 打开 Chrome 浏览器，进入 `chrome://extensions/`。
   - 开启右上角的“开发者模式”。
   - 点击“加载已解压的扩展程序”，选择解压后的文件夹。

## 部署说明

本项目推荐使用 **Vercel** 进行快速部署。

**部署步骤：**
1. 在 GitHub 上创建一个名为 `TempTranslate` 的新仓库并推送代码。
2. 登录 [Vercel 官网](https://vercel.com/)，点击 **Add New -> Project**。
3. 导入你的 GitHub 仓库。
4. **关键配置**：在 "Framework Preset" 保持为 `Other`，在 **"Root Directory"** 处点击 "Edit" 并选择 **`website`** 文件夹。
5. 点击 **Deploy**。

---
© 2026 临时翻译. 开源且安全。
