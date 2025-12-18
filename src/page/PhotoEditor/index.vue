<script setup lang="ts">
import { ref, onMounted, nextTick, onBeforeUnmount } from "vue";
import { ImageEditor } from "../../utils/ImageEditor";
import { throttle, debounce } from "../../utils/utils";
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
const saturation = ref<number>(0); // 饱和度：-100 到 100
const enhance = ref<number>(0); // 增强：0 到 100
const blur = ref<number>(0); // 模糊：0 到 100
const shadow = ref<number>(0); // 阴影：-100 到 100（调整图片暗部亮度）
const highlight = ref<number>(0); // 高光：-100 到 100（调整图片亮部亮度）

// 画笔状态
const isBrushMode = ref<boolean>(false);
const brushSize = ref<number>(10); // 画笔粗细：1 到 50

// 对比模式状态
const isComparing = ref<boolean>(false); // 是否正在对比

// localStorage 键名
const STORAGE_KEY = "photoEditor_state";

// localStorage 可用性标记，避免反复触发配额错误
let storageDisabled = false;

// 保存状态到本地缓存
const saveStateToStorage = () => {
	// localStorage 已经被判定为不可用（例如配额已满），直接跳过
	if (storageDisabled) return;
	if (!imageUrl.value || !imageEditor.value) return;

	const imageState = imageEditor.value.getImageState();
	const state = {
		imageUrl: imageUrl.value,
		contrast: contrast.value,
		temperature: temperature.value,
		saturation: saturation.value,
		enhance: enhance.value,
		blur: blur.value,
		shadow: shadow.value,
		highlight: highlight.value,
		imageState: imageState,
		timestamp: Date.now(),
	};

	try {
		const serialized = JSON.stringify(state);

		// 如果数据过大（通常是图片 Base64 太长），避免触发配额错误
		// 这里只是一个经验阈值，大约 ~2MB 字符
		if (serialized.length > 2_000_000) {
			console.warn(
				"[photoEditor] 状态过大，已停止写入 localStorage（不再持久化图片，以避免配额错误）。"
			);
			storageDisabled = true;
			return;
		}

		localStorage.setItem(STORAGE_KEY, serialized);
	} catch (error: any) {
		console.warn("[photoEditor] 保存状态失败，已禁用后续 localStorage 写入：", error);
		// 防止后续频繁报错
		storageDisabled = true;
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
			if (typeof state.saturation === "number") {
				saturation.value = state.saturation;
				imageEditor.value.setSaturation(state.saturation);
			}
			if (typeof state.enhance === "number") {
				enhance.value = state.enhance;
				imageEditor.value.setEnhance(state.enhance);
			}
			if (typeof state.blur === "number") {
				blur.value = state.blur;
				imageEditor.value.setBlur(state.blur);
			}
			if (typeof state.shadow === "number") {
				shadow.value = state.shadow;
				imageEditor.value.setShadow(state.shadow);
			}
			if (typeof state.highlight === "number") {
				highlight.value = state.highlight;
				imageEditor.value.setHighlight(state.highlight);
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
	// 画笔模式下不允许清除整体状态，避免误操作
	if (isBrushMode.value) return;
	try {
		localStorage.removeItem(STORAGE_KEY);
		imageUrl.value = "";
		contrast.value = 0;
		temperature.value = 0;
		saturation.value = 0;
		enhance.value = 0;
		blur.value = 0;
		isBrushMode.value = false;
		brushSize.value = 10;
		if (imageEditor.value) {
			imageEditor.value.disableBrush();
			imageEditor.value.clearImage();
			imageEditor.value.resetFilters();
		}
		alert("缓存已清除");
	} catch (error) {
		console.error("清除缓存失败:", error);
	}
};

// 节流更新滤镜（每 50ms 最多更新一次）
const throttledUpdateFilter = throttle((type: 'contrast' | 'temperature' | 'saturation' | 'enhance' | 'blur' | 'shadow' | 'highlight', value: number) => {
	if (!imageEditor.value) return;
	if (type === 'contrast') {
		imageEditor.value.setContrast(value);
	} else if (type === 'temperature') {
		imageEditor.value.setTemperature(value);
	} else if (type === 'saturation') {
		imageEditor.value.setSaturation(value);
	} else if (type === 'enhance') {
		imageEditor.value.setEnhance(value);
	} else if (type === 'blur') {
		imageEditor.value.setBlur(value);
	} else if (type === 'shadow') {
		imageEditor.value.setShadow(value);
	} else if (type === 'highlight') {
		imageEditor.value.setHighlight(value);
	}
}, 50);

// 防抖保存状态（延迟 500ms）
const debouncedSaveState = debounce(saveStateToStorage, 500);

// 处理对比度变化
const handleContrastChange = (value: number) => {
	// 画笔模式下不允许调整滤镜
	if (isBrushMode.value) return;
	contrast.value = value;
	// 使用节流更新滤镜，避免频繁重绘
	throttledUpdateFilter('contrast', value);
	// 使用防抖保存，避免频繁操作
	debouncedSaveState();
};

// 重置单项：对比度
const resetContrast = () => {
	if (isBrushMode.value) return;
	handleContrastChange(0);
};

// 处理色温变化
const handleTemperatureChange = (value: number) => {
	if (isBrushMode.value) return;
	temperature.value = value;
	// 使用节流更新滤镜，避免频繁重绘
	throttledUpdateFilter('temperature', value);
	// 使用防抖保存，避免频繁操作
	debouncedSaveState();
};

// 重置单项：色温
const resetTemperature = () => {
	if (isBrushMode.value) return;
	handleTemperatureChange(0);
};

// 处理饱和度变化
const handleSaturationChange = (value: number) => {
	if (isBrushMode.value) return;
	saturation.value = value;
	throttledUpdateFilter('saturation', value);
	debouncedSaveState();
};

// 重置单项：饱和度
const resetSaturation = () => {
	if (isBrushMode.value) return;
	handleSaturationChange(0);
};

// 处理增强变化
const handleEnhanceChange = (value: number) => {
	if (isBrushMode.value) return;
	enhance.value = value;
	// 使用节流更新滤镜，避免频繁重绘
	throttledUpdateFilter('enhance', value);
	// 使用防抖保存，避免频繁操作
	debouncedSaveState();
};

// 重置单项：增强
const resetEnhance = () => {
	if (isBrushMode.value) return;
	handleEnhanceChange(0);
};

// 处理模糊变化
const handleBlurChange = (value: number) => {
	if (isBrushMode.value) return;
	blur.value = value;
	// 使用节流更新滤镜，避免频繁重绘
	throttledUpdateFilter('blur', value);
	// 使用防抖保存，避免频繁操作
	debouncedSaveState();
};

// 重置单项：模糊
const resetBlur = () => {
	if (isBrushMode.value) return;
	handleBlurChange(0);
};

// 处理阴影变化
const handleShadowChange = (value: number) => {
	if (isBrushMode.value) return;
	shadow.value = value;
	// 使用节流更新滤镜，避免频繁重绘
	throttledUpdateFilter('shadow', value);
	// 使用防抖保存，避免频繁操作
	debouncedSaveState();
};

// 重置单项：阴影
const resetShadow = () => {
	if (isBrushMode.value) return;
	handleShadowChange(0);
};

// 处理高光变化
const handleHighlightChange = (value: number) => {
	if (isBrushMode.value) return;
	highlight.value = value;
	// 使用节流更新滤镜，避免频繁重绘
	throttledUpdateFilter('highlight', value);
	// 使用防抖保存，避免频繁操作
	debouncedSaveState();
};

// 重置单项：高光
const resetHighlight = () => {
	if (isBrushMode.value) return;
	handleHighlightChange(0);
};

// 重置所有调整
const handleReset = () => {
	contrast.value = 0;
	temperature.value = 0;
	saturation.value = 0;
	enhance.value = 0;
	blur.value = 0;
	shadow.value = 0;
	highlight.value = 0;
	if (imageEditor.value) {
		imageEditor.value.resetFilters();
	}
};

// 切换画笔模式
const toggleBrush = () => {
	if (!imageEditor.value) return;

	isBrushMode.value = !isBrushMode.value;

	if (isBrushMode.value) {
		// 开启画笔模式
		imageEditor.value.enableBrush('#000000', brushSize.value);
	} else {
		// 关闭画笔模式
		imageEditor.value.disableBrush();
	}
};

// 处理画笔粗细变化
const handleBrushSizeChange = (value: number) => {
	brushSize.value = value;
	if (imageEditor.value && isBrushMode.value) {
		imageEditor.value.setBrushSize(value);
	}
};

// 导出画笔图层
const handleExportBrush = async () => {
	if (!imageEditor.value) {
		alert("请先上传图片");
		return;
	}

	try {
		const dataURL = await imageEditor.value.exportBrushLayer();

		// 创建下载链接
		const link = document.createElement('a');
		link.download = `brush-mask-${Date.now()}.png`;
		link.href = dataURL;
		link.click();

		alert("导出成功！");
	} catch (error: any) {
		console.error("导出失败:", error);
		alert(error.message || "导出失败，请重试");
	}
};

// 导出编辑后的完整图片（包含滤镜效果和画笔）
const handleExportEditedImage = async () => {
	if (!imageEditor.value) {
		alert("请先上传图片");
		return;
	}

	try {
		const dataURL = await imageEditor.value.exportEditedImage('image/png', 0.95);

		// 创建下载链接
		const link = document.createElement('a');
		link.download = `edited-image-${Date.now()}.png`;
		link.href = dataURL;
		link.click();

		alert("导出成功！");
	} catch (error: any) {
		console.error("导出失败:", error);
		alert(error.message || "导出失败，请重试");
	}
};

// 对比调整前后效果
const toggleCompare = () => {
	if (!imageEditor.value) return;
	
	isComparing.value = !isComparing.value;
	
	if (isComparing.value) {
		// 显示原图：重置所有滤镜
		imageEditor.value.resetFilters();
	} else {
		// 恢复调整后的效果：重新应用所有滤镜
		imageEditor.value.setContrast(contrast.value);
		imageEditor.value.setTemperature(temperature.value);
		imageEditor.value.setSaturation(saturation.value);
		imageEditor.value.setEnhance(enhance.value);
		imageEditor.value.setBlur(blur.value);
		imageEditor.value.setShadow(shadow.value);
		imageEditor.value.setHighlight(highlight.value);
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
				saturation.value = 0;
				enhance.value = 0;
				blur.value = 0;
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
		// 先关闭画笔模式
		if (isBrushMode.value) {
			imageEditor.value.disableBrush();
		}
		imageEditor.value.destroy();
		imageEditor.value = null;
	}
});

const min = -100;
const max = 100;
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
				<!-- 对比按钮 -->
				<button 
					v-if="imageUrl" 
					@mousedown="toggleCompare" 
					@mouseup="toggleCompare"
					@mouseleave="isComparing && toggleCompare()"
					@touchstart="toggleCompare"
					@touchend="toggleCompare"
					class="compare-button"
					:class="{ 'active': isComparing }"
				>
					{{ isComparing ? '调整后' : '对比原图' }}
				</button>
			</div>
		</div>

		<div class="editor-wrapper" v-show="imageUrl">
			<!-- 工具面板 -->
			<div class="tool-panels-container">
				<div class="tool-panel">
					<h3 class="tool-panel-title">图片调整</h3>
					<!-- 对比度调节 -->
					<div class="tool-item" :class="{ 'tool-item-disabled': isBrushMode }">
						<label class="tool-label" @dblclick="resetContrast">
							<span>对比度</span>
							<span class="tool-value">{{ contrast }}</span>
						</label>
						<input type="range" :min="min" :max="max" step="1" v-model.number="contrast"
							:disabled="isBrushMode"
							@input="handleContrastChange(contrast)" @change="saveStateToStorage" class="tool-slider" />
						<div class="tool-range-labels">
							<span>{{ min }}</span>
							<span>0</span>
							<span>{{ max }}</span>
						</div>
					</div>
					<!-- 色温调节 -->
					<div class="tool-item" :class="{ 'tool-item-disabled': isBrushMode }">
						<label class="tool-label" @dblclick="resetTemperature">
							<span>色温</span>
							<span class="tool-value">{{ temperature }}</span>
						</label>
						<input type="range" :min="min" :max="max" step="1" v-model.number="temperature"
							:disabled="isBrushMode"
							@input="handleTemperatureChange(temperature)" @change="saveStateToStorage"
							class="tool-slider" />
						<div class="tool-range-labels">
							<span>暖</span>
							<span>0</span>
							<span>冷</span>
						</div>
					</div>
					<!-- 饱和度调节 -->
					<div class="tool-item" :class="{ 'tool-item-disabled': isBrushMode }">
						<label class="tool-label" @dblclick="resetSaturation">
							<span>饱和度</span>
							<span class="tool-value">{{ saturation }}</span>
						</label>
						<input type="range" :min="min" :max="max" step="1" v-model.number="saturation"
							:disabled="isBrushMode"
							@input="handleSaturationChange(saturation)" @change="saveStateToStorage"
							class="tool-slider" />
						<div class="tool-range-labels">
							<span>{{ min }}</span>
							<span>0</span>
							<span>{{ max }}</span>
						</div>
					</div>
					<!-- 模糊调节 -->
					<div class="tool-item" :class="{ 'tool-item-disabled': isBrushMode }">
						<label class="tool-label" @dblclick="resetBlur">
							<span>模糊</span>
							<span class="tool-value">{{ blur }}</span>
						</label>
						<input type="range" min="0" max="100" step="1" v-model.number="blur"
							:disabled="isBrushMode"
							@input="handleBlurChange(blur)" @change="saveStateToStorage" class="tool-slider" />
						<div class="tool-range-labels">
							<span>0</span>
							<span>50</span>
							<span>100</span>
						</div>
					</div>
					<!-- 增强调节 -->
					<div class="tool-item" :class="{ 'tool-item-disabled': isBrushMode }">
						<label class="tool-label" @dblclick="resetEnhance">
							<span>滤镜效果增强</span>
							<span class="tool-value">{{ enhance }}</span>
						</label>
						<input type="range" min="0" max="100" step="1" v-model.number="enhance"
							:disabled="isBrushMode"
							@input="handleEnhanceChange(enhance)" @change="saveStateToStorage" class="tool-slider" />
						<div class="tool-range-labels">
							<span>0</span>
							<span>50</span>
							<span>100</span>
						</div>
					</div>
					<!-- 阴影调节 -->
					<div class="tool-item" :class="{ 'tool-item-disabled': isBrushMode }">
						<label class="tool-label" @dblclick="resetShadow">
							<span>阴影</span>
							<span class="tool-value">{{ shadow }}</span>
						</label>
						<input type="range" min="-100" max="100" step="1" v-model.number="shadow"
							:disabled="isBrushMode"
							@input="handleShadowChange(shadow)" @change="saveStateToStorage" class="tool-slider" />
						<div class="tool-range-labels">
							<span>压暗</span>
							<span>0</span>
							<span>提亮</span>
						</div>
					</div>
					<!-- 高光调节 -->
					<div class="tool-item" :class="{ 'tool-item-disabled': isBrushMode }">
						<label class="tool-label" @dblclick="resetHighlight">
							<span>高光</span>
							<span class="tool-value">{{ highlight }}</span>
						</label>
						<input type="range" min="-100" max="100" step="1" v-model.number="highlight"
							:disabled="isBrushMode"
							@input="handleHighlightChange(highlight)" @change="saveStateToStorage" class="tool-slider" />
						<div class="tool-range-labels">
							<span>压暗</span>
							<span>0</span>
							<span>提亮</span>
						</div>
					</div>
					<!-- 重置按钮 -->
					<button @click="handleReset" :disabled="isBrushMode" class="reset-button">
						重置调整
					</button>
					<!-- 清除缓存按钮 -->
					<button @click="clearStorage" :disabled="isBrushMode" class="clear-button">
						清除缓存
					</button>
					<!-- 导出编辑后图片按钮 -->
					<button @click="handleExportEditedImage" :disabled="!imageUrl" class="export-edited-button">
						导出编辑后图片
					</button>
				</div>
			</div>
			<!-- 画布容器 -->
			<div class="canvas-container">
				<div ref="containerRef" class="konva-container"></div>
			</div>
			<!-- 画笔工具面板（右侧独立） -->
			<div class="brush-panel-container">
				<div class="tool-panel brush-panel">
					<h3 class="tool-panel-title">画笔工具</h3>
					<button @click="toggleBrush" :class="{ 'active': isBrushMode }" class="brush-button">
						{{ isBrushMode ? '关闭画笔' : '开启画笔' }}
					</button>
					<!-- 画笔粗细调节（仅在画笔模式下显示） -->
					<div v-if="isBrushMode" class="tool-item">
						<label class="tool-label">
							<span>画笔粗细</span>
							<span class="tool-value">{{ brushSize }}</span>
						</label>
						<input type="range" min="1" max="50" step="1" v-model.number="brushSize"
							@input="handleBrushSizeChange(brushSize)" class="tool-slider" />
						<div class="tool-range-labels">
							<span>1</span>
							<span>25</span>
							<span>50</span>
						</div>
					</div>
					<button v-if="isBrushMode" @click="imageEditor?.clearBrush()" class="clear-brush-button">
						清除画笔痕迹
					</button>
					<button v-if="isBrushMode" @click="handleExportBrush" class="export-button">
						导出画笔图层
					</button>
					
				</div>
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
	display: flex;
	flex-direction: column;
	overflow: hidden;
}

