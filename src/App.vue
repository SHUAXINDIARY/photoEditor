<script setup lang="ts">
import { ref, onMounted, nextTick, onBeforeUnmount } from "vue";
import { ImageEditor } from "./utils/ImageEditor";

const containerRef = ref<HTMLDivElement | null>(null);
const imageUrl = ref<string>("");
const imageEditor = ref<ImageEditor | null>(null);
const stageConfig = ref({
	width: 800,
	height: 600,
});

// 工具面板参数
const contrast = ref<number>(0); // 对比度：-100 到 100
const temperature = ref<number>(0); // 色温：-100 到 100

// localStorage 键名
const STORAGE_KEY = "photoEditor_state";

// 保存状态到本地缓存
const saveStateToStorage = () => {
	if (!imageUrl.value || !imageEditor.value) return;

	const imageState = imageEditor.value.getImageState();
	const state = {
		imageUrl: imageUrl.value,
		contrast: contrast.value,
		temperature: temperature.value,
		imageState: imageState,
		timestamp: Date.now(),
	};

	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
	} catch (error) {
		console.error("保存状态失败:", error);
	}
};

// 从本地缓存恢复状态
const loadStateFromStorage = async (): Promise<boolean> => {
	try {
		const stored = localStorage.getItem(STORAGE_KEY);
		if (!stored) return false;

		const state = JSON.parse(stored);
		if (!state.imageUrl) return false;

		// 恢复图片 URL
		imageUrl.value = state.imageUrl;

		// 确保编辑器已初始化
		if (!imageEditor.value && containerRef.value) {
			initImageEditor();
		}

		// 等待编辑器初始化
		await nextTick();

		if (imageEditor.value) {
			// 加载图片
			await imageEditor.value.loadImage(state.imageUrl);

			// 恢复滤镜参数
			if (typeof state.contrast === "number") {
				contrast.value = state.contrast;
				imageEditor.value.setContrast(state.contrast);
			}
			if (typeof state.temperature === "number") {
				temperature.value = state.temperature;
				imageEditor.value.setTemperature(state.temperature);
			}

			// 恢复图片状态（位置、缩放）
			if (state.imageState) {
				await nextTick();
				// 等待图片完全加载后再恢复状态
				setTimeout(() => {
					if (imageEditor.value) {
						imageEditor.value.setImageState(state.imageState);
					}
				}, 100);
			}

			return true;
		}
	} catch (error) {
		console.error("恢复状态失败:", error);
	}
	return false;
};

// 清除本地缓存
const clearStorage = () => {
	try {
		localStorage.removeItem(STORAGE_KEY);
		imageUrl.value = "";
		contrast.value = 0;
		temperature.value = 0;
		if (imageEditor.value) {
			imageEditor.value.clearImage();
			imageEditor.value.resetFilters();
		}
		alert("缓存已清除");
	} catch (error) {
		console.error("清除缓存失败:", error);
	}
};

// 处理对比度变化
const handleContrastChange = (value: number) => {
	contrast.value = value;
	if (imageEditor.value) {
		imageEditor.value.setContrast(value);
		saveStateToStorage();
	}
};

// 处理色温变化
const handleTemperatureChange = (value: number) => {
	temperature.value = value;
	if (imageEditor.value) {
		imageEditor.value.setTemperature(value);
		saveStateToStorage();
	}
};

// 重置所有调整
const handleReset = () => {
	contrast.value = 0;
	temperature.value = 0;
	if (imageEditor.value) {
		imageEditor.value.resetFilters();
	}
};

// 初始化图片编辑器
const initImageEditor = () => {
	if (!containerRef.value) return;

	imageEditor.value = new ImageEditor(containerRef.value, {
		width: stageConfig.value.width,
		height: stageConfig.value.height,
		rotateEnabled: false,
	});

	// 设置图片状态变化回调
	if (imageEditor.value) {
		imageEditor.value.onImageStateChange = () => {
			saveStateToStorage();
		};
	}
};

