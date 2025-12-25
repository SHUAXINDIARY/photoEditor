<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from "vue";
import { MP4Clip } from "@webav/av-cliper";
// SVG 图标路径
const PlayIcon = new URL("../../assets/play.svg", import.meta.url).href;
const PauseIcon = new URL("../../assets/pause.svg", import.meta.url).href;
const ZoomInIcon = new URL("../../assets/zoom-in.svg", import.meta.url).href;
const ZoomOutIcon = new URL("../../assets/zoom-out.svg", import.meta.url).href;

// 组件参数
interface Props {
  videoUrl: string;
  videoElement: HTMLVideoElement | null;
  videoFile?: File | null; // 新增：视频文件对象
  speed?: number; // 播放倍速，默认 1.0
}

const props = withDefaults(defineProps<Props>(), {
  speed: 1.0,
});

// 缩略图类型
interface Thumbnail {
  ts: number; // 时间戳（微秒）
  img: string; // Blob URL
}

// 状态
const isPlaying = ref(false);
const videoCurrentTime = ref(0); // 视频实际播放时间（原始时间）
const originalDuration = ref(0); // 原始视频时长
const isDragging = ref(false);
const scale = ref(10); // 缩放级别（像素/秒）

// 缩略图状态
const thumbnails = ref<Thumbnail[]>([]);
const isLoadingThumbnails = ref(false);
const lastLoadedFileId = ref<string | null>(null); // 用于判断文件是否变化

// 根据倍速计算的有效播放时长（时间轴显示的总时长）
const duration = computed(() => {
  return originalDuration.value / props.speed;
});

// 时间轴上显示的当前时间（= 实际时间 / 倍速）
const displayCurrentTime = computed(() => {
  return videoCurrentTime.value / props.speed;
});

// 时间轴总宽度
const timelineWidth = computed(() => {
  const minDuration = Math.max(duration.value, 60);
  return minDuration * scale.value;
});

// 播放头位置（像素）- 基于时间轴显示时间
const playheadPosition = computed(() => {
  return displayCurrentTime.value * scale.value;
});

// 生成时间刻度（每10秒一个主刻度）
const timeMarkers = computed(() => {
  const markers: { time: number; label: string; isMajor: boolean }[] = [];
  const maxDuration = Math.max(duration.value, 60);
  const majorStep = 10; // 主刻度间隔10秒

  for (let t = 0; t <= Math.ceil(maxDuration); t += majorStep) {
    markers.push({
      time: t,
      label: formatTimeLabel(t),
      isMajor: true,
    });
  }
  return markers;
});

// 格式化时间标签（mm:ss格式）
const formatTimeLabel = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
};

