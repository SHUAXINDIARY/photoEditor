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

// 时间轴进度（百分比）
const progress = computed(() => {
	if (duration.value === 0) return 0;
	return (currentTime.value / duration.value) * 100;
});

// 生成时间刻度（每秒一个刻度）
const timeTicks = computed(() => {
	const ticks: number[] = [];
	const maxDuration = Math.max(duration.value, 20); // 至少显示 20 秒
	for (let i = 0; i <= Math.ceil(maxDuration); i++) {
		ticks.push(i);
	}
	return ticks;
});

// 格式化时间显示
const formatTime = (seconds: number): string => {
	const mins = Math.floor(seconds / 60);
	const secs = Math.floor(seconds % 60);
	return `${mins}:${secs.toString().padStart(2, "0")}`;
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
const timelineRef = ref<HTMLDivElement | null>(null);

const handleTimelineClick = (event: MouseEvent) => {
	if (!props.videoElement || !timelineRef.value) return;

	const rect = timelineRef.value.getBoundingClientRect();
	const clickX = event.clientX - rect.left;
	const percentage = Math.max(0, Math.min(1, clickX / rect.width));
	const newTime = percentage * duration.value;

	props.videoElement.currentTime = newTime;
	currentTime.value = newTime;
};

const handleTimelineDragStart = (event: MouseEvent) => {
	isDragging.value = true;
	handleTimelineDrag(event);
};

const handleTimelineDrag = (event: MouseEvent) => {
	if (!isDragging.value || !props.videoElement || !timelineRef.value) return;

	const rect = timelineRef.value.getBoundingClientRect();
	const dragX = event.clientX - rect.left;
	const percentage = Math.max(0, Math.min(1, dragX / rect.width));
	const newTime = percentage * duration.value;

	currentTime.value = newTime;
	props.videoElement.currentTime = newTime;
};

const handleTimelineDragEnd = () => {
	isDragging.value = false;
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
		<!-- 顶部：播放按钮和时间显示 -->
		<div class="timeline-header">
			<button @click="togglePlay" class="play-button" :disabled="!videoElement">
				<span v-if="isPlaying">⏸</span>
				<span v-else>▶</span>
			</button>
			<div class="time-display">
				{{ formatTime(currentTime) }} / {{ formatTime(duration) }}
			</div>
		</div>

		<!-- 时间轴区域 -->
		<div class="timeline-area">
			<!-- 时间刻度标签 -->
			<div class="timeline-labels">
				<div
					v-for="tick in timeTicks"
					:key="tick"
					class="timeline-label"
					:style="{ left: `${(tick / Math.max(duration, 20)) * 100}%` }"
				>
					{{ formatTime(tick) }}
				</div>
			</div>

			<!-- 时间轴轨道 -->
			<div class="timeline-track-wrapper">
				<div
					ref="timelineRef"
					class="timeline-track"
					@click="handleTimelineClick"
					@mousedown="handleTimelineDragStart"
				>
					<!-- 刻度线 -->
					<div
						v-for="tick in timeTicks"
						:key="tick"
						class="timeline-tick"
						:style="{ left: `${(tick / Math.max(duration, 20)) * 100}%` }"
					></div>

					<!-- 进度条 -->
					<div class="timeline-progress" :style="{ width: `${progress}%` }"></div>

					<!-- 播放头（垂直蓝线） -->
					<div
						class="playhead"
						:style="{ left: `${progress}%` }"
					></div>
				</div>
			</div>
		</div>
	</div>
</template>

<style scoped>
.timeline-container {
	width: 100%;
	background: #1a1a1a;
	border-radius: 8px;
	padding: 16px 20px;
}

/* 顶部：播放按钮和时间显示 */
.timeline-header {
	display: flex;
	align-items: center;
	justify-content: center;
	gap: 16px;
	margin-bottom: 20px;
}

.play-button {
	width: 48px;
	height: 48px;
	border: none;
	background: #2196f3;
	color: white;
	border-radius: 50%;
	cursor: pointer;
	font-size: 20px;
	display: flex;
	align-items: center;
	justify-content: center;
	transition: all 0.2s ease;
	box-shadow: 0 2px 8px rgba(33, 150, 243, 0.3);
}

.play-button:hover:not(:disabled) {
	background: #1976d2;
	transform: scale(1.05);
	box-shadow: 0 4px 12px rgba(33, 150, 243, 0.4);
}

.play-button:disabled {
	opacity: 0.5;
	cursor: not-allowed;
	background: #555;
}

.time-display {
	color: white;
	font-size: 16px;
	font-weight: 500;
	font-family: 'Courier New', monospace;
}

/* 时间轴区域 */
.timeline-area {
	position: relative;
	width: 100%;
}

/* 时间刻度标签 */
.timeline-labels {
	position: relative;
	width: 100%;
	height: 24px;
	margin-bottom: 8px;
}

.timeline-label {
	position: absolute;
	transform: translateX(-50%);
	color: #999;
	font-size: 11px;
	font-weight: 500;
	white-space: nowrap;
	user-select: none;
}

/* 时间轴轨道 */
.timeline-track-wrapper {
	position: relative;
	width: 100%;
	height: 40px;
}

.timeline-track {
	position: relative;
	width: 100%;
	height: 8px;
	background: #333;
	border-radius: 4px;
	cursor: pointer;
	margin-top: 16px;
}

/* 刻度线 */
.timeline-tick {
	position: absolute;
	top: -16px;
	width: 1px;
	height: 8px;
	background: #555;
	transform: translateX(-50%);
}

/* 进度条 */
.timeline-progress {
	position: absolute;
	top: 0;
	left: 0;
	height: 100%;
	background: #2196f3;
	border-radius: 4px;
	transition: width 0.1s ease;
	pointer-events: none;
}

/* 播放头（垂直蓝线） */
.playhead {
	position: absolute;
	top: -16px;
	width: 2px;
	height: 40px;
	background: #2196f3;
	transform: translateX(-50%);
	pointer-events: none;
	box-shadow: 0 0 4px rgba(33, 150, 243, 0.6);
	z-index: 10;
}

.playhead::before {
	content: '';
	position: absolute;
	top: -4px;
	left: 50%;
	transform: translateX(-50%);
	width: 0;
	height: 0;
	border-left: 6px solid transparent;
	border-right: 6px solid transparent;
	border-top: 6px solid #2196f3;
}

/* 响应式设计 */
@media (max-width: 768px) {
	.timeline-container {
		padding: 12px 16px;
	}

	.play-button {
		width: 40px;
		height: 40px;
		font-size: 18px;
	}

	.time-display {
		font-size: 14px;
	}

	.timeline-label {
		font-size: 10px;
	}
}
</style>
