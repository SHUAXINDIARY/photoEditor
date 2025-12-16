<script setup lang="ts">
import { ref } from "vue";

const videoUrl = ref<string>("");
const videoFile = ref<File | null>(null);

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
	// 重置文件输入
	const fileInput = document.getElementById("video-input") as HTMLInputElement;
	if (fileInput) {
		fileInput.value = "";
	}
};
</script>

<template>
	<div class="video-editor-container">
		<div class="editor-header">
			<h1 class="editor-title">视频编辑器</h1>
		</div>

		<div class="upload-section">
			<input
				type="file"
				accept="video/*"
				@change="handleVideoUpload"
				id="video-input"
				class="file-input"
			/>
			<label for="video-input" class="upload-button">
				{{ videoUrl ? "重新选择视频" : "选择视频上传" }}
			</label>
			<button
				v-if="videoUrl"
				@click="clearVideo"
				class="clear-button"
			>
				清除视频
			</button>
		</div>

		<div v-if="videoUrl" class="video-preview-section">
			<div class="video-wrapper">
				<video
					:src="videoUrl"
					controls
					class="video-preview"
				>
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
</style>

