import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
import tauriConfig from './src-tauri/tauri.conf.json';

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(tauriConfig.version) },
  // 保留文字節點的分隔，避免字距與原畫面不同。
  plugins: [vue({ template: { compilerOptions: { comments: true } } })],
  server: { port: 5173, strictPort: true },
  clearScreen: false,
  test: { include: ['src/**/*.test.ts'] },
});
