<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from "vue";

export type ToastType = "success" | "warning" | "error";

interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
  duration: number;
}

const toasts = ref<ToastItem[]>([]);
let toastIdCounter = 0;

const addToast = (message: string, type: ToastType = "success", duration: number = 3000) => {
  const id = ++toastIdCounter;
  const toast: ToastItem = {
    id,
    message,
    type,
    duration,
  };

  toasts.value.push(toast);

  // 自动移除
  if (duration > 0) {
    setTimeout(() => {
      removeToast(id);
    }, duration);
  }

  return id;
};

const removeToast = (id: number) => {
  const index = toasts.value.findIndex((t) => t.id === id);
  if (index > -1) {
    toasts.value.splice(index, 1);
  }
};

// 暴露方法给全局使用
const showToast = (message: string, type: ToastType = "success", duration?: number) => {
  return addToast(message, type, duration ?? 3000);
};

// 将方法挂载到 window 对象上，方便全局调用
onMounted(() => {
  (window as any).$toast = {
    success: (message: string, duration?: number) => showToast(message, "success", duration),
    warning: (message: string, duration?: number) => showToast(message, "warning", duration),
    error: (message: string, duration?: number) => showToast(message, "error", duration),
    show: showToast,
  };
});

onBeforeUnmount(() => {
  delete (window as any).$toast;
});

// 获取图标
const getIcon = (type: ToastType): string => {
  switch (type) {
    case "success":
      return "✓";
    case "warning":
      return "⚠";
    case "error":
      return "✕";
    default:
      return "ℹ";
  }
};
</script>

<template>
  <Teleport to="body">
    <div class="toast-container">
      <TransitionGroup name="toast" tag="div" class="toast-list">
        <div
          v-for="toast in toasts"
          :key="toast.id"
          :class="['toast-item', `toast-${toast.type}`]"
          @click="removeToast(toast.id)"
        >
          <div class="toast-icon">{{ getIcon(toast.type) }}</div>
          <div class="toast-message">{{ toast.message }}</div>
          <button class="toast-close" @click.stop="removeToast(toast.id)">×</button>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style scoped>
.toast-container {
  position: fixed;
  top: 80px;
  right: 20px;
  z-index: 10000;
  pointer-events: none;
}

.toast-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  align-items: flex-end;
}

.toast-item {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 300px;
  max-width: 500px;
  padding: 16px 20px;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  border-radius: 12px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
  pointer-events: auto;
  cursor: pointer;
  transition: all 0.3s ease;
  border-left: 4px solid;
}

.toast-item:hover {
  transform: translateX(-4px);
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.2);
}

.toast-success {
  border-left-color: #4caf50;
  color: #2e7d32;
}

.toast-warning {
  border-left-color: #ff9800;
  color: #f57c00;
}

.toast-error {
  border-left-color: #ff6b6b;
  color: #d32f2f;
}

.toast-icon {
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  font-weight: bold;
  border-radius: 50%;
  background: currentColor;
  color: white;
  opacity: 0.9;
}

.toast-success .toast-icon {
  background: #4caf50;
}

.toast-warning .toast-icon {
  background: #ff9800;
}

.toast-error .toast-icon {
  background: #ff6b6b;
}

.toast-message {
  flex: 1;
  font-size: 14px;
  font-weight: 500;
  line-height: 1.5;
  word-break: break-word;
}

.toast-close {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  color: currentColor;
  font-size: 20px;
  font-weight: bold;
  cursor: pointer;
  opacity: 0.6;
  transition: opacity 0.2s ease;
  padding: 0;
  line-height: 1;
}

.toast-close:hover {
  opacity: 1;
}

/* 动画 */
.toast-enter-active,
.toast-leave-active {
  transition: all 0.3s ease;
}

.toast-enter-from {
  opacity: 0;
  transform: translateX(100%);
}

.toast-leave-to {
  opacity: 0;
  transform: translateX(100%);
}

.toast-move {
  transition: transform 0.3s ease;
}

/* 响应式 */
@media (max-width: 768px) {
  .toast-container {
    right: 10px;
    left: 10px;
    top: 70px;
  }

  .toast-item {
    min-width: auto;
    max-width: 100%;
  }

  .toast-list {
    align-items: stretch;
  }
}
</style>