// 处理图片上传
const handleFileUpload = async (event: Event) => {
	const target = event.target as HTMLInputElement;
	const file = target.files?.[0];
	if (!file) return;

	// 检查是否为图片文件
	if (!file.type.startsWith("image/")) {
		alert("请上传图片文件");
		return;
	}

	const reader = new FileReader();
	reader.onload = async (e) => {
		const result = e.target?.result as string;
		imageUrl.value = result;

		// 确保编辑器已初始化
		if (!imageEditor.value && containerRef.value) {
			initImageEditor();
		}

		// 加载图片
		if (imageEditor.value) {
			try {
				// 重置滤镜参数
				contrast.value = 0;
				temperature.value = 0;
				await imageEditor.value.loadImage(result);
				// 保存状态
				saveStateToStorage();
			} catch (error) {
				console.error("加载图片失败:", error);
				alert("加载图片失败，请重试");
			}
		}
	};
	reader.readAsDataURL(file);
};

onMounted(async () => {
	// 初始化画布大小
	if (typeof window !== "undefined") {
		stageConfig.value = {
			width: window.innerWidth - 40,
			height: window.innerHeight - 200,
		};
	}

	// 初始化图片编辑器（容器始终存在，只是隐藏）
	nextTick(async () => {
		initImageEditor();
		
		// 尝试从缓存恢复状态
		await nextTick();
		const restored = await loadStateFromStorage();
		if (restored) {
			console.log("已从缓存恢复图片状态");
		}
	});
});

onBeforeUnmount(() => {
	// 清理资源
	if (imageEditor.value) {
		imageEditor.value.destroy();
		imageEditor.value = null;
	}
});
</script>

<template>
	<div class="app-container">
		<div class="upload-section">
			<div class="title">图片编辑器</div>
			<div class="upload-area">
				<input type="file" accept="image/*" @change="handleFileUpload" id="file-input" class="file-input" />
				<label for="file-input" class="upload-button">
					选择图片上传
				</label>
			</div>
		</div>

		<div class="editor-wrapper" v-show="imageUrl">
			<!-- 工具面板 -->
			<div class="tool-panel">
				<h3 class="tool-panel-title">图片调整</h3>

				<!-- 对比度调节 -->
				<div class="tool-item">
					<label class="tool-label">
						<span>对比度</span>
						<span class="tool-value">{{ contrast }}</span>
					</label>
					<input type="range" min="-100" max="100" step="1" v-model.number="contrast"
						@input="handleContrastChange(contrast)" class="tool-slider" />
					<div class="tool-range-labels">
						<span>-100</span>
						<span>0</span>
						<span>100</span>
					</div>
				</div>

				<!-- 色温调节 -->
				<div class="tool-item">
					<label class="tool-label">
						<span>色温</span>
						<span class="tool-value">{{ temperature }}</span>
					</label>
					<input type="range" min="-100" max="100" step="1" v-model.number="temperature"
						@input="handleTemperatureChange(temperature)" class="tool-slider" />
					<div class="tool-range-labels">
						<span>冷</span>
						<span>0</span>
						<span>暖</span>
					</div>
				</div>

				<!-- 重置按钮 -->
				<button @click="handleReset" class="reset-button">
					重置调整
				</button>

				<!-- 清除缓存按钮 -->
				<button @click="clearStorage" class="clear-button">
					清除缓存
				</button>
			</div>

			<!-- 画布容器 -->
			<div class="canvas-container">
				<div ref="containerRef" class="konva-container"></div>
			</div>
		</div>

		<div class="tips" v-if="!imageUrl">
			<p>请上传一张图片开始编辑</p>
			<p>上传后，您可以：</p>
			<ul>
				<li>拖拽图片移动位置</li>
				<li>点击图片后，拖拽控制点进行缩放</li>
				<li>点击空白处取消选中</li>
			</ul>
		</div>
	</div>
</template>

