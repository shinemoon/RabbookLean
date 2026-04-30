# 项目状态跟踪

## 总体进度

- [x] Phase 1: 基础设施搭建（npm/Vite/TypeScript）
- [x] Phase 2: 依赖现代化
- [x] Phase 3: 构建修复（路径修正 + 缺失文件）
- [ ] Phase 4: GUI 风格现代化
- [ ] Phase 5: 质量保障

---

## Phase 1: 基础设施搭建 — ✅ 已完成

### 已完成事项
- [x] 创建 package.json（npm 项目定义与依赖）
- [x] 创建 tsconfig.json（TypeScript 编译配置）
- [x] 创建 vite.config.ts（Vite 构建配置，集成 CRX 插件）
- [x] 执行 npm install 安装依赖
- [x] 创建 src/ 目录并将所有源文件移至其中
- [x] 移动 font/ 和 images/ 资源到 src/
- [x] 修复 HTML 文件格式（main.html 属性中多余空格）
- [x] 配置构建脚本与开发工作流
- [x] 修复构建错误（manifest.json 路径、vite.config.ts 配置等）
- [x] 构建成功验证（`npm run build` 通过）

---

## Phase 2: 依赖现代化 — ✅ 已完成

### 已完成事项
- [x] 从 pre-main.js 提取 Ascensor.js 独立库文件（vendor/ascensor.js）
- [x] 安装 jQuery（npm install jquery）
- [x] 重写 src/main.js 使用 ES Module 导入
- [x] 构建验证通过

---

## Phase 3: 构建修复 — ✅ 已完成（2026-04-30）

### 解决的问题
1. **`Error: Could not load file: 'main.css'`**
   - 原因：background.js 注入路径为 `"main.css"`，但构建后文件在 `dist/src/main.css`
   - 修复：路径改为 `"src/main.css"`（含 `src/` 前缀）

2. **`Error: Could not load file: 'pre-main.js'`**
   - 原因：pre-main.js、html-handling.js、pageRewrite.js 未被 CRX 插件复制到 dist
   - 修复：在 vite.config.ts 中添加内联 `copyStaticFiles()` 插件，构建后复制这些文件到 dist/src/

3. **`details.html not available`**
   - 原因：details.html 同上述问题未被复制到 dist
   - 修复：同上插件处理 + index.js 中路径已更新为 `"src/details.html"`
   - 验证：`dist/src/details.html` 存在 ✓

4. **缺失文件全部补全**
   - 已确认 dist/src/ 下包含全部：details.html, details.js, details.css, pre-main.js, html-handling.js, pageRewrite.js, main.css, main.js, index.html, font/, images/

---

## Phase 4: GUI 风格现代化（规划中）

- [ ] 重新设计颜色方案（CSS 变量）
- [ ] 现代化控件样式（按钮、滑块、选择框）
- [ ] 响应式布局优化
- [ ] 字体与间距统一

---

## Phase 5: 质量保障（规划中）

- [ ] 代码审查与清理
- [ ] 浏览器加载测试
- [ ] 静态资源压缩优化