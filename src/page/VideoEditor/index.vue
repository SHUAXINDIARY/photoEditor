<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, nextTick } from "vue";
import { useRouter } from "vue-router";
import { VideoEditor, type VideoProcessingMode } from "../../package/Video/Video";
import TimeLine from "../../components/TimeLine.vue";

const router = useRouter();
const videoUrl = ref<string>("");
const videoFile = ref<File | null>(null);
const originalVideoFile = ref<File | null>(null); // 保存原始文件
const videoEditor = ref<VideoEditor | null>(null);
const videoElement = ref<HTMLVideoElement | null>(null); // 视频 DOM 元素
const speed = ref<number>(1.0); // 倍速值，默认 1.0
const contrast = ref<number>(1.0); // 对比度值，默认 1.0
const appliedSpeed = ref<number>(1.0); // 已应用的倍速值
const appliedContrast = ref<number>(1.0); // 已应用的对比度值
const isProcessing = ref<boolean>(false);
const processingProgress = ref<number>(0);
const isFFmpegLoaded = ref<boolean>(false);
const isFFmpegLoading = ref<boolean>(false);
const ffmpegLoadProgress = ref<number>(0);
const ffmpegLoadError = ref<string>("");
const processingMode = ref<VideoProcessingMode | null>(null); // 处理模式，初始为 null，用户选择后才设置

// 初始化 VideoEditor
const initFFmpeg = async (mode: VideoProcessingMode) => {
	videoEditor.value = new VideoEditor(mode);
	isFFmpegLoading.value = true;
	isFFmpegLoaded.value = false;
	ffmpegLoadError.value = "";
	ffmpegLoadProgress.value = 0;

	try {
		await videoEditor.value.init((progress) => {
			ffmpegLoadProgress.value = progress;
		});

		// 更新状态（init 成功后会自动更新）
		isFFmpegLoading.value = videoEditor.value.getIsLoading();
		isFFmpegLoaded.value = videoEditor.value.getIsLoaded();
		ffmpegLoadError.value = videoEditor.value.getLoadError();

		// 短暂延迟后隐藏加载界面
		setTimeout(() => {
			isFFmpegLoaded.value = videoEditor.value?.getIsLoaded() ?? false;
			isFFmpegLoading.value = videoEditor.value?.getIsLoading() ?? false;
		}, 500);
	} catch (error) {
		console.error("VideoEditor 初始化失败:", error);
		// 更新状态（init 失败后会自动更新）
		isFFmpegLoading.value = videoEditor.value?.getIsLoading() ?? false;
		isFFmpegLoaded.value = videoEditor.value?.getIsLoaded() ?? false;
		ffmpegLoadError.value = videoEditor.value?.getLoadError() || (error instanceof Error ? error.message : "未知错误");
	}
};

// 选择处理模式（首次选择或切换模式）
const selectMode = async (mode: VideoProcessingMode) => {
	// 如果正在处理，不允许切换
	if (isProcessing.value) {
		alert("正在处理视频，请等待处理完成后再切换模式");
		return;
	}

	// 如果已加载且模式相同，直接返回
	if (videoEditor.value && isFFmpegLoaded.value && processingMode.value === mode) {
		return;
	}

	// 如果已加载，先销毁旧实例
	if (videoEditor.value && isFFmpegLoaded.value) {
		await videoEditor.value.destroy();
	}

	// 设置模式
	processingMode.value = mode;

	// 清除视频（切换模式需要重新初始化）
	clearVideo();

	// 初始化
	await initFFmpeg(mode);
};


// 返回首页
const goToHome = () => {
	router.push("/");
};

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
	contrast.value = 1.0; // 重置对比度
	appliedSpeed.value = 1.0; // 重置已应用的倍速
	appliedContrast.value = 1.0; // 重置已应用的对比度
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
	contrast.value = 1.0;
	appliedSpeed.value = 1.0;
	appliedContrast.value = 1.0;
	processingProgress.value = 0;
	// 重置文件输入
	const fileInput = document.getElementById("video-input") as HTMLInputElement;
	if (fileInput) {
		fileInput.value = "";
	}
};

// 应用倍速处理（会同时应用对比度，保留已应用的对比度）
const applySpeed = async () => {
	if (!videoEditor.value || !originalVideoFile.value) {
		alert("请先上传视频文件");
		return;
	}

	if (!isFFmpegLoaded.value) {
		alert(`${processingMode.value === 'ffmpeg' ? 'FFmpeg' : 'WebAV'} 正在加载中，请稍候...`);
		return;
	}

	if (speed.value <= 0) {
		alert("倍速值必须大于 0");
		return;
	}

	// 确定要应用的倍速和对比度值
	// 倍速使用当前滑块值，对比度保留已应用的值
	const speedToApply = speed.value;
	const contrastToApply = appliedContrast.value;

	// 如果倍速和对比度都是默认值，恢复原始视频
	if (speedToApply === 1.0 && contrastToApply === 1.0) {
		const reader = new FileReader();
		reader.onload = (e) => {
			const result = e.target?.result as string;
			videoUrl.value = result;
		};
		reader.readAsDataURL(originalVideoFile.value);
		videoFile.value = originalVideoFile.value;
		appliedSpeed.value = 1.0;
		appliedContrast.value = 1.0;
		return;
	}

	try {
		isProcessing.value = true;
		processingProgress.value = 0;

		// 使用 applyFilters 同时应用倍速和对比度
		const outputBlob = await videoEditor.value.applyFilters(
			originalVideoFile.value,
			{
				speed: speedToApply,
				contrast: contrastToApply,
			},
			(progress) => {
				processingProgress.value = progress;
			}
		);

		// 创建新的视频 URL
		const newVideoUrl = URL.createObjectURL(outputBlob);
		
		// 释放旧的 Object URL（如果存在且是 blob URL）
		if (videoUrl.value && videoUrl.value.startsWith("blob:")) {
			URL.revokeObjectURL(videoUrl.value);
		}
		
		videoUrl.value = newVideoUrl;

		// 等待 DOM 更新后再强制视频元素重新加载
		await nextTick();
		if (videoElement.value) {
			// 重新设置 src 并加载
			videoElement.value.src = newVideoUrl;
			videoElement.value.load();
		}

		// 更新 videoFile 为处理后的文件
		const fileName = originalVideoFile.value.name.replace(/\.[^/.]+$/, "");
		const newFile = new File(
			[outputBlob],
			`${fileName}_speed${speedToApply}_contrast${contrastToApply.toFixed(2)}.mp4`,
			{ type: "video/mp4" }
		);
		videoFile.value = newFile;

		// 更新已应用的值
		appliedSpeed.value = speedToApply;
		appliedContrast.value = contrastToApply;

		const effects = [];
		if (speedToApply !== 1.0) effects.push(`${speedToApply}x 倍速`);
		if (contrastToApply !== 1.0) effects.push(`对比度 ${contrastToApply.toFixed(2)}`);
		alert(`视频已成功应用：${effects.join(" + ")}！`);
	} catch (error) {
		console.error("视频处理失败:", error);
		alert(`视频处理失败: ${error instanceof Error ? error.message : String(error)}`);
	} finally {
		isProcessing.value = false;
		processingProgress.value = 0;
	}
};

// 应用对比度处理（会同时应用倍速，保留已应用的倍速）
const applyContrast = async () => {
	if (!videoEditor.value || !originalVideoFile.value) {
		alert("请先上传视频文件");
		return;
	}

	if (!isFFmpegLoaded.value) {
		alert(`${processingMode.value === 'ffmpeg' ? 'FFmpeg' : 'WebAV'} 正在加载中，请稍候...`);
		return;
	}

	if (contrast.value <= 0) {
		alert("对比度值必须大于 0");
		return;
	}

	// 确定要应用的倍速和对比度值
	// 对比度使用当前滑块值，倍速保留已应用的值
	const speedToApply = appliedSpeed.value;
	const contrastToApply = contrast.value;

	// 如果倍速和对比度都是默认值，恢复原始视频
	if (speedToApply === 1.0 && contrastToApply === 1.0) {
		const reader = new FileReader();
		reader.onload = (e) => {
			const result = e.target?.result as string;
			videoUrl.value = result;
		};
		reader.readAsDataURL(originalVideoFile.value);
		videoFile.value = originalVideoFile.value;
		appliedSpeed.value = 1.0;
		appliedContrast.value = 1.0;
		return;
	}

	try {
		isProcessing.value = true;
		processingProgress.value = 0;

		// 使用 applyFilters 同时应用倍速和对比度
		const outputBlob = await videoEditor.value.applyFilters(
			originalVideoFile.value,
			{
				speed: speedToApply,
				contrast: contrastToApply,
			},
			(progress) => {
				processingProgress.value = progress;
			}
		);

		// 创建新的视频 URL
		const newVideoUrl = URL.createObjectURL(outputBlob);
		
		// 释放旧的 Object URL（如果存在且是 blob URL）
		if (videoUrl.value && videoUrl.value.startsWith("blob:")) {
			URL.revokeObjectURL(videoUrl.value);
		}
		
		videoUrl.value = newVideoUrl;

		// 等待 DOM 更新后再强制视频元素重新加载
		await nextTick();
		if (videoElement.value) {
			// 重新设置 src 并加载
			videoElement.value.src = newVideoUrl;
			videoElement.value.load();
		}

		// 更新 videoFile 为处理后的文件
		const fileName = originalVideoFile.value.name.replace(/\.[^/.]+$/, "");
		const newFile = new File(
			[outputBlob],
			`${fileName}_speed${speedToApply}_contrast${contrastToApply.toFixed(2)}.mp4`,
			{ type: "video/mp4" }
		);
		videoFile.value = newFile;

		// 更新已应用的值
		appliedSpeed.value = speedToApply;
		appliedContrast.value = contrastToApply;

		const effects = [];
		if (speedToApply !== 1.0) effects.push(`${speedToApply}x 倍速`);
		if (contrastToApply !== 1.0) effects.push(`对比度 ${contrastToApply.toFixed(2)}`);
		alert(`视频已成功应用：${effects.join(" + ")}！`);
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
		<!-- 模式选择界面（未选择模式时显示） -->
		<div v-if="!processingMode && !isFFmpegLoading" class="mode-selection-overlay">
			<div class="mode-selection-content">
				<h1 class="mode-selection-title">选择处理模式</h1>
				<p class="mode-selection-hint">请选择一种视频处理模式开始使用</p>
				<div class="mode-selection-buttons">
					<button @click="selectMode('ffmpeg')" class="mode-selection-button ffmpeg-mode">
						<div class="mode-icon">🎬</div>
						<div class="mode-name">FFmpeg</div>
						<div class="mode-description">基于 WebAssembly，功能强大，兼容性好</div>
					</button>
					<button @click="selectMode('webav')" class="mode-selection-button webav-mode">
						<div class="mode-icon">⚡</div>
						<div class="mode-name">WebAV</div>
						<div class="mode-description">基于 WebCodecs，性能优异，需要现代浏览器</div>
					</button>
				</div>
			</div>
		</div>

		<!-- 加载遮罩层 -->
		<div v-else-if="isFFmpegLoading" class="loading-overlay">
			<div class="loading-content">
				<div class="loading-spinner"></div>
				<h2 class="loading-title">正在加载 {{ processingMode === 'ffmpeg' ? 'FFmpeg' : 'WebAV' }}...</h2>
				<div class="loading-progress-bar">
					<div class="loading-progress-fill" :style="{ width: `${ffmpegLoadProgress}%` }"></div>
				</div>
				<p class="loading-text">{{ ffmpegLoadProgress }}%</p>
				<p class="loading-hint">
					{{ processingMode === 'ffmpeg' ? '首次加载可能需要一些时间，请耐心等待' : '正在检查 WebCodecs 支持...' }}
				</p>
			</div>
		</div>

		<!-- 加载失败页面 -->
		<div v-else-if="ffmpegLoadError && !isFFmpegLoaded && processingMode" class="error-overlay">
			<div class="error-content">
				<div class="error-icon">❌</div>
				<h2 class="error-title">{{ processingMode === 'ffmpeg' ? 'FFmpeg' : 'WebAV' }} 加载失败</h2>
				<p class="error-message">{{ ffmpegLoadError }}</p>
				<div class="error-hints">
					<p>可能的原因：</p>
					<ul>
						<li v-if="processingMode === 'ffmpeg'">网络连接不稳定</li>
						<li v-if="processingMode === 'ffmpeg'">CDN 资源加载失败</li>
						<li v-if="processingMode === 'ffmpeg'">浏览器不支持 WebAssembly</li>
						<li v-if="processingMode === 'webav'">浏览器不支持 WebCodecs API</li>
						<li v-if="processingMode === 'webav'">请使用 Chrome 94+ 或 Edge 94+ 浏览器</li>
					</ul>
				</div>
				<div class="error-actions">
					<button @click="selectMode(processingMode!)" class="retry-button">
						🔄 重新加载
					</button>
					<button @click="processingMode = null; isFFmpegLoaded = false; ffmpegLoadError = ''" class="back-button">
						↩️ 重新选择模式
					</button>
					<button @click="goToHome" class="back-button">
						🏠 返回首页
					</button>
				</div>
			</div>
		</div>

		<!-- 主界面（仅在加载成功后显示） -->
		<template v-else-if="isFFmpegLoaded && processingMode">
			<div class="editor-header">
				<h1 class="editor-title">视频编辑器</h1>
				<div class="header-controls">
					<!-- 模式选择 -->
					<div class="mode-selector">
						<label class="mode-label">处理模式：</label>
						<div class="mode-buttons">
							<button
								@click="selectMode('ffmpeg')"
								class="mode-button"
								:class="{ active: processingMode === 'ffmpeg' }"
								:disabled="isProcessing || isFFmpegLoading"
							>
								FFmpeg
							</button>
							<button
								@click="selectMode('webav')"
								class="mode-button"
								:class="{ active: processingMode === 'webav' }"
								:disabled="isProcessing || isFFmpegLoading"
							>
								WebAV
							</button>
						</div>
					</div>
					<div v-if="isFFmpegLoaded && processingMode" class="ffmpeg-status">
						<span class="status-indicator"></span>
						<span class="status-text">{{ processingMode === 'ffmpeg' ? 'FFmpeg' : 'WebAV' }} 已就绪</span>
					</div>
				</div>
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
				<!-- 左侧控制面板 -->
				<div class="left-panel">
					<!-- 倍速控制面板 -->
					<div class="speed-control-panel">
						<div class="speed-control-item">
							<label class="speed-label">
								<span>倍速：</span>
								<span class="speed-value">{{ speed.toFixed(2) }}x</span>
							</label>
							<div class="speed-controls">
								<input type="range" min="0.25" max="4" step="0.25" v-model.number="speed"
									class="speed-slider" :disabled="isProcessing || !isFFmpegLoaded" />
								<div class="speed-presets">
									<button v-for="preset in [0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 3.0, 4.0]" :key="preset"
										@click="speed = preset" class="speed-preset-btn"
										:class="{ active: speed === preset }" :disabled="isProcessing || !isFFmpegLoaded">
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

					<!-- 对比度调整 -->
					<div class="contrast-control-panel">
						<div class="contrast-control-item">
							<label class="contrast-label">
								<span>对比度：</span>
								<span class="contrast-value">{{ contrast.toFixed(2) }}</span>
							</label>
							<div class="contrast-controls">
								<input type="range" min="0.5" max="2.0" step="0.1" v-model.number="contrast"
									class="contrast-slider" :disabled="isProcessing || !isFFmpegLoaded" />
							</div>
						</div>
						<div class="contrast-actions">
							<button @click="applyContrast" class="apply-button"
								:disabled="isProcessing || !isFFmpegLoaded || !originalVideoFile">
								{{ isProcessing ? "处理中..." : "应用对比度" }}
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

					<!-- 视频信息 -->
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

				<!-- 右侧视频区域 -->
				<div class="right-panel">
					<div class="video-wrapper">
						<video ref="videoElement" :src="videoUrl" :controls="false" class="video-preview">
							您的浏览器不支持视频播放
						</video>
					</div>

					<!-- 时间轴组件 -->
					<TimeLine :videoUrl="videoUrl" :videoElement="videoElement" />
				</div>
			</div>

			<div v-else class="tips">
				<p>请上传一个视频文件开始编辑</p>
				<p>支持的格式：MP4, WebM, OGG 等</p>
			</div>
		</template>
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
	width: 100%;
}

.editor-title {
	font-size: 2.5rem;
	font-weight: bold;
	margin-bottom: 1rem;
}

.header-controls {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 20px;
}

.mode-selector {
	display: flex;
	align-items: center;
	gap: 12px;
	background: rgba(255, 255, 255, 0.1);
	padding: 12px 20px;
	border-radius: 12px;
	backdrop-filter: blur(10px);
}

.mode-label {
	font-size: 16px;
	font-weight: 600;
	opacity: 0.9;
}

.mode-buttons {
	display: flex;
	gap: 8px;
}

.mode-button {
	padding: 8px 20px;
	background: rgba(255, 255, 255, 0.2);
	color: white;
	border: 2px solid rgba(255, 255, 255, 0.3);
	border-radius: 8px;
	cursor: pointer;
	font-size: 14px;
	font-weight: 600;
	transition: all 0.3s ease;
}

.mode-button:hover:not(:disabled) {
	background: rgba(255, 255, 255, 0.3);
	transform: translateY(-2px);
}

.mode-button.active {
	background: #667eea;
	border-color: #667eea;
	box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
}

.mode-button:disabled {
	opacity: 0.5;
	cursor: not-allowed;
}

.ffmpeg-status {
	display: flex;
	align-items: center;
	justify-content: center;
	gap: 8px;
	margin-top: 10px;
	font-size: 14px;
	opacity: 0.9;
}

.status-indicator {
	width: 10px;
	height: 10px;
	border-radius: 50%;
	background: #4caf50;
	animation: pulse 2s ease-in-out infinite;
}

@keyframes pulse {

	0%,
	100% {
		opacity: 1;
		transform: scale(1);
	}

	50% {
		opacity: 0.6;
		transform: scale(1.1);
	}
}

.status-text {
	font-weight: 500;
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
	max-width: 1400px;
	display: flex;
	flex-direction: row;
	gap: 20px;
	align-items: flex-start;
}

/* 左侧控制面板 */
.left-panel {
	flex: 0 0 320px;
	display: flex;
	flex-direction: column;
	gap: 20px;
}

/* 右侧视频区域 */
.right-panel {
	flex: 1;
	display: flex;
	flex-direction: column;
	gap: 20px;
	min-width: 0;
}

.video-wrapper {
	width: 100%;
	background: rgba(0, 0, 0, 0.3);
	border-radius: 12px;
	padding: 20px;
	box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
	display: flex;
	align-items: center;
	justify-content: center;
}

.video-preview {
	width: 100%;
	max-width: 100%;
	max-height: 70vh;
	height: auto;
	border-radius: 8px;
	background: #000;
	object-fit: contain;
}

.video-info {
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
	background: rgba(255, 255, 255, 0.1);
	border-radius: 12px;
	padding: 20px;
	backdrop-filter: blur(10px);
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

/* FFmpeg 加载遮罩层样式 */
.loading-overlay {
	position: fixed;
	top: 60px; /* 从导航栏下方开始 */
	left: 0;
	right: 0;
	bottom: 0;
	background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
	display: flex;
	align-items: center;
	justify-content: center;
	z-index: 999; /* 低于导航栏的 z-index: 1000 */
}

.loading-content {
	text-align: center;
	padding: 40px;
	background: rgba(255, 255, 255, 0.1);
	border-radius: 20px;
	backdrop-filter: blur(10px);
	box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
	max-width: 500px;
	width: 90%;
}

.loading-spinner {
	width: 60px;
	height: 60px;
	border: 4px solid rgba(255, 255, 255, 0.3);
	border-top-color: white;
	border-radius: 50%;
	animation: spin 1s linear infinite;
	margin: 0 auto 20px;
}

@keyframes spin {
	to {
		transform: rotate(360deg);
	}
}

.loading-title {
	font-size: 1.8rem;
	font-weight: bold;
	margin-bottom: 20px;
	color: white;
}

.loading-progress-bar {
	width: 100%;
	height: 12px;
	background: rgba(255, 255, 255, 0.2);
	border-radius: 6px;
	overflow: hidden;
	margin-bottom: 12px;
}

.loading-progress-fill {
	height: 100%;
	background: linear-gradient(90deg, #4caf50, #8bc34a);
	border-radius: 6px;
	transition: width 0.3s ease;
	box-shadow: 0 0 10px rgba(76, 175, 80, 0.5);
}

.loading-text {
	font-size: 1.5rem;
	font-weight: bold;
	margin-bottom: 10px;
	color: white;
}

.loading-hint {
	font-size: 0.9rem;
	opacity: 0.8;
	color: white;
	margin-top: 10px;
}

/* FFmpeg 加载失败页面样式 */
.error-overlay {
	position: fixed;
	top: 60px; /* 从导航栏下方开始 */
	left: 0;
	right: 0;
	bottom: 0;
	background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
	display: flex;
	align-items: center;
	justify-content: center;
	z-index: 999; /* 低于导航栏的 z-index: 1000 */
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

/* 响应式设计 */
@media (max-width: 1024px) {
	.video-preview-section {
		flex-direction: column;
		max-width: 100%;
	}

	.left-panel {
		flex: 1;
		width: 100%;
	}

	.right-panel {
		width: 100%;
	}

	.video-preview {
		max-height: 60vh;
	}
}

@media (max-width: 768px) {
	.video-preview-section {
		gap: 16px;
	}

	.left-panel {
		flex: 1;
	}

	.speed-control-panel {
		padding: 16px;
	}

	.video-wrapper {
		padding: 12px;
	}

	.video-preview {
		max-height: 50vh;
	}
}

/* 对比度控制面板样式 */
.contrast-control-panel {
	background: rgba(255, 255, 255, 0.1);
	border-radius: 12px;
	padding: 20px;
	backdrop-filter: blur(10px);
}

.contrast-control-item {
	margin-bottom: 20px;
}

.contrast-label {
	display: flex;
	justify-content: space-between;
	align-items: center;
	margin-bottom: 12px;
	font-size: 16px;
	font-weight: 600;
}

.contrast-value {
	color: #ffd700;
	font-size: 18px;
	font-weight: bold;
}

.contrast-controls {
	display: flex;
	flex-direction: column;
	gap: 12px;
}

.contrast-slider {
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

.contrast-slider:hover:not(:disabled) {
	background: rgba(255, 255, 255, 0.3);
}

.contrast-slider:disabled {
	opacity: 0.5;
	cursor: not-allowed;
}

.contrast-slider::-webkit-slider-thumb {
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

.contrast-slider::-webkit-slider-thumb:hover:not(:disabled) {
	background: #5568d3;
	transform: scale(1.1);
}

.contrast-slider::-moz-range-thumb {
	width: 20px;
	height: 20px;
	border-radius: 50%;
	background: #667eea;
	cursor: pointer;
	border: none;
	box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
	transition: all 0.2s ease;
}

.contrast-slider::-moz-range-thumb:hover:not(:disabled) {
	background: #5568d3;
	transform: scale(1.1);
}

.contrast-presets {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.contrast-preset-btn {
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

.contrast-preset-btn:hover:not(:disabled) {
	background: rgba(255, 255, 255, 0.3);
	transform: translateY(-1px);
}

.contrast-preset-btn.active {
	background: #667eea;
	border-color: #667eea;
	font-weight: 600;
}

.contrast-preset-btn:disabled {
	opacity: 0.5;
	cursor: not-allowed;
}

.contrast-actions {
	display: flex;
	gap: 12px;
	justify-content: center;
	margin-top: 20px;
}

/* 模式选择界面样式 */
.mode-selection-overlay {
	position: fixed;
	top: 60px; /* 从导航栏下方开始 */
	left: 0;
	right: 0;
	bottom: 0;
	background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
	display: flex;
	align-items: center;
	justify-content: center;
	z-index: 999; /* 低于导航栏的 z-index: 1000 */
}

.mode-selection-content {
	text-align: center;
	padding: 60px 40px;
	background: rgba(255, 255, 255, 0.1);
	border-radius: 24px;
	backdrop-filter: blur(10px);
	box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
	max-width: 800px;
	width: 90%;
}

.mode-selection-title {
	font-size: 2.5rem;
	font-weight: bold;
	margin-bottom: 16px;
	color: white;
}

.mode-selection-hint {
	font-size: 1.1rem;
	opacity: 0.9;
	color: white;
	margin-bottom: 40px;
}

.mode-selection-buttons {
	display: flex;
	gap: 30px;
	justify-content: center;
	flex-wrap: wrap;
}

.mode-selection-button {
	flex: 1;
	min-width: 280px;
	max-width: 350px;
	padding: 40px 30px;
	background: rgba(255, 255, 255, 0.15);
	border: 3px solid rgba(255, 255, 255, 0.3);
	border-radius: 20px;
	cursor: pointer;
	transition: all 0.3s ease;
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 16px;
}

.mode-selection-button:hover {
	background: rgba(255, 255, 255, 0.25);
	border-color: rgba(255, 255, 255, 0.5);
	transform: translateY(-5px);
	box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
}

.mode-selection-button.ffmpeg-mode:hover {
	border-color: #667eea;
	box-shadow: 0 10px 30px rgba(102, 126, 234, 0.4);
}

.mode-selection-button.webav-mode:hover {
	border-color: #4caf50;
	box-shadow: 0 10px 30px rgba(76, 175, 80, 0.4);
}

.mode-icon {
	font-size: 4rem;
	margin-bottom: 8px;
}

.mode-name {
	font-size: 1.8rem;
	font-weight: bold;
	color: white;
}

.mode-description {
	font-size: 1rem;
	color: rgba(255, 255, 255, 0.85);
	line-height: 1.5;
}

@media (max-width: 768px) {
	.mode-selection-buttons {
		flex-direction: column;
		gap: 20px;
	}

	.mode-selection-button {
		min-width: 100%;
		max-width: 100%;
	}

	.mode-selection-title {
		font-size: 2rem;
	}

	.mode-selection-content {
		padding: 40px 20px;
	}
}
</style>
