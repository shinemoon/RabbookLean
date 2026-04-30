# RabbookLean 现代化改造计划

## 概述
对 RabbookLean 浏览器扩展进行全面现代化改造，从构建流程到代码组织再到 UI 风格，使其符合现代前端工程最佳实践。

---

## 阶段性目标

### Phase 1: 基础设施搭建（npm / Vite / TypeScript）✅ 已完成
- [x] 创建 `package.json`，定义项目元数据和依赖
- [x] 创建 `tsconfig.json`，配置 TypeScript 编译选项
- [x] 创建 `vite.config.ts`，配置 Vite 构建（支持 SCSS、HTML 入口、多页面输出）
- [x] 执行 `npm install` 安装所有依赖
- [x] 创建 `src/` 目录并迁移所有源文件
- [x] 配置构建脚本（`npm run dev` / `npm run build`）
- [x] 修复 HTML / manifest 路径问题

### Phase 2: 依赖现代化 —— 正在执行
- [x] 从 `pre-main.js` 中提取第三方库到 `src/vendor/ascensor.js`
- [ ] 将所有 JS 文件改写为 ES Module 格式（import/export）
- [ ] 全局变量访问方式现代化（`window.browser` → 模块导入）
- [ ] 验证构建产出可用

### Phase 3: 代码模块化重构
- [ ] 将 `background.js` 拆分为功能模块
- [ ] 将 `html-handling.js`、`pageRewrite.js` 重构为可测试模块
- [ ] 抽取共享常量和工具函数到独立的 `utils/` 目录
- [ ] 消除全局状态耦合，改用事件通信或状态管理

### Phase 4: GUI 风格现代化
- [ ] 引入现代 CSS 框架（如 Tailwind CSS 或 Windi CSS）
- [ ] 重新设计 popup 和 options 页面布局
- [ ] 适配 Chrome 新 MV3 样式指南
- [ ] 增加暗色模式支持
- [ ] 改进字体和排版系统

### Phase 5: 质量保障
- [ ] 配置 ESLint + Prettier 代码规范
- [ ] 编写单元测试
- [ ] 配置 CI（GitHub Actions）
- [ ] 完善 README 与贡献指南

---

## 技术选型

| 层面 | 选型 | 说明 |
|------|------|------|
| 构建工具 | Vite 5 | 快速 HMR，原生 ESM 支持 |
| 语言 | TypeScript | 类型安全，更好的 IDE 支持 |
| 样式 | SCSS + Tailwind CSS（可选） | 渐进增强 |
| 打包 | Vite 多页面模式 | 支持多 HTML 入口 |
| 测试 | Vitest | 与 Vite 一致配置 |
| 规范 | ESLint + Prettier | 统一代码风格 |