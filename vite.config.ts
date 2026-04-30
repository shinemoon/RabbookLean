import { defineConfig } from 'vite';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.json' with { type: 'json' };
import * as path from 'path';
import * as fs from 'fs';

// 内联插件：将必要文件复制到构建输出
function copyStaticFiles() {
  const filesToCopy = [
    'src/pre-main.js',
    'src/html-handling.js',
    'src/pageRewrite.js',
    'src/details.html',
    'src/details.js',
    'src/details.css',
  ];

  return {
    name: 'copy-static-files',
    apply: 'build' as const,
    async closeBundle() {
      const outDir = 'dist';
      for (const file of filesToCopy) {
        const srcPath = path.resolve(file);
        const destPath = path.resolve(outDir, file);
        if (fs.existsSync(srcPath)) {
          fs.mkdirSync(path.dirname(destPath), { recursive: true });
          fs.copyFileSync(srcPath, destPath);
          console.log(`  ✓ Copied ${file} -> ${destPath}`);
        }
      }
    },
  };
}

export default defineConfig({
  plugins: [
    crx({ manifest }),
    copyStaticFiles(),
  ],
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  css: {
    preprocessorOptions: {
      scss: {},
    },
  },
});