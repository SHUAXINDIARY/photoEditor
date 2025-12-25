<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from "vue";

// 组件参数
interface Props {
  videoUrl: string;
  videoElement: HTMLVideoElement | null;
}

const props = defineProps<Props>();

// 状态
const isPlaying = ref(false);
const currentTime = ref(0);
const duration = ref(0);
const isDragging = ref(false);
const scale = ref(10); // 缩放级别（像素/秒）

// 时间轴进度（百分比）
const progress = computed(() => {
  if (duration.value === 0) return 0;
  return (currentTime.value / duration.value) * 100;
});

// 时间轴总宽度
const timelineWidth = computed(() => {
  const minDuration = Math.max(duration.value, 20);
  return minDuration * scale.value;
});

// 播放头位置（像素）
const playheadPosition = computed(() => {
  return currentTime.value * scale.value;
});

// 生成时间刻度
const timeMarkers = computed(() => {
  const markers: { time: number; label: string; isMajor: boolean }[] = [];
  const maxDuration = Math.max(duration.value, 20);
  const step = scale.value >= 20 ? 1 : scale.value >= 10 ? 2 : 5;

  for (let t = 0; t <= Math.ceil(maxDuration); t += step) {
    markers.push({
      time: t,
      label: formatTime(t),
      isMajor: t % (step * 5) === 0 || t === 0,
    });
  }
  return markers;
});

// 格式化时间显示
const formatTime = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
};

// 格式化详细时间显示
const formatDetailTime = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 10);
  return `${mins}:${secs.toString().padStart(2, "0")}.${ms}`;
};

// 像素转时间
const pixelToTime = (pixel: number): number => {
  return Math.max(0, pixel / scale.value);
};

// 时间转像素
const timeToPixel = (time: number): number => {
  return time * scale.value;
};

// 监听视频元素变化
watch(
  () => props.videoElement,
  (newVideo, oldVideo) => {
    if (oldVideo) {
      removeVideoListeners(oldVideo);
    }
    if (newVideo) {
      setupVideoListeners(newVideo);
    }
  },
  { immediate: true }
);

// 设置视频监听器
const setupVideoListeners = (video: HTMLVideoElement) => {
  video.addEventListener("timeupdate", handleTimeUpdate);
  video.addEventListener("loadedmetadata", handleLoadedMetadata);
  video.addEventListener("play", handlePlay);
  video.addEventListener("pause", handlePause);
  video.addEventListener("ended", handleEnded);

  // 初始化状态
  if (video.duration) {
    duration.value = video.duration;
  }
  currentTime.value = video.currentTime;
};

// 移除视频监听器
const removeVideoListeners = (video: HTMLVideoElement) => {
  video.removeEventListener("timeupdate", handleTimeUpdate);
  video.removeEventListener("loadedmetadata", handleLoadedMetadata);
  video.removeEventListener("play", handlePlay);
  video.removeEventListener("pause", handlePause);
  video.removeEventListener("ended", handleEnded);
};

// 事件处理
const handleTimeUpdate = () => {
  if (!isDragging.value && props.videoElement) {
    currentTime.value = props.videoElement.currentTime;
  }
};

const handleLoadedMetadata = () => {
  if (props.videoElement) {
    duration.value = props.videoElement.duration;
  }
};

const handlePlay = () => {
  isPlaying.value = true;
};

const handlePause = () => {
  isPlaying.value = false;
};

const handleEnded = () => {
  isPlaying.value = false;
  currentTime.value = 0;
};

// 播放/暂停控制
const togglePlay = () => {
  if (!props.videoElement) return;

  if (isPlaying.value) {
    props.videoElement.pause();
  } else {
    props.videoElement.play();
  }
};

// 时间轴拖动
const timelineContentRef = ref<HTMLDivElement | null>(null);

const handleTimelineClick = (event: MouseEvent) => {
  if (!props.videoElement || !timelineContentRef.value) return;

  const rect = timelineContentRef.value.getBoundingClientRect();
  const scrollLeft = timelineContentRef.value.scrollLeft;
  const clickX = event.clientX - rect.left + scrollLeft;
  const newTime = Math.min(pixelToTime(clickX), duration.value);

  props.videoElement.currentTime = newTime;
  currentTime.value = newTime;
};

const handleTimelineDragStart = (event: MouseEvent) => {
  isDragging.value = true;
  handleTimelineDrag(event);
};

const handleTimelineDrag = (event: MouseEvent) => {
  if (!isDragging.value || !props.videoElement || !timelineContentRef.value) return;

  const rect = timelineContentRef.value.getBoundingClientRect();
  const scrollLeft = timelineContentRef.value.scrollLeft;
  const dragX = event.clientX - rect.left + scrollLeft;
  const newTime = Math.max(0, Math.min(pixelToTime(dragX), duration.value));

  currentTime.value = newTime;
  props.videoElement.currentTime = newTime;
};

const handleTimelineDragEnd = () => {
  isDragging.value = false;
};

// 缩放控制
const zoomIn = () => {
  scale.value = Math.min(50, scale.value + 2);
};

const zoomOut = () => {
  scale.value = Math.max(2, scale.value - 2);
};

// 清理
onMounted(() => {
  document.addEventListener("mousemove", handleTimelineDrag);
  document.addEventListener("mouseup", handleTimelineDragEnd);
});

onBeforeUnmount(() => {
  document.removeEventListener("mousemove", handleTimelineDrag);
  document.removeEventListener("mouseup", handleTimelineDragEnd);

  if (props.videoElement) {
    removeVideoListeners(props.videoElement);
  }
});
</script>

<template>
  <div class="timeline-container">
    <!-- 工具栏 -->
    <div class="timeline-toolbar">
      <div class="toolbar-left">
        <!-- 播放控制 -->
        <button class="play-btn" @click="togglePlay" :disabled="!videoElement">
          <span v-if="isPlaying">⏸️</span>
          <span v-else>▶️</span>
        </button>
        <div class="time-display">
          {{ formatDetailTime(currentTime) }} / {{ formatDetailTime(duration) }}
        </div>
      </div>

      <div class="toolbar-right">
        <!-- 缩放控制 -->
        <button class="toolbar-btn zoom-btn" @click="zoomOut" title="缩小">
          <span>➖</span>
        </button>
        <span class="zoom-label">{{ scale }}x</span>
        <button class="toolbar-btn zoom-btn" @click="zoomIn" title="放大">
          <span>➕</span>
        </button>
      </div>
    </div>

    <!-- 时间轴主体 -->
    <div class="timeline-body">
      <!-- 轨道标签 -->
      <div class="track-labels">
        <div class="time-ruler-label"></div>
        <div class="track-label">
          <span class="track-icon">🎬</span>
          视频
        </div>
      </div>

      <!-- 时间轴内容 -->
      <div
        ref="timelineContentRef"
        class="timeline-content"
        @click="handleTimelineClick"
        @mousedown="handleTimelineDragStart"
      >
        <!-- 时间刻度尺 -->
        <div class="time-ruler" :style="{ width: `${timelineWidth}px` }">
          <div
            v-for="marker in timeMarkers"
            :key="marker.time"
            class="time-marker"
            :class="{ major: marker.isMajor }"
            :style="{ left: `${timeToPixel(marker.time)}px` }"
          >
            <span v-if="marker.isMajor" class="marker-label">{{ marker.label }}</span>
          </div>
        </div>

        <!-- 轨道区域 -->
        <div ref="timelineRef" class="tracks-area" :style="{ width: `${timelineWidth}px` }">
          <!-- 视频轨道 -->
          <div class="track">
            <!-- 视频片段 -->
            <div
              v-if="duration > 0"
              class="action video-action"
              :style="{
                left: '0px',
                width: `${timeToPixel(duration)}px`,
              }"
            >
              <div class="action-content">
                <span class="action-icon">🎬</span>
                <span class="action-name">视频</span>
              </div>
              <!-- 进度条 -->
              <div class="action-progress" :style="{ width: `${progress}%` }"></div>
            </div>
          </div>

          <!-- 播放头 -->
          <div class="playhead" :style="{ left: `${playheadPosition}px` }">
            <div class="playhead-head"></div>
            <div class="playhead-line"></div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.timeline-container {
  width: 100%;
  background: #1a1a2e;
  border-radius: 8px;
  overflow: hidden;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}

/* ==================== 工具栏 ==================== */
.timeline-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: #16213e;
  border-bottom: 1px solid #0f3460;
}

.toolbar-left,
.toolbar-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.toolbar-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 6px 10px;
  background: #0f3460;
  border: none;
  border-radius: 6px;
  color: #e0e0e0;
  cursor: pointer;
  font-size: 13px;
  transition: all 0.2s;
}

.toolbar-btn:hover:not(:disabled) {
  background: #1a4a7a;
}

.toolbar-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.play-btn {
  width: 44px;
  height: 44px;
  border: none;
  background: #e94560;
  color: white;
  border-radius: 50%;
  cursor: pointer;
  font-size: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  box-shadow: 0 2px 8px rgba(233, 69, 96, 0.3);
}

.play-btn:hover:not(:disabled) {
  background: #ff6b6b;
  transform: scale(1.05);
}

