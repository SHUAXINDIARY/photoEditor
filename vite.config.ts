import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vue()],
  
  // 对应 rspack 的 output.publicPath
  base: '/',
  
  // 对应 rspack 的 resolve.extensions
  resolve: {
    extensions: ['.ts', '.vue', '.js', '.json'],
  },
  
  // 优化依赖预构建配置（类似 rspack 的 exclude）
  optimizeDeps: {
    exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'],
    esbuildOptions: {
      // 支持 WASM
      supported: {
        'top-level-await': true,
      },
    },
  },
  
  // 构建配置
  build: {
    target: ['es2020', 'edge88', 'firefox78', 'chrome87', 'safari14'],
    // 对应 rspack 的 optimization
    minify: 'esbuild',
    rollupOptions: {
      output: {
        manualChunks: {
          // 代码分割，类似 rspack 的 splitChunks
          vue: ['vue', 'vue-router'],
        },
      },
    },
  },
  
  // 开发服务器配置
  server: {
    port: 8080,
    
    // 对应 rspack 的 devServer.headers
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
    
    // 对应 rspack 的 devServer.proxy
    proxy: {
      '/ffmpeg-core.js': {
        target: 'https://cdn.jsdelivr.net/npm/@ffmpeg/core-mt@0.12.10/dist/esm',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/ffmpeg-core/, ''),
        secure: true,
        configure: (proxy) => {
          proxy.on('proxyRes', (proxyRes) => {
            proxyRes.headers['Cross-Origin-Embedder-Policy'] = 'require-corp';
          });
        },
      },
      '/ffmpeg-core.wasm': {
        target: 'https://cdn.jsdelivr.net/npm/@ffmpeg/core-mt@0.12.10/dist/esm',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/ffmpeg-core/, ''),
        secure: true,
        configure: (proxy) => {
          proxy.on('proxyRes', (proxyRes) => {
            proxyRes.headers['Cross-Origin-Embedder-Policy'] = 'require-corp';
          });
        },
      },
      '/ffmpeg-core.worker.js': {
        target: 'https://cdn.jsdelivr.net/npm/@ffmpeg/core-mt@0.12.10/dist/esm',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/ffmpeg-core/, ''),
        secure: true,
        configure: (proxy) => {
          proxy.on('proxyRes', (proxyRes) => {
            proxyRes.headers['Cross-Origin-Embedder-Policy'] = 'require-corp';
          });
        },
      },
    },
  },
  
  // 定义全局常量（对应 rspack 的 DefinePlugin）
  define: {
    __VUE_OPTIONS_API__: true,
    __VUE_PROD_DEVTOOLS__: false,
  },
  
  // Worker 配置
  worker: {
    format: 'es',
  },
});

