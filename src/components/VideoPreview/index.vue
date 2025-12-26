<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch, nextTick } from "vue";
import { WebGLVideoRenderer } from "./WebGLRenderer";

interface Props {
	videoUrl: string;
	contrast?: number;
	saturation?: number;
	temperature?: number;
	shadows?: number;
	highlights?: number;
	speed?: number;
}

const props = withDefaults(defineProps<Props>(), {
	contrast: 1.0,
	saturation: 1.0,
	temperature: 0,
	shadows: 1.0,
	highlights: 1.0,
	speed: 1.0,
});

const emit = defineEmits<{
	(e: "videoElement", el: HTMLVideoElement): void;
	(e: "ready"): void;
}>();

// DOM 引用
const canvasRef = ref<HTMLCanvasElement | null>(null);
const videoRef = ref<HTMLVideoElement | null>(null);
const containerRef = ref<HTMLDivElement | null>(null);

// WebGL 渲染器
let renderer: WebGLVideoRenderer | null = null;

// 初始化 WebGL 渲染器
const initRenderer = async () => {
	if (!canvasRef.value || !videoRef.value) return;

	renderer = new WebGLVideoRenderer(canvasRef.value);
	const success = await renderer.init();

	if (success) {
		renderer.setVideoSource(videoRef.value);
		updateFilterParams();
		emit("ready");
	} else {
		console.error("[VideoPreview] WebGL 初始化失败");
	}
};

// 更新滤镜参数
const updateFilterParams = () => {
	if (!renderer) return;

	renderer.setFilterParams({
		contrast: props.contrast,
		saturation: props.saturation,
		temperature: props.temperature,
		shadows: props.shadows,
		highlights: props.highlights,
	});
};

// 监听滤镜参数变化
watch(
	() => [props.contrast, props.saturation, props.temperature, props.shadows, props.highlights],
	() => {
		updateFilterParams();
	}
);

// 监听倍速变化
watch(
	() => props.speed,
	(newSpeed) => {
		if (videoRef.value) {
			videoRef.value.playbackRate = newSpeed;
		}
	}
);

// 监听视频 URL 变化
watch(
	() => props.videoUrl,
	async (newUrl) => {
		if (newUrl && videoRef.value) {
			videoRef.value.src = newUrl;
			await nextTick();
			if (renderer) {
				renderer.updateCanvasSize();
				renderer.forceRender();
			}
		}
	}
);

// 视频加载完成
const onVideoLoaded = () => {
	if (videoRef.value) {
		emit("videoElement", videoRef.value);
		if (renderer) {
			renderer.updateCanvasSize();
			renderer.forceRender();
		}
	}
};

// 调整画布显示尺寸
const updateCanvasDisplaySize = () => {
	if (!containerRef.value || !canvasRef.value || !videoRef.value) return;

	const container = containerRef.value;
	const canvas = canvasRef.value;
	const video = videoRef.value;

	if (!video.videoWidth || !video.videoHeight) return;

	const containerWidth = container.clientWidth;
	const containerHeight = container.clientHeight;
	const videoAspect = video.videoWidth / video.videoHeight;
	const containerAspect = containerWidth / containerHeight;

	let displayWidth: number;
	let displayHeight: number;

	if (videoAspect > containerAspect) {
		displayWidth = containerWidth;
		displayHeight = containerWidth / videoAspect;
	} else {
		displayHeight = containerHeight;
		displayWidth = containerHeight * videoAspect;
	}

	canvas.style.width = `${displayWidth}px`;
	canvas.style.height = `${displayHeight}px`;
};

// 生命周期
onMounted(async () => {
	await nextTick();
	await initRenderer();

	// 监听窗口大小变化
	window.addEventListener("resize", updateCanvasDisplaySize);
});

onBeforeUnmount(() => {
	window.removeEventListener("resize", updateCanvasDisplaySize);
	if (renderer) {
		renderer.destroy();
		renderer = null;
	}
});

// 暴露视频元素给父组件
defineExpose({
	getVideoElement: () => videoRef.value,
});
</script>

<template>
	<div ref="containerRef" class="video-preview-container">
		<!-- 隐藏的视频元素，用于提供视频帧数据 -->
		<video ref="videoRef" :src="videoUrl" class="hidden-video" crossorigin="anonymous" preload="auto" playsinline
			@loadeddata="onVideoLoaded" @loadedmetadata="updateCanvasDisplaySize">
			您的浏览器不支持视频播放
		</video>

		<!-- WebGL 渲染画布 -->
		<canvas ref="canvasRef" class="preview-canvas"></canvas>
	</div>
</template>

<style scoped>
.video-preview-container {
	position: relative;
	width: 100%;
	height: 100%;
	display: flex;
	align-items: center;
	justify-content: center;
	background: #000;
	border-radius: 8px;
	overflow: hidden;
}

.hidden-video {
	position: absolute;
	width: 1px;
	height: 1px;
	opacity: 0;
	pointer-events: none;
}

.preview-canvas {
	max-width: 100%;
	max-height: 100%;
	border-radius: 8px;
	object-fit: contain;
}
</style>