<style scoped>
.app-container {
	width: 100vw;
	height: 100vh;
	background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.upload-section {
	text-align: center;
	margin-bottom: 20px;
}

.upload-section h1 {
	color: white;
	margin-bottom: 20px;
	font-size: 2rem;
}

.upload-area {
	display: inline-block;
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

.editor-wrapper {
	display: flex;
	gap: 20px;
	justify-content: center;
	align-items: flex-start;
}

.tool-panel {
	background: white;
	border-radius: 12px;
	padding: 24px;
	box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
	min-width: 280px;
}

.tool-panel-title {
	margin: 0 0 24px 0;
	font-size: 1.25rem;
	color: #333;
	font-weight: 600;
}

.tool-item {
	margin-bottom: 32px;
}

.tool-item:last-of-type {
	margin-bottom: 24px;
}

.tool-label {
	display: flex;
	justify-content: space-between;
	align-items: center;
	margin-bottom: 12px;
	font-size: 0.95rem;
	color: #555;
	font-weight: 500;
}

.tool-value {
	color: #667eea;
	font-weight: 600;
	font-size: 1rem;
}

.tool-slider {
	width: 100%;
	height: 6px;
	border-radius: 3px;
	background: #e0e0e0;
	outline: none;
	-webkit-appearance: none;
	appearance: none;
	cursor: pointer;
	transition: background 0.3s ease;
}

.tool-slider:hover {
	background: #d0d0d0;
}

.tool-slider::-webkit-slider-thumb {
	-webkit-appearance: none;
	appearance: none;
	width: 18px;
	height: 18px;
	border-radius: 50%;
	background: #667eea;
	cursor: pointer;
	box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
	transition: all 0.2s ease;
}

.tool-slider::-webkit-slider-thumb:hover {
	background: #5568d3;
	transform: scale(1.1);
}

.tool-slider::-moz-range-thumb {
	width: 18px;
	height: 18px;
	border-radius: 50%;
	background: #667eea;
	cursor: pointer;
	border: none;
	box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
	transition: all 0.2s ease;
}

.tool-slider::-moz-range-thumb:hover {
	background: #5568d3;
	transform: scale(1.1);
}

.tool-range-labels {
	display: flex;
	justify-content: space-between;
	margin-top: 8px;
	font-size: 0.75rem;
	color: #999;
}

.reset-button {
	width: 100%;
	padding: 12px 24px;
	background: #f5f5f5;
	color: #666;
	border: 1px solid #e0e0e0;
	border-radius: 8px;
	cursor: pointer;
	font-size: 0.95rem;
	font-weight: 500;
	transition: all 0.3s ease;
}

.reset-button:hover {
	background: #eeeeee;
	border-color: #d0d0d0;
	color: #333;
}

.clear-button {
	width: 100%;
	padding: 12px 24px;
	background: #ff6b6b;
	color: white;
	border: none;
	border-radius: 8px;
	cursor: pointer;
	font-size: 0.95rem;
	font-weight: 500;
	transition: all 0.3s ease;
	margin-top: 12px;
}

.clear-button:hover {
	background: #ff5252;
	transform: translateY(-1px);
	box-shadow: 0 4px 8px rgba(255, 107, 107, 0.3);
}

.canvas-container {
	display: flex;
	justify-content: center;
	background: white;
	border-radius: 12px;
	padding: 20px;
	box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
	overflow: auto;
}

.konva-container {
	border: 1px solid #e0e0e0;
	border-radius: 8px;
	background: #f5f5f5;
}

.tips {
	text-align: center;
	color: white;
	margin-top: 40px;
	padding: 30px;
	background: rgba(255, 255, 255, 0.1);
	border-radius: 12px;
	backdrop-filter: blur(10px);
}

.tips p {
	margin: 10px 0;
	font-size: 1.1rem;
}

.tips ul {
	list-style: none;
	padding: 0;
	margin-top: 20px;
}

.tips li {
	margin: 8px 0;
	font-size: 1rem;
	padding-left: 20px;
	position: relative;
}

.tips li::before {
	content: "✓";
	position: absolute;
	left: 0;
	color: #42b883;
	font-weight: bold;
}

.title {
	font-size: 20px;
	color: white;
	font-weight: bold;
	padding: 20px 0;
}
</style>
