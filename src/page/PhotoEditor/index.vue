<script setup lang="ts">
import { ref, onMounted, nextTick, onBeforeUnmount } from "vue";
import { createImageEditor, calcCanvasSize } from "@photoedit/image-editor";
import type { IImageEditor, EditorEngine } from "@photoedit/image-editor";
import { throttle } from "../../utils/utils";
import { toastSuccess, toastWarning, toastError } from "../../utils/toast";
const containerRef = ref<HTMLDivElement | null>(null);
const imageUrl = ref<string>("");
const imageEditor = ref<IImageEditor | null>(null);
const isSwitchingEngine = ref<boolean>(false);
const isEditorLoading = ref<boolean>(false);

/** 当前使用的渲染引擎，初始为 null，用户选择后才设置 */
const currentEngine = ref<EditorEngine | null>(null);
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

// 节流更新滤镜（每 50ms 最多更新一次）
const throttledUpdateFilter = throttle((type: 'contrast' | 'temperature' | 'saturation' | 'enhance' | 'blur' | 'shadow' | 'highlight', value: number) => {
	if (isSwitchingEngine.value) return;
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

// 处理对比度变化
const handleContrastChange = (value: number) => {
	// 画笔模式下不允许调整滤镜
	if (isBrushMode.value) return;
	contrast.value = value;
	// 使用节流更新滤镜，避免频繁重绘
	throttledUpdateFilter('contrast', value);
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
		toastWarning("请先上传图片");
		return;
	}

	try {
		const dataURL = await imageEditor.value.exportBrushLayer();

		// 创建下载链接
		const link = document.createElement('a');
		link.download = `brush-mask-${Date.now()}.png`;
		link.href = dataURL;
		link.click();

		toastSuccess("导出成功！");
	} catch (error: any) {
		console.error("导出失败:", error);
		toastError(error.message || "导出失败，请重试");
	}
};

// 导出编辑后的完整图片（包含滤镜效果和画笔）
const handleExportEditedImage = async () => {
	if (!imageEditor.value) {
		toastWarning("请先上传图片");
		return;
	}

	try {
		const dataURL = await imageEditor.value.exportEditedImage('image/png', 0.95);

		// 创建下载链接
		const link = document.createElement('a');
		link.download = `edited-image-${Date.now()}.png`;
		link.href = dataURL;
		link.click();

		toastSuccess("导出成功！");
	} catch (error: any) {
		console.error("导出失败:", error);
		toastError(error.message || "导出失败，请重试");
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
const initImageEditor = async () => {
	if (!containerRef.value || !currentEngine.value) return;

	imageEditor.value = await createImageEditor(containerRef.value, {
		width: stageConfig.value.width,
		height: stageConfig.value.height,
		rotateEnabled: false,
		engine: currentEngine.value,
	});
};

/**
 * 选择渲染引擎（首次选择或切换引擎）
 * @description 用户必须先选择引擎才能进入编辑器。
 * 切换引擎时会完全重置状态，不保留滤镜参数。
 */
const selectEngine = async (engine: EditorEngine) => {
	// 如果正在切换，不允许再次切换
	if (isSwitchingEngine.value || isEditorLoading.value) return;

	// 如果正在画笔模式，不允许切换
	if (isBrushMode.value) {
		toastWarning("请先关闭画笔模式再切换引擎");
		return;
	}

	// 如果已选择且引擎相同，直接返回
	if (currentEngine.value === engine && imageEditor.value) {
		return;
	}

	const savedUrl = imageUrl.value;
	const isFirstLoad = !currentEngine.value;

	if (isFirstLoad) {
		isEditorLoading.value = true;
	} else {
		isSwitchingEngine.value = true;
	}

	try {
		// 强制彻底销毁当前编辑器实例
		const prevEditor = imageEditor.value;
		imageEditor.value = null;
		isComparing.value = false;

		if (prevEditor) {
			try {
				prevEditor.disableBrush();
				prevEditor.resetFilters();
				prevEditor.clearImage();
			} finally {
				prevEditor.destroy();
			}
		}

		// 切换引擎时重置所有滤镜参数
		contrast.value = 0;
		temperature.value = 0;
		saturation.value = 0;
		enhance.value = 0;
		blur.value = 0;
		shadow.value = 0;
		highlight.value = 0;

		// 等待一个渲染帧，确保旧实例资源释放完成后再创建新实例
		await new Promise<void>((resolve) => {
			requestAnimationFrame(() => resolve());
		});

		// 清空容器 DOM
		if (containerRef.value) {
			containerRef.value.innerHTML = '';
		}

		currentEngine.value = engine;

		// 等待 DOM 更新后再初始化
		await nextTick();
		await initImageEditor();

		// 重新加载图片（不恢复滤镜状态）
		// initImageEditor 成功后 imageEditor.value 已被赋值，使用非空断言
		if (savedUrl && imageEditor.value) {
			await (imageEditor.value as IImageEditor).loadImage(savedUrl);
		}

		if (!isFirstLoad) {
			toastSuccess(`已切换到 ${engine === 'pixi' ? 'PixiJS (GPU)' : 'Konva (CPU)'} 引擎`);
		}
	} catch (error) {
		console.error("初始化/切换引擎失败:", error);
		toastError("初始化失败，请重试");
		// 重置状态以便重新选择
		if (isFirstLoad) {
			currentEngine.value = null;
		}
	} finally {
		isEditorLoading.value = false;
		isSwitchingEngine.value = false;
	}
};

// 处理图片上传
const handleFileUpload = async (event: Event) => {
	const target = event.target as HTMLInputElement;
	const file = target.files?.[0];
	if (!file) return;

	// 检查是否为图片文件
	if (!file.type.startsWith("image/")) {
		toastError("请上传图片文件");
		return;
	}

	const reader = new FileReader();
	reader.onload = async (e) => {
		const result = e.target?.result as string;
		imageUrl.value = result;

		// 确保编辑器已初始化
		if (!imageEditor.value && containerRef.value) {
			await initImageEditor();
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
			} catch (error) {
				console.error("加载图片失败:", error);
				toastError("加载图片失败，请重试");
			}
		}
	};
	reader.readAsDataURL(file);
};

onMounted(async () => {
	if (typeof window !== "undefined") {
		stageConfig.value = calcCanvasSize({
			viewportWidth: window.innerWidth,
			viewportHeight: window.innerHeight,
		});
	}
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
		<!-- 引擎选择界面（未选择引擎时显示） -->
		<div v-if="!currentEngine && !isEditorLoading" class="mode-selection-overlay">
			<div class="mode-selection-content">
				<h1 class="mode-selection-title">选择渲染引擎</h1>
				<p class="mode-selection-hint">请选择一种图片渲染引擎开始使用</p>
				<div class="mode-selection-buttons">
					<button @click="selectEngine('konva')" class="mode-selection-button konva-mode">
						<div class="mode-icon">🖼️</div>
						<div class="mode-name">Konva (CPU)</div>
						<div class="mode-description">基于 Canvas 2D，兼容性好，适合所有浏览器</div>
					</button>
					<button @click="selectEngine('pixi')" class="mode-selection-button pixi-mode">
						<div class="mode-icon">⚡</div>
						<div class="mode-name">PixiJS (GPU)</div>
						<div class="mode-description">基于 WebGL，GPU 加速渲染，性能更优</div>
					</button>
				</div>
			</div>
		</div>

		<!-- 加载遮罩层 -->
		<div v-else-if="isEditorLoading" class="loading-overlay">
			<div class="loading-content">
				<div class="loading-spinner"></div>
				<h2 class="loading-title">正在初始化编辑器...</h2>
				<p class="loading-hint">请稍候</p>
			</div>
		</div>

		<!-- 主界面（仅在选择引擎后显示） -->
		<template v-else>
			<div class="upload-section">
				<div class="title">图片编辑器</div>
				<div class="upload-area">
					<input type="file" accept="image/*" @change="handleFileUpload" id="file-input" class="file-input" />
					<label for="file-input" class="upload-button">
						选择图片上传
					</label>
					<!-- 引擎切换 -->
					<div class="engine-selector">
						<span class="engine-label">渲染引擎：</span>
						<div class="engine-buttons">
							<button
								class="engine-button"
								:class="{ 'active': currentEngine === 'konva' }"
								:disabled="isSwitchingEngine || isBrushMode"
								@click="selectEngine('konva')"
							>
								Konva
							</button>
							<button
								class="engine-button"
								:class="{ 'active': currentEngine === 'pixi' }"
								:disabled="isSwitchingEngine || isBrushMode"
								@click="selectEngine('pixi')"
							>
								PixiJS
							</button>
						</div>
					</div>
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
								@input="handleContrastChange(contrast)" class="tool-slider" />
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
								@input="handleTemperatureChange(temperature)"
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
								@input="handleSaturationChange(saturation)"
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
								@input="handleBlurChange(blur)" class="tool-slider" />
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
								@input="handleEnhanceChange(enhance)" class="tool-slider" />
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
								@input="handleShadowChange(shadow)" class="tool-slider" />
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
								@input="handleHighlightChange(highlight)" class="tool-slider" />
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
		</template>
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

/* 引擎选择器样式 */
.engine-selector {
	display: flex;
	align-items: center;
	gap: 12px;
	background: rgba(255, 255, 255, 0.1);
	padding: 10px 16px;
	border-radius: 10px;
	backdrop-filter: blur(10px);
}

.engine-label {
	font-size: 14px;
	font-weight: 600;
	color: white;
	opacity: 0.9;
}

.engine-buttons {
	display: flex;
	gap: 6px;
}

.engine-button {
	padding: 8px 16px;
	background: rgba(255, 255, 255, 0.2);
	color: white;
	border: 2px solid rgba(255, 255, 255, 0.3);
	border-radius: 8px;
	cursor: pointer;
	font-size: 14px;
	font-weight: 600;
	transition: all 0.3s ease;
	user-select: none;
}

.engine-button:hover:not(:disabled):not(.active) {
	background: rgba(255, 255, 255, 0.3);
	transform: translateY(-2px);
}

.engine-button.active {
	background: #667eea;
	border-color: #667eea;
	box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
}

.engine-button:disabled {
	opacity: 0.5;
	cursor: not-allowed;
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

/* 模式选择界面样式 */
.mode-selection-overlay {
	position: fixed;
	top: 0;
	left: 0;
	right: 0;
	bottom: 0;
	background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
	display: flex;
	align-items: center;
	justify-content: center;
	z-index: 999;
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
	border: 2px solid rgba(255, 255, 255, 0.3);
	border-radius: 16px;
	cursor: pointer;
	transition: all 0.3s ease;
	color: white;
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

.mode-selection-button.konva-mode:hover {
	border-color: #667eea;
	box-shadow: 0 10px 30px rgba(102, 126, 234, 0.4);
}

.mode-selection-button.pixi-mode:hover {
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

/* 加载遮罩层样式 */
.loading-overlay {
	position: fixed;
	top: 0;
	left: 0;
	right: 0;
	bottom: 0;
	background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
	display: flex;
	align-items: center;
	justify-content: center;
	z-index: 999;
}

.loading-content {
	text-align: center;
	padding: 60px 40px;
	background: rgba(255, 255, 255, 0.1);
	border-radius: 24px;
	backdrop-filter: blur(10px);
	box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
}

.loading-spinner {
	width: 60px;
	height: 60px;
	border: 4px solid rgba(255, 255, 255, 0.3);
	border-top-color: white;
	border-radius: 50%;
	margin: 0 auto 24px;
	animation: spin 1s linear infinite;
}

@keyframes spin {
	to {
		transform: rotate(360deg);
	}
}

.loading-title {
	font-size: 1.5rem;
	font-weight: bold;
	color: white;
	margin-bottom: 16px;
}

.loading-hint {
	font-size: 1rem;
	color: rgba(255, 255, 255, 0.8);
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

	.engine-selector {
		flex-direction: column;
		gap: 8px;
	}
}
</style>

