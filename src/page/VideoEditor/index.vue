<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from "vue";
import { VideoEditor } from "./Video";

const videoUrl = ref<string>("");
const videoFile = ref<File | null>(null);
const originalVideoFile = ref<File | null>(null); // 保存原始文件
const videoEditor = ref<VideoEditor | null>(null);
const speed = ref<number>(1.0); // 倍速值，默认 1.0
const isProcessing = ref<boolean>(false);
const processingProgress = ref<number>(0);
const isFFmpegLoaded = ref<boolean>(false);

// 初始化 VideoEditor
onMounted(async () => {
	videoEditor.value = new VideoEditor();
	setTimeout(async () => {
		await videoEditor?.value?.load();
		isFFmpegLoaded.value = true;
	}, 1000);
});

// 清理资源
onBeforeUnmount(async () => {
	if (videoEditor.value) {
		await videoEditor.value.destroy();
	}
});

// 处理视频上传
const handleVideoUpload = (event: Event) => {
	const target = event.target as HTMLInputElement;
	const file = target.files?.[0];
	if (!file) return;

	// 检查是否为视频文件
	if (!file.type.startsWith("video/")) {
		alert("请上传视频文件");
		return;
	}

	videoFile.value = file;
	originalVideoFile.value = file; // 保存原始文件
	speed.value = 1.0; // 重置倍速
	processingProgress.value = 0;

	// 创建视频 URL 用于预览
	const reader = new FileReader();
	reader.onload = (e) => {
		const result = e.target?.result as string;
		videoUrl.value = result;
	};
	reader.readAsDataURL(file);
};

// 清除视频
const clearVideo = () => {
	videoUrl.value = "";
	videoFile.value = null;
	originalVideoFile.value = null;
	speed.value = 1.0;
	processingProgress.value = 0;
	// 重置文件输入
	const fileInput = document.getElementById("video-input") as HTMLInputElement;
	if (fileInput) {
		fileInput.value = "";
	}
};

// 应用倍速处理
const applySpeed = async () => {
	if (!videoEditor.value || !originalVideoFile.value) {
		alert("请先上传视频文件");
		return;
	}

	if (!isFFmpegLoaded.value) {
		alert("FFmpeg 正在加载中，请稍候...");
		return;
	}

	if (speed.value <= 0) {
		alert("倍速值必须大于 0");
		return;
	}

	if (speed.value === 1.0) {
		// 如果倍速为 1.0，恢复原始视频
		const reader = new FileReader();
		reader.onload = (e) => {
			const result = e.target?.result as string;
			videoUrl.value = result;
		};
		reader.readAsDataURL(originalVideoFile.value);
		return;
	}

	try {
		isProcessing.value = true;
		processingProgress.value = 0;

		// 使用带进度的倍速处理
		const outputBlob = await videoEditor.value.changeSpeedWithProgress(
			originalVideoFile.value,
			speed.value,
			(progress) => {
				processingProgress.value = progress;
			}
		);

		// 创建新的视频 URL
		const newVideoUrl = URL.createObjectURL(outputBlob);
		videoUrl.value = newVideoUrl;

		// 更新 videoFile 为处理后的文件
		const newFile = new File([outputBlob], `speed_${speed.value}x_${originalVideoFile.value.name}`, {
			type: "video/mp4",
		});
		videoFile.value = newFile;

		alert(`视频已成功调整为 ${speed.value}x 倍速！`);
	} catch (error) {
		console.error("视频处理失败:", error);
		alert(`视频处理失败: ${error instanceof Error ? error.message : String(error)}`);
	} finally {
		isProcessing.value = false;
		processingProgress.value = 0;
	}
};

// 下载处理后的视频
const downloadVideo = () => {
	if (!videoFile.value) {
		alert("没有可下载的视频");
		return;
	}

	const link = document.createElement("a");
	link.href = videoUrl.value;
	link.download = videoFile.value.name;
	link.click();
};


</script>

