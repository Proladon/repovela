import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  // 保留文字節點的分隔，避免字距與原畫面不同。
  plugins: [vue({ template: { compilerOptions: { comments: true } } })],
  server: { port: 5173, strictPort: true },
  clearScreen: false,
  test: { include: ['src/**/*.test.ts'] },
});
