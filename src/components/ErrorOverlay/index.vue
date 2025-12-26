<script setup lang="ts">
interface Props {
  mode: 'ffmpeg' | 'webav';
  errorMessage: string;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  (e: 'retry'): void;
  (e: 'back'): void;
  (e: 'home'): void;
}>();

// 根据模式获取可能的原因列表
const hints = computed(() => {
  if (props.mode === 'ffmpeg') {
    return [
      '网络连接不稳定',
      'CDN 资源加载失败',
      '浏览器不支持 WebAssembly',
    ];
  } else {
    return [
      '浏览器不支持 WebCodecs API',
      '请使用 Chrome 94+ 或 Edge 94+ 浏览器',
    ];
  }
});

const title = computed(() => {
  return props.mode === 'ffmpeg' ? 'FFmpeg 加载失败' : 'WebAV 加载失败';
});

import { computed } from 'vue';
</script>

<template>
  <div class="error-overlay">
    <div class="error-content">
      <div class="error-icon">❌</div>
      <h2 class="error-title">{{ title }}</h2>
      <p class="error-message">{{ errorMessage }}</p>
      <div class="error-hints">
        <p>可能的原因：</p>
        <ul>
          <li v-for="hint in hints" :key="hint">{{ hint }}</li>
        </ul>
      </div>
      <div class="error-actions">
        <button @click="emit('retry')" class="retry-button">
          🔄 重新加载
        </button>
        <button @click="emit('back')" class="back-button">
          ↩️ 重新选择模式
        </button>
        <button @click="emit('home')" class="back-button">
          🏠 返回首页
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.error-overlay {
  position: fixed;
  top: 60px;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 999;
}

.error-content {
  text-align: center;
  padding: 40px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 20px;
  backdrop-filter: blur(10px);
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
  max-width: 600px;
  width: 90%;
}

.error-icon {
  font-size: 4rem;
  margin-bottom: 20px;
  animation: shake 0.5s ease-in-out;
}

@keyframes shake {
  0%,
  100% {
    transform: translateX(0);
  }

  25% {
    transform: translateX(-10px);
  }

  75% {
    transform: translateX(10px);
  }
}

.error-title {
  font-size: 2rem;
  font-weight: bold;
  margin-bottom: 20px;
  color: white;
}

.error-message {
  font-size: 1.1rem;
  margin-bottom: 20px;
  color: rgba(255, 255, 255, 0.9);
  padding: 15px;
  background: rgba(255, 107, 107, 0.2);
  border-radius: 8px;
  border: 1px solid rgba(255, 107, 107, 0.3);
}

.error-hints {
  text-align: left;
  margin: 20px 0;
  padding: 20px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 10px;
  color: white;
}

.error-hints p {
  font-weight: 600;
  margin-bottom: 10px;
  font-size: 1rem;
}

.error-hints ul {
  list-style: none;
  padding: 0;
  margin: 0;
}

.error-hints li {
  padding: 8px 0;
  padding-left: 25px;
  position: relative;
  opacity: 0.9;
  font-size: 0.95rem;
}

.error-hints li::before {
  content: "•";
  position: absolute;
  left: 10px;
  color: #ffd700;
  font-weight: bold;
}

.error-actions {
  display: flex;
  gap: 15px;
  justify-content: center;
  margin-top: 30px;
}

.retry-button,
.back-button {
  padding: 14px 28px;
  border: none;
  border-radius: 10px;
  cursor: pointer;
  font-size: 16px;
  font-weight: 600;
  transition: all 0.3s ease;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}

.retry-button {
  background: #4caf50;
  color: white;
  flex: 1;
}

.retry-button:hover {
  background: #45a049;
  transform: translateY(-2px);
  box-shadow: 0 6px 12px rgba(76, 175, 80, 0.3);
}

.back-button {
  background: rgba(255, 255, 255, 0.2);
  color: white;
  border: 1px solid rgba(255, 255, 255, 0.3);
  flex: 1;
}

.back-button:hover {
  background: rgba(255, 255, 255, 0.3);
  transform: translateY(-2px);
  box-shadow: 0 6px 12px rgba(255, 255, 255, 0.2);
}

@media (max-width: 600px) {
  .error-content {
    padding: 24px;
  }

  .error-icon {
    font-size: 3rem;
  }

  .error-title {
    font-size: 1.5rem;
  }

  .error-actions {
    flex-direction: column;
  }

  .retry-button,
  .back-button {
    width: 100%;
  }
}
</style>