<template>
	<div class="video-editor-container">
		<div class="editor-header">
			<h1 class="editor-title">视频编辑器</h1>
		</div>

		<div class="upload-section">
			<input type="file" accept="video/*" @change="handleVideoUpload" id="video-input" class="file-input" />
			<label for="video-input" class="upload-button">
				{{ videoUrl ? "重新选择视频" : "选择视频上传" }}
			</label>
			<button v-if="videoUrl" @click="clearVideo" class="clear-button">
				清除视频
			</button>
		</div>

		<div v-if="videoUrl" class="video-preview-section">
			<!-- 倍速控制面板 -->
			<div class="speed-control-panel">
				<div class="speed-control-item">
					<label class="speed-label">
						<span>倍速：</span>
						<span class="speed-value">{{ speed.toFixed(2) }}x</span>
					</label>
					<div class="speed-controls">
						<input type="range" min="0.25" max="4" step="0.25" v-model.number="speed" class="speed-slider"
							:disabled="isProcessing || !isFFmpegLoaded" />
						<div class="speed-presets">
							<button v-for="preset in [0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 3.0, 4.0]" :key="preset"
								@click="speed = preset" class="speed-preset-btn" :class="{ active: speed === preset }"
								:disabled="isProcessing || !isFFmpegLoaded">
								{{ preset }}x
							</button>
						</div>
					</div>
				</div>
				<div class="speed-actions">
					<button @click="applySpeed" class="apply-button"
						:disabled="isProcessing || !isFFmpegLoaded || !originalVideoFile">
						{{ isProcessing ? "处理中..." : "应用倍速" }}
					</button>
					<button v-if="videoFile && speed !== 1.0" @click="downloadVideo" class="download-button"
						:disabled="isProcessing">
						下载视频
					</button>
				</div>
				<!-- 处理进度 -->
				<div v-if="isProcessing" class="progress-container">
					<div class="progress-bar">
						<div class="progress-fill" :style="{ width: `${processingProgress}%` }"></div>
					</div>
					<p class="progress-text">{{ processingProgress.toFixed(1) }}%</p>
				</div>
			</div>

			<div class="video-wrapper">
				<video :src="videoUrl" controls class="video-preview">
					您的浏览器不支持视频播放
				</video>
			</div>
			<div v-if="videoFile" class="video-info">
				<p class="info-item">
					<span class="info-label">文件名：</span>
					<span class="info-value">{{ videoFile.name }}</span>
				</p>
				<p class="info-item">
					<span class="info-label">文件大小：</span>
					<span class="info-value">{{ (videoFile.size / 1024 / 1024).toFixed(2) }} MB</span>
				</p>
				<p class="info-item">
					<span class="info-label">文件类型：</span>
					<span class="info-value">{{ videoFile.type }}</span>
				</p>
				<p v-if="speed !== 1.0" class="info-item">
					<span class="info-label">当前倍速：</span>
					<span class="info-value">{{ speed.toFixed(2) }}x</span>
				</p>
			</div>
		</div>

		<div v-else class="tips">
			<p>请上传一个视频文件开始编辑</p>
			<p>支持的格式：MP4, WebM, OGG 等</p>
		</div>
	</div>
</template>

<style scoped>
.video-editor-container {
	width: 100%;
	height: 100%;
	display: flex;
	flex-direction: column;
	align-items: center;
	padding: 20px;
	background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
	color: white;
	overflow-y: auto;
}

.editor-header {
	text-align: center;
	margin-bottom: 30px;
}

.editor-title {
	font-size: 2.5rem;
	font-weight: bold;
	margin-bottom: 1rem;
}

.upload-section {
	display: flex;
	gap: 16px;
	justify-content: center;
	align-items: center;
	margin-bottom: 30px;
}

.file-input {
	display: none;
}

.upload-button {
	display: inline-block;
	padding: 12px 24px;
	background: white;
	color: #667eea;
	border-radius: 8px;
	cursor: pointer;
	font-size: 16px;
	font-weight: 600;
	transition: all 0.3s ease;
	box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}

.upload-button:hover {
	background: #f0f0f0;
	transform: translateY(-2px);
	box-shadow: 0 6px 12px rgba(0, 0, 0, 0.15);
}

.clear-button {
	padding: 12px 24px;
	background: rgba(255, 107, 107, 0.9);
	color: white;
	border: none;
	border-radius: 8px;
	cursor: pointer;
	font-size: 16px;
	font-weight: 600;
	transition: all 0.3s ease;
	box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}

.clear-button:hover {
	background: rgba(255, 82, 82, 1);
	transform: translateY(-2px);
	box-shadow: 0 6px 12px rgba(255, 107, 107, 0.3);
}

.video-preview-section {
	width: 100%;
	max-width: 1200px;
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 20px;
}

.video-wrapper {
	width: 100%;
	max-width: 100%;
	background: rgba(0, 0, 0, 0.3);
	border-radius: 12px;
	padding: 20px;
	box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
}

.video-preview {
	width: 100%;
	max-width: 100%;
	max-height: 90vh;
	height: auto;
	border-radius: 8px;
	background: #000;
	object-fit: contain;
}

.video-info {
	width: 100%;
	background: rgba(255, 255, 255, 0.1);
	border-radius: 12px;
	padding: 20px;
	backdrop-filter: blur(10px);
}

.info-item {
	margin: 12px 0;
	font-size: 14px;
	display: flex;
	align-items: center;
}

.info-label {
	font-weight: 600;
	margin-right: 8px;
	opacity: 0.9;
}