.upload-section {
	text-align: center;
	padding: 20px 0;
	flex-shrink: 0;
}

.upload-section h1 {
	color: white;
	margin-bottom: 20px;
	font-size: 2rem;
}

.upload-area {
	display: flex;
	gap: 16px;
	justify-content: center;
	align-items: center;
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

.repo-button {
	text-decoration: none;
	display: inline-flex;
	align-items: center;
	justify-content: center;
}

.compare-button {
	padding: 12px 24px;
	background: rgba(255, 255, 255, 0.95);
	color: #667eea;
	border: 2px solid #667eea;
	border-radius: 8px;
	cursor: pointer;
	font-size: 16px;
	font-weight: 600;
	transition: all 0.3s ease;
	box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
	user-select: none;
}

.compare-button:hover {
	background: white;
	transform: translateY(-2px);
	box-shadow: 0 6px 12px rgba(0, 0, 0, 0.15);
}

.compare-button.active {
	background: #667eea;
	color: white;
	border-color: white;
	box-shadow: 0 0 20px rgba(102, 126, 234, 0.5);
}

.compare-button:active {
	transform: translateY(0);
}

.editor-wrapper {
	display: flex;
	gap: 20px;
	justify-content: center;
	align-items: flex-start;
	padding: 0 20px 20px 20px;
	flex: 1;
	min-height: 0;
	overflow: hidden;
}

.tool-panels-container {
	display: flex;
	flex-direction: column;
	gap: 20px;
	max-height: 100%;
	overflow-y: auto;
	overflow-x: hidden;
	flex-shrink: 0;
	min-width: 280px;
}

.tool-panels-container::-webkit-scrollbar {
	width: 6px;
}

.tool-panels-container::-webkit-scrollbar-track {
	background: transparent;
}

.tool-panels-container::-webkit-scrollbar-thumb {
	background: rgba(0, 0, 0, 0.2);
	border-radius: 3px;
}

.tool-panels-container::-webkit-scrollbar-thumb:hover {
	background: rgba(0, 0, 0, 0.3);
}

.tool-panel {
	background: white;
	border-radius: 12px;
	padding: 20px;
	box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
	flex-shrink: 0;
	box-sizing: border-box;
	width: 100%;
	min-width: 0;
}

.tool-panel-title {
	margin: 0 0 20px 0;
	font-size: 1.25rem;
	color: #333;
	font-weight: 600;
}

.tool-item {
	margin-bottom: 24px;
}

.tool-item:last-of-type {
	margin-bottom: 20px;
}

/* 画笔模式下禁用滤镜调节的视觉状态 */
.tool-item-disabled {
	opacity: 0.5;
	pointer-events: none;
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

.reset-button:hover:not(:disabled) {
	background: #eeeeee;
	border-color: #d0d0d0;
	color: #333;
}

.reset-button:disabled {
	background: #e0e0e0;
	color: #999;
	border-color: #d0d0d0;
	cursor: not-allowed;
	opacity: 0.6;
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

.clear-button:hover:not(:disabled) {
	background: #ff5252;
	transform: translateY(-1px);
	box-shadow: 0 4px 8px rgba(255, 107, 107, 0.3);
}

.clear-button:disabled {
	background: #cccccc;
	color: #999;
	cursor: not-allowed;
	opacity: 0.6;
}

.export-edited-button {
	width: 100%;
	padding: 12px 24px;
	background: #667eea;
	color: white;
	border: none;
	border-radius: 8px;
	cursor: pointer;
	font-size: 0.95rem;
	font-weight: 500;
	transition: all 0.3s ease;
	margin-top: 12px;
}

.export-edited-button:hover:not(:disabled) {
	background: #5568d3;
	transform: translateY(-1px);
	box-shadow: 0 4px 8px rgba(102, 126, 234, 0.3);
}

.export-edited-button:disabled {
	background: #cccccc;
	color: #999;
	cursor: not-allowed;
	opacity: 0.6;
}

.brush-button {
	width: 100%;
	padding: 12px 24px;
	background: #4caf50;
	color: white;
	border: none;
	border-radius: 8px;
	cursor: pointer;
	font-size: 0.95rem;
	font-weight: 500;
	transition: all 0.3s ease;
	margin-bottom: 12px;
}

.brush-button:hover {
	background: #45a049;
	transform: translateY(-1px);
	box-shadow: 0 4px 8px rgba(76, 175, 80, 0.3);
}

.brush-button.active {
	background: #ff9800;
}

.brush-button.active:hover {
	background: #f57c00;
}

.clear-brush-button {
	width: 100%;
	padding: 12px 24px;
	background: #ff9800;
	color: white;
	border: none;
	border-radius: 8px;
	cursor: pointer;
	font-size: 0.95rem;
	font-weight: 500;
	transition: all 0.3s ease;
}

.clear-brush-button:hover {
	background: #f57c00;
	transform: translateY(-1px);
	box-shadow: 0 4px 8px rgba(255, 152, 0, 0.3);
}

.export-button {
	width: 100%;
	padding: 12px 24px;
	background: #2196f3;
	color: white;
	border: none;
	border-radius: 8px;
	cursor: pointer;
	font-size: 0.95rem;
	font-weight: 500;
	transition: all 0.3s ease;
	margin-top: 12px;
}

.export-button:hover {
	background: #1976d2;
	transform: translateY(-1px);
	box-shadow: 0 4px 8px rgba(33, 150, 243, 0.3);
}

.canvas-container {
	display: flex;
	justify-content: center;
	align-items: center;
	background: white;
	border-radius: 12px;
	box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
	overflow: auto;
	flex: 1;
	min-width: 0;
	min-height: 0;
}

.brush-panel-container {
	display: flex;
	flex-direction: column;
	flex-shrink: 0;
	width: 280px;
	min-width: 280px;
	max-width: 280px;
	max-height: 100%;
	overflow-y: auto;
	overflow-x: visible;
}

.brush-panel-container::-webkit-scrollbar {
	width: 6px;
}

.brush-panel-container::-webkit-scrollbar-track {
	background: transparent;
}

.brush-panel-container::-webkit-scrollbar-thumb {
	background: rgba(0, 0, 0, 0.2);
	border-radius: 3px;
}

.brush-panel-container::-webkit-scrollbar-thumb:hover {
	background: rgba(0, 0, 0, 0.3);
}

.brush-panel {
	width: 100%;
	min-width: 0;
	box-sizing: border-box;
}

.konva-container {
	border: 1px solid #e0e0e0;
	border-radius: 8px;
	background: #f5f5f5;
}

.tips {
	text-align: center;
	color: white;
	padding: 30px;
	background: rgba(255, 255, 255, 0.1);
	border-radius: 12px;
	backdrop-filter: blur(10px);
	flex: 1;
	display: flex;
	flex-direction: column;
	justify-content: center;
	align-items: center;
	overflow-y: auto;
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