.play-btn:disabled {
  background: #555;
  opacity: 0.5;
  cursor: not-allowed;
  box-shadow: none;
}

.time-display {
  color: #e0e0e0;
  font-size: 14px;
  font-weight: 500;
  font-family: "SF Mono", "Monaco", "Consolas", monospace;
  min-width: 140px;
}

.zoom-btn {
  width: 28px;
  height: 28px;
  padding: 0;
}

.zoom-label {
  color: #888;
  font-size: 12px;
  min-width: 32px;
  text-align: center;
}

/* ==================== 时间轴主体 ==================== */
.timeline-body {
  display: flex;
  height: 120px;
}

/* 轨道标签 */
.track-labels {
  width: 80px;
  flex-shrink: 0;
  background: #16213e;
  border-right: 1px solid #0f3460;
}

.time-ruler-label {
  height: 32px;
  border-bottom: 1px solid #0f3460;
}

.track-label {
  height: 80px;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 12px;
  color: #888;
  font-size: 12px;
  font-weight: 500;
  border-bottom: 1px solid #0f3460;
  border-left: 3px solid #4caf50;
}

.track-icon {
  font-size: 14px;
}

/* 时间轴内容 */
.timeline-content {
  flex: 1;
  overflow-x: auto;
  overflow-y: hidden;
  position: relative;
  cursor: pointer;
}

/* 时间刻度尺 */
.time-ruler {
  height: 32px;
  background: #1a1a2e;
  border-bottom: 1px solid #0f3460;
  position: relative;
  min-width: 100%;
}

.time-marker {
  position: absolute;
  top: 0;
  height: 100%;
  border-left: 1px solid #333;
}

.time-marker.major {
  border-left-color: #555;
}

.time-marker.major::after {
  content: "";
  position: absolute;
  bottom: 0;
  left: -1px;
  width: 1px;
  height: 8px;
  background: #666;
}

.marker-label {
  position: absolute;
  top: 4px;
  left: 4px;
  color: #888;
  font-size: 10px;
  white-space: nowrap;
  user-select: none;
}

/* 轨道区域 */
.tracks-area {
  position: relative;
  min-height: 80px;
  min-width: 100%;
}

.track {
  height: 80px;
  border-bottom: 1px solid #0f3460;
  position: relative;
  background: rgba(255, 255, 255, 0.02);
}

.track:hover {
  background: rgba(255, 255, 255, 0.04);
}

/* 动作（视频片段） */
.action {
  position: absolute;
  top: 8px;
  height: 64px;
  border-radius: 6px;
  cursor: pointer;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  transition: box-shadow 0.2s, transform 0.1s;
}

.action:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
}

.video-action {
  background: linear-gradient(135deg, #4caf50 0%, #2e7d32 100%);
}

.action-content {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 8px;
  height: 100%;
  padding: 0 12px;
  color: white;
  font-size: 13px;
  font-weight: 500;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
}

.action-icon {
  font-size: 16px;
}

.action-name {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.action-progress {
  position: absolute;
  top: 0;
  left: 0;
  height: 100%;
  background: rgba(255, 255, 255, 0.15);
  pointer-events: none;
  transition: width 0.1s ease;
}

/* 播放头 */
.playhead {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  z-index: 100;
  pointer-events: none;
  transform: translateX(-50%);
}

.playhead-head {
  width: 14px;
  height: 14px;
  background: #e94560;
  border-radius: 2px;
  transform: translateX(-6px) rotate(45deg);
  margin-top: -7px;
  box-shadow: 0 2px 4px rgba(233, 69, 96, 0.4);
}

.playhead-line {
  width: 2px;
  height: calc(100% + 7px);
  background: #e94560;
  box-shadow: 0 0 8px rgba(233, 69, 96, 0.5);
}

/* 滚动条样式 */
.timeline-content::-webkit-scrollbar {
  height: 8px;
}

.timeline-content::-webkit-scrollbar-track {
  background: #1a1a2e;
}

.timeline-content::-webkit-scrollbar-thumb {
  background: #0f3460;
  border-radius: 4px;
}

.timeline-content::-webkit-scrollbar-thumb:hover {
  background: #1a4a7a;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .timeline-toolbar {
    padding: 10px 12px;
  }

  .play-btn {
    width: 38px;
    height: 38px;
    font-size: 16px;
  }

  .time-display {
    font-size: 12px;
    min-width: 120px;
  }

  .track-labels {
    width: 60px;
  }

  .track-label {
    padding: 0 8px;
    font-size: 11px;
  }

  .track-icon {
    display: none;
  }
}
</style>