.info-value {
	opacity: 0.8;
	word-break: break-all;
}

.tips {
	text-align: center;
	padding: 40px;
	background: rgba(255, 255, 255, 0.1);
	border-radius: 12px;
	backdrop-filter: blur(10px);
}

.tips p {
	margin: 10px 0;
	font-size: 1.1rem;
	opacity: 0.9;
}

.speed-control-panel {
	width: 100%;
	background: rgba(255, 255, 255, 0.1);
	border-radius: 12px;
	padding: 20px;
	backdrop-filter: blur(10px);
	margin-bottom: 20px;
}

.speed-control-item {
	margin-bottom: 20px;
}

.speed-label {
	display: flex;
	justify-content: space-between;
	align-items: center;
	margin-bottom: 12px;
	font-size: 16px;
	font-weight: 600;
}

.speed-value {
	color: #ffd700;
	font-size: 18px;
	font-weight: bold;
}

.speed-controls {
	display: flex;
	flex-direction: column;
	gap: 12px;
}

.speed-slider {
	width: 100%;
	height: 8px;
	border-radius: 4px;
	background: rgba(255, 255, 255, 0.2);
	outline: none;
	-webkit-appearance: none;
	appearance: none;
	cursor: pointer;
	transition: background 0.3s ease;
}

.speed-slider:hover:not(:disabled) {
	background: rgba(255, 255, 255, 0.3);
}

.speed-slider:disabled {
	opacity: 0.5;
	cursor: not-allowed;
}

.speed-slider::-webkit-slider-thumb {
	-webkit-appearance: none;
	appearance: none;
	width: 20px;
	height: 20px;
	border-radius: 50%;
	background: #667eea;
	cursor: pointer;
	box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
	transition: all 0.2s ease;
}

.speed-slider::-webkit-slider-thumb:hover:not(:disabled) {
	background: #5568d3;
	transform: scale(1.1);
}

.speed-slider::-moz-range-thumb {
	width: 20px;
	height: 20px;
	border-radius: 50%;
	background: #667eea;
	cursor: pointer;
	border: none;
	box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
	transition: all 0.2s ease;
}

.speed-slider::-moz-range-thumb:hover:not(:disabled) {
	background: #5568d3;
	transform: scale(1.1);
}

.speed-presets {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
	justify-content: center;
}

.speed-preset-btn {
	padding: 6px 12px;
	background: rgba(255, 255, 255, 0.2);
	color: white;
	border: 1px solid rgba(255, 255, 255, 0.3);
	border-radius: 6px;
	cursor: pointer;
	font-size: 14px;
	font-weight: 500;
	transition: all 0.3s ease;
}

.speed-preset-btn:hover:not(:disabled) {
	background: rgba(255, 255, 255, 0.3);
	transform: translateY(-1px);
}

.speed-preset-btn.active {
	background: #667eea;
	border-color: #667eea;
	font-weight: 600;
}

.speed-preset-btn:disabled {
	opacity: 0.5;
	cursor: not-allowed;
}

.speed-actions {
	display: flex;
	gap: 12px;
	justify-content: center;
	margin-top: 20px;
}

.apply-button,
.download-button {
	padding: 12px 24px;
	border: none;
	border-radius: 8px;
	cursor: pointer;
	font-size: 16px;
	font-weight: 600;
	transition: all 0.3s ease;
	box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}

.apply-button {
	background: #4caf50;
	color: white;
}

.apply-button:hover:not(:disabled) {
	background: #45a049;
	transform: translateY(-2px);
	box-shadow: 0 6px 12px rgba(76, 175, 80, 0.3);
}

.apply-button:disabled {
	background: rgba(255, 255, 255, 0.2);
	color: rgba(255, 255, 255, 0.5);
	cursor: not-allowed;
	opacity: 0.6;
}

.download-button {
	background: #2196f3;
	color: white;
}

.download-button:hover:not(:disabled) {
	background: #1976d2;
	transform: translateY(-2px);
	box-shadow: 0 6px 12px rgba(33, 150, 243, 0.3);
}

.download-button:disabled {
	opacity: 0.6;
	cursor: not-allowed;
}

.progress-container {
	margin-top: 20px;
}

.progress-bar {
	width: 100%;
	height: 8px;
	background: rgba(255, 255, 255, 0.2);
	border-radius: 4px;
	overflow: hidden;
	margin-bottom: 8px;
}

.progress-fill {
	height: 100%;
	background: linear-gradient(90deg, #667eea, #764ba2);
	border-radius: 4px;
	transition: width 0.3s ease;
}

.progress-text {
	text-align: center;
	font-size: 14px;
	font-weight: 600;
	opacity: 0.9;
}
</style>