// 格式化详细时间显示（hh:mm:ss格式）
const formatDetailTime = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  return `${hours.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
};

// 像素转时间
const pixelToTime = (pixel: number): number => {
  return Math.max(0, pixel / scale.value);
};

// 时间转像素
const timeToPixel = (time: number): number => {
  return time * scale.value;
};

// 从 File 对象加载缩略图
const loadThumbnailsFromFile = async (file: File) => {
  if (!file || isLoadingThumbnails.value) return;

  // 清理旧的缩略图 URL
  cleanupThumbnails();

  isLoadingThumbnails.value = true;

  try {
    console.log("[TimeLine] 开始从文件加载缩略图:", file.name);

    // 直接使用 File 的 stream() 方法获取 ReadableStream
    const videoStream = file.stream();

    // 创建 MP4Clip 并获取缩略图
    const clip = new MP4Clip(videoStream);
    await clip.ready;

    console.log("[TimeLine] MP4Clip ready, 开始获取缩略图...");

    const imgList = await clip.thumbnails(100, {
      step: 100
    });
    console.log("[TimeLine] 获取到缩略图数量:", imgList.length);

    // 转换为 Blob URL
    thumbnails.value = imgList.map((item) => ({
      ts: item.ts,
      img: URL.createObjectURL(item.img),
    }));

    // 销毁 clip
    clip.destroy();

    console.log("[TimeLine] 缩略图加载完成");
  } catch (error) {
    console.error("[TimeLine] 加载缩略图失败:", error);
    thumbnails.value = [];
  } finally {
    isLoadingThumbnails.value = false;
  }
};

// 清理缩略图 URL
const cleanupThumbnails = () => {
  thumbnails.value.forEach((thumb) => {
    URL.revokeObjectURL(thumb.img);
  });
  thumbnails.value = [];
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

// 监听视频文件变化，加载缩略图
watch(
  () => props.videoFile,
  async (newFile) => {
    console.log("[TimeLine] videoFile 变化:", newFile ? newFile.name : "null");
    if (newFile) {
      // 生成文件唯一标识（文件名 + 大小 + 最后修改时间）
      const fileId = `${newFile.name}-${newFile.size}-${newFile.lastModified}`;
      console.log("[TimeLine] 文件ID:", fileId, "上次ID:", lastLoadedFileId.value);
      if (fileId !== lastLoadedFileId.value) {
        lastLoadedFileId.value = fileId;
        await loadThumbnailsFromFile(newFile);
      }
    } else {
      // 文件被清除，清理缩略图
      cleanupThumbnails();
      lastLoadedFileId.value = null;
    }
  },
  { immediate: true, deep: true }
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
    originalDuration.value = video.duration;
  }
  videoCurrentTime.value = video.currentTime;
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
    videoCurrentTime.value = props.videoElement.currentTime;
  }
};

const handleLoadedMetadata = () => {
  if (props.videoElement) {
    originalDuration.value = props.videoElement.duration;
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
  videoCurrentTime.value = 0;
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
  // 时间轴上的时间（显示时间）
  const displayTime = Math.min(pixelToTime(clickX), duration.value);
  // 转换为视频实际时间（显示时间 * 倍速 = 实际时间）
  const videoTime = displayTime * props.speed;

  props.videoElement.currentTime = videoTime;
  videoCurrentTime.value = videoTime;
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
  // 时间轴上的时间（显示时间）
  const displayTime = Math.max(0, Math.min(pixelToTime(dragX), duration.value));
  // 转换为视频实际时间（显示时间 * 倍速 = 实际时间）
  const videoTime = displayTime * props.speed;

  videoCurrentTime.value = videoTime;
  props.videoElement.currentTime = videoTime;
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

  // 清理缩略图 URL
  cleanupThumbnails();
});
</script>

<template>
  <div class="timeline-container">
    <!-- 顶部工具栏 -->
    <div class="timeline-toolbar">
      <div class="toolbar-left">
      </div>

      <div class="toolbar-center">
        <!-- 播放按钮 -->
        <button class="play-btn" @click="togglePlay" :disabled="!videoElement">
          <img v-if="isPlaying" :src="PauseIcon" alt="暂停" class="play-icon" />
          <img v-else :src="PlayIcon" alt="播放" class="play-icon" />
        </button>
        <!-- 时间显示 -->
        <div class="time-display">
          <span class="current-time">{{ formatDetailTime(displayCurrentTime) }}</span>
          <span class="time-separator">|</span>
          <span class="total-time">{{ formatDetailTime(duration) }}</span>
        </div>
      </div>

      <div class="toolbar-right">
        <!-- 缩放控制 -->
        <div class="zoom-controls">
          <button class="zoom-btn" @click="zoomOut" title="缩小">
            <img :src="ZoomOutIcon" alt="缩小" class="zoom-icon" />
          </button>
          <input type="range" class="zoom-slider" :value="scale"
            @input="scale = Number(($event.target as HTMLInputElement).value)" min="2" max="50" />
          <button class="zoom-btn" @click="zoomIn" title="放大">
            <img :src="ZoomInIcon" alt="放大" class="zoom-icon" />
          </button>
        </div>
      </div>
    </div>

    <!-- 时间轴主体 -->
    <div class="timeline-body">
      <!-- 时间轴内容 -->
      <div ref="timelineContentRef" class="timeline-content" @click="handleTimelineClick"
        @mousedown="handleTimelineDragStart">
        <!-- 时间刻度尺 -->
        <div class="time-ruler" :style="{ width: `${timelineWidth}px` }">
          <div v-for="marker in timeMarkers" :key="marker.time" class="time-marker"
            :style="{ left: `${timeToPixel(marker.time)}px` }">
            <span class="marker-label">{{ marker.label }}</span>
            <div class="marker-line"></div>
          </div>
        </div>

        <!-- 轨道区域 -->
        <div class="tracks-area" :style="{ width: `${timelineWidth}px` }">
          <!-- 视频轨道 -->
          <div class="track video-track">
            <div v-if="duration > 0" class="clip video-clip" :style="{
              left: '0px',
              width: `${timeToPixel(duration)}px`,
            }">
              <!-- 视频缩略图 -->
              <div class="clip-thumbnails">
                <!-- 加载中状态 -->
                <div v-if="isLoadingThumbnails" class="thumbnails-loading">
                  <span class="loading-spinner"></span>
                </div>
                <!-- 真实缩略图 -->
                <template v-else-if="thumbnails.length > 0">
                  <img v-for="thumb in thumbnails" :key="thumb.ts" :src="thumb.img" class="thumbnail-img"
                    :alt="`${(thumb.ts / 1e6).toFixed(1)}s`" />
                </template>
                <!-- 占位符（无缩略图时） -->
                <template v-else>
                  <div v-for="i in Math.max(1, Math.ceil(duration / 5))" :key="i" class="thumbnail-placeholder"></div>
                </template>
              </div>
            </div>
          </div>

          <!-- 文字轨道1 -->
          <div class="track text-track">
            <!-- 示例文字片段 -->
          </div>

          <!-- 文字轨道2 -->
          <div class="track text-track">
            <!-- 示例文字片段 -->
          </div>

          <!-- 音频轨道 -->
          <!-- <div class="track audio-track">
            <div
              v-if="duration > 0"
              class="clip audio-clip"
              :style="{
                left: '0px',
                width: `${timeToPixel(duration)}px`,
              }"
            >
              <div class="audio-icon">🎵</div>
              <div class="audio-waveform"></div>
            </div>
          </div> -->

          <!-- 播放头 -->
          <div class="playhead" :style="{ left: `${playheadPosition}px` }">
            <div class="playhead-head">
              <svg width="12" height="16" viewBox="0 0 12 16">
                <path d="M0 0h12v12l-6 4-6-4V0z" fill="#8B5CF6" />
              </svg>
            </div>
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
  background: #ffffff;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  overflow: hidden;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

/* ==================== 工具栏 ==================== */
.timeline-toolbar {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  padding: 12px 16px;
  background: #ffffff;
  border-bottom: 1px solid #e5e7eb;
}

.toolbar-left,
.toolbar-center,
.toolbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.toolbar-left {
  justify-content: flex-start;
}

.toolbar-center {
  justify-content: center;
}

.toolbar-right {
  justify-content: flex-end;
}

.tool-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  background: transparent;
  border: none;
  border-radius: 8px;
  color: #6b7280;
  cursor: pointer;
  transition: all 0.2s;
}

.tool-btn:hover {
  background: #f3f4f6;
  color: #374151;
}

.tool-btn.active {
  background: #ede9fe;
  color: #8b5cf6;
}

.play-btn {
  width: 40px;
  height: 40px;
  border: none;
  background: #f3f4f6;
  color: #374151;
  border-radius: 50%;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.play-btn:hover:not(:disabled) {
  background: #e5e7eb;
}

.play-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.time-display {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-family: "SF Mono", "Monaco", "Consolas", monospace;
  color: #374151;
}

.current-time {
  font-weight: 500;
}

.time-separator {
  color: #d1d5db;
}

.total-time {
  color: #9ca3af;
}

/* 缩放控制 */
.zoom-controls {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 8px;
}

.zoom-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  background: transparent;
  border: none;
  border-radius: 6px;
  color: #6b7280;
  cursor: pointer;
  transition: all 0.2s;
}

.zoom-btn:hover {
  background: #f3f4f6;
}

.zoom-icon {
  width: 16px;
  height: 16px;
  color: #374151;
}

.zoom-slider {
  width: 80px;
  height: 4px;
  -webkit-appearance: none;
  appearance: none;
  background: #e5e7eb;
  border-radius: 2px;
  cursor: pointer;
}

.zoom-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 12px;
  height: 12px;
  background: #8b5cf6;
  border-radius: 50%;
  cursor: pointer;
}

/* ==================== 时间轴主体 ==================== */
.timeline-body {
  position: relative;
  background: #fafafa;
  overflow: hidden;
}

.timeline-content {
  overflow-x: auto;
  overflow-y: hidden;
  position: relative;
  cursor: pointer;
  /* 防止缩放时抖动 */
  will-change: scroll-position;
  scroll-behavior: auto;
}

/* 时间刻度尺 */
.time-ruler {
  height: 28px;
  background: #ffffff;
  border-bottom: 1px solid #e5e7eb;
  position: relative;
  min-width: 100%;
  /* 防止缩放抖动 */
  contain: layout style;
}

.time-marker {
  position: absolute;
  top: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}

.marker-label {
  padding: 4px 0 0 4px;
  color: #9ca3af;
  font-size: 11px;
  font-weight: 500;
  white-space: nowrap;
  user-select: none;
}

.marker-line {
  position: absolute;
  bottom: 0;
  left: 0;
  width: 1px;
  height: 8px;
  background: #d1d5db;
}

/* 轨道区域 */
.tracks-area {
  position: relative;
  min-width: 100%;
  padding-bottom: 8px;
  /* 防止缩放抖动 */
  contain: layout style;
}

.track {
  height: 56px;
  position: relative;
  margin: 4px 0;
}

/* 视频轨道 */
.video-track {
  height: 64px;
}

/* 文字轨道 */
.text-track {
  height: 40px;
}

/* 音频轨道 */
.audio-track {
  height: 48px;
}

/* 片段基础样式 */
.clip {
  position: absolute;
  top: 0;
  height: 100%;
  border-radius: 8px;
  overflow: hidden;
  cursor: pointer;
  transition: box-shadow 0.2s;
}

.clip:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

/* 视频片段 */
.video-clip {
  background: linear-gradient(180deg, #fce7f3 0%, #fbcfe8 100%);
  border: 2px solid #f9a8d4;
}

.clip-thumbnails {
  display: flex;
  height: 100%;
  gap: 2px;
  padding: 3px;
  align-items: center;
  overflow: hidden;
}

/* 真实缩略图 */
.thumbnail-img {
  height: 100%;
  width: auto;
  min-width: 40px;
  max-width: 80px;
  object-fit: cover;
  border-radius: 4px;
  flex-shrink: 0;
}

/* 加载中状态 */
.thumbnails-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
}

.loading-spinner {
  width: 20px;
  height: 20px;
  border: 2px solid rgba(139, 92, 246, 0.3);
  border-top-color: #8b5cf6;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* 占位符（无缩略图时） */
.thumbnail-placeholder {
  flex: 1;
  min-width: 40px;
  max-width: 60px;
  height: calc(100% - 2px);
  background: linear-gradient(180deg, #a5b4fc 0%, #818cf8 50%, #6366f1 100%);
  border-radius: 4px;
  position: relative;
}

.thumbnail-placeholder::after {
  content: "";
  position: absolute;
  inset: 0;
  background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40' viewBox='0 0 40 40'%3E%3Cpath d='M20 5L25 15L35 17L28 24L30 35L20 30L10 35L12 24L5 17L15 15Z' fill='%23ffffff' opacity='0.3'/%3E%3C/svg%3E") center/contain no-repeat;
}

/* 文字片段 */
.text-clip {
  background: linear-gradient(135deg, #06b6d4 0%, #0891b2 100%);
  display: flex;
  align-items: center;
  padding: 0 12px;
  color: white;
  font-size: 13px;
  font-weight: 500;
}

.text-clip .text-icon {
  width: 20px;
  height: 20px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: 8px;
  font-size: 12px;
  font-weight: 700;
}

/* 音频片段 */
.audio-clip {
  background: linear-gradient(135deg, #ec4899 0%, #db2777 100%);
  display: flex;
  align-items: center;
  padding: 0 12px;
  gap: 8px;
}

.audio-icon {
  font-size: 14px;
}

.audio-waveform {
  flex: 1;
  height: 24px;
  background: repeating-linear-gradient(90deg,
      rgba(255, 255, 255, 0.3) 0px,
      rgba(255, 255, 255, 0.3) 2px,
      transparent 2px,
      transparent 4px);
  border-radius: 2px;
  position: relative;
}

.audio-waveform::before {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg,
      transparent 0%,
      rgba(255, 255, 255, 0.2) 10%,
      rgba(255, 255, 255, 0.4) 20%,
      rgba(255, 255, 255, 0.2) 30%,
      rgba(255, 255, 255, 0.5) 40%,
      rgba(255, 255, 255, 0.3) 50%,
      rgba(255, 255, 255, 0.4) 60%,
      rgba(255, 255, 255, 0.2) 70%,
      rgba(255, 255, 255, 0.5) 80%,
      rgba(255, 255, 255, 0.3) 90%,
      transparent 100%);
}

/* 播放头 */
.playhead {
  position: absolute;
  top: 0;
  bottom: 0;
  z-index: 100;
  pointer-events: none;
  transform: translateX(-50%);
}

.playhead-head {
  position: relative;
  left: -6px;
  top: -28px;
}

.playhead-line {
  width: 2px;
  height: calc(100% + 28px);
  background: #8b5cf6;
  margin-left: -1px;
  margin-top: -16px;
}

/* 滚动条样式 */
.timeline-content::-webkit-scrollbar {
  height: 8px;
}

.timeline-content::-webkit-scrollbar-track {
  background: #f3f4f6;
}

.timeline-content::-webkit-scrollbar-thumb {
  background: #d1d5db;
  border-radius: 4px;
}

.timeline-content::-webkit-scrollbar-thumb:hover {
  background: #9ca3af;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .timeline-toolbar {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    padding: 8px 12px;
    gap: 8px;
  }

  .toolbar-left {
    order: 1;
  }

  .toolbar-center {
    order: 0;
    width: 100%;
    justify-content: center;
  }

  .toolbar-right {
    order: 2;
  }

  .tool-btn {
    width: 32px;
    height: 32px;
  }

  .play-btn {
    width: 36px;
    height: 36px;
  }

  .time-display {
    font-size: 12px;
  }

  .zoom-controls {
    display: none;
  }
}
</style>
