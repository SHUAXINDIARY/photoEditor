<script setup lang="ts">
import { computed } from "vue";
import type { VideoFilterOptions } from "@photoedit/video-editor";
import { DEFAULT_FILTER_VALUES } from "@photoedit/video-editor";

// 组件参数
interface Props {
	speed: number;
	contrast: number;
	saturation: number;
	temperature: number;
	shadows: number;
	highlights: number;
	isProcessing: boolean;
	isFFmpegLoaded: boolean;
	hasVideoFile: boolean;
	processingProgress: number;
}

const props = defineProps<Props>();

// 事件
const emit = defineEmits<{
	(e: "update:speed", value: number): void;
	(e: "update:contrast", value: number): void;
	(e: "update:saturation", value: number): void;
	(e: "update:temperature", value: number): void;
	(e: "update:shadows", value: number): void;
	(e: "update:highlights", value: number): void;
	(e: "reset"): void;
	(e: "export"): void;
}>();

// 计算属性：是否可以重置
const canReset = computed(() => {
	return !props.isProcessing && (
		props.speed !== DEFAULT_FILTER_VALUES.speed ||
		props.contrast !== DEFAULT_FILTER_VALUES.contrast ||
		props.saturation !== DEFAULT_FILTER_VALUES.saturation ||
		props.temperature !== DEFAULT_FILTER_VALUES.temperature ||
		props.shadows !== DEFAULT_FILTER_VALUES.shadows ||
		props.highlights !== DEFAULT_FILTER_VALUES.highlights
	);
});

// 计算属性：是否可以导出
const canExport = computed(() => {
	return !props.isProcessing && props.isFFmpegLoaded && props.hasVideoFile;
});

// 通用处理函数
const handleChange = (key: keyof VideoFilterOptions, event: Event) => {
	const target = event.target as HTMLInputElement;
	emit(`update:${key}` as keyof typeof emit, Number(target.value));
};

// 重置效果
const handleReset = () => {
	emit("reset");
};

// 导出视频
const handleExport = () => {
	emit("export");
};
</script>

<template>
	<div class="effects-control-panel">
		<h3 class="panel-title">效果调整</h3>
		<p class="panel-hint">拖动滑块实时预览效果</p>

		<!-- 倍速控制 -->
		<div class="effect-control-item">
			<label class="effect-label">
				<span>🚀 倍速</span>
				<span class="effect-value">{{ speed.toFixed(2) }}x</span>
			</label>
			<div class="effect-controls">
				<input type="range" min="0.25" max="4" step="0.25" :value="speed"
					@input="handleChange('speed', $event)" class="effect-slider" :disabled="isProcessing" />
			</div>
		</div>

		<!-- 对比度控制 -->
		<div class="effect-control-item">
			<label class="effect-label">
				<span>🎨 对比度</span>
				<span class="effect-value">{{ contrast.toFixed(2) }}</span>
			</label>
			<div class="effect-controls">
				<input type="range" min="0.5" max="2.0" step="0.05" :value="contrast"
					@input="handleChange('contrast', $event)" class="effect-slider" :disabled="isProcessing" />
			</div>
		</div>

		<!-- 饱和度控制 -->
		<div class="effect-control-item">
			<label class="effect-label">
				<span>💧 饱和度</span>
				<span class="effect-value">{{ saturation.toFixed(2) }}</span>
			</label>
			<div class="effect-controls">
				<input type="range" min="0" max="3" step="0.1" :value="saturation"
					@input="handleChange('saturation', $event)" class="effect-slider" :disabled="isProcessing" />
			</div>
		</div>

		<!-- 色温控制 -->
		<div class="effect-control-item">
			<label class="effect-label">
				<span>🌡️ 色温</span>
				<span class="effect-value">{{ temperature >= 0 ? '+' : '' }}{{ temperature.toFixed(2) }}</span>
			</label>
			<div class="effect-controls">
				<input type="range" min="-1" max="1" step="0.05" :value="temperature"
					@input="handleChange('temperature', $event)" class="effect-slider" :disabled="isProcessing" />
			</div>
		</div>

		<!-- 阴影控制 -->
		<div class="effect-control-item">
			<label class="effect-label">
				<span>🌑 阴影</span>
				<span class="effect-value">{{ shadows.toFixed(2) }}</span>
			</label>
			<div class="effect-controls">
				<input type="range" min="0" max="2" step="0.05" :value="shadows"
					@input="handleChange('shadows', $event)" class="effect-slider" :disabled="isProcessing" />
			</div>
		</div>

		<!-- 高光控制 -->
		<div class="effect-control-item">
			<label class="effect-label">
				<span>☀️ 高光</span>
				<span class="effect-value">{{ highlights.toFixed(2) }}</span>
			</label>
			<div class="effect-controls">
				<input type="range" min="0" max="2" step="0.05" :value="highlights"
					@input="handleChange('highlights', $event)" class="effect-slider" :disabled="isProcessing" />
			</div>
		</div>

		<!-- 操作按钮 -->
		<div class="effect-actions">
			<button @click="handleReset" class="reset-button" :disabled="!canReset">
				🔄 重置
			</button>
			<button @click="handleExport" class="export-button" :disabled="!canExport">
				{{ isProcessing ? "导出中..." : "📥 导出视频" }}
			</button>
		</div>

		<!-- 处理进度 -->
		<div v-if="isProcessing" class="progress-container">
			<div class="progress-bar">
				<div class="progress-fill" :style="{ width: `${processingProgress}%` }"></div>
			</div>
			<p class="progress-text">正在导出... {{ processingProgress.toFixed(1) }}%</p>
		</div>
	</div>
</template>

<style scoped>
/* 效果控制面板样式 */
.effects-control-panel {
	background: rgba(255, 255, 255, 0.1);
	border-radius: 12px;
	padding: 20px;
	backdrop-filter: blur(10px);
	max-height: calc(100vh - 200px);
	overflow-y: auto;
}

.panel-title {
	font-size: 18px;
	font-weight: 700;
	margin-bottom: 4px;
	color: white;
}

.panel-hint {
	font-size: 13px;
	opacity: 0.7;
	margin-bottom: 20px;
}

.effect-control-item {
	margin-bottom: 18px;
}

.effect-label {
	display: flex;
	justify-content: space-between;
	align-items: center;
	margin-bottom: 8px;
	font-size: 14px;
	font-weight: 600;
}

.effect-value {
	color: #ffd700;
	font-size: 14px;
	font-weight: bold;
}

.effect-controls {
	display: flex;
	flex-direction: column;
	gap: 12px;
}

.effect-slider {
	width: 100%;
	height: 6px;
	border-radius: 3px;
	background: rgba(255, 255, 255, 0.2);
	outline: none;
	-webkit-appearance: none;
	appearance: none;
	cursor: pointer;
	transition: background 0.3s ease;
}

.effect-slider:hover:not(:disabled) {
	background: rgba(255, 255, 255, 0.3);
}

.effect-slider:disabled {
	opacity: 0.5;
	cursor: not-allowed;
}

.effect-slider::-webkit-slider-thumb {
	-webkit-appearance: none;
	appearance: none;
	width: 16px;
	height: 16px;
	border-radius: 50%;
	background: #667eea;
	cursor: pointer;
	box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
	transition: all 0.2s ease;
}

.effect-slider::-webkit-slider-thumb:hover:not(:disabled) {
	background: #5568d3;
	transform: scale(1.1);
}

.effect-slider::-moz-range-thumb {
	width: 16px;
	height: 16px;
	border-radius: 50%;
	background: #667eea;
	cursor: pointer;
	border: none;
	box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
	transition: all 0.2s ease;
}

.effect-slider::-moz-range-thumb:hover:not(:disabled) {
	background: #5568d3;
	transform: scale(1.1);
}

.effect-actions {
	display: flex;
	gap: 12px;
	margin-top: 20px;
}

.reset-button,
.export-button {
	flex: 1;
	padding: 12px 16px;
	border: none;
	border-radius: 8px;
	cursor: pointer;
	font-size: 15px;
	font-weight: 600;
	transition: all 0.3s ease;
	box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}

.reset-button {
	background: rgba(255, 255, 255, 0.2);
	color: white;
	border: 1px solid rgba(255, 255, 255, 0.3);
}

.reset-button:hover:not(:disabled) {
	background: rgba(255, 255, 255, 0.3);
	transform: translateY(-2px);
}

.reset-button:disabled {
	opacity: 0.5;
	cursor: not-allowed;
}

.export-button {
	background: linear-gradient(135deg, #4caf50, #45a049);
	color: white;
}

.export-button:hover:not(:disabled) {
	background: linear-gradient(135deg, #45a049, #3d8b40);
	transform: translateY(-2px);
	box-shadow: 0 6px 12px rgba(76, 175, 80, 0.3);
}

.export-button:disabled {
	background: rgba(255, 255, 255, 0.2);
	color: rgba(255, 255, 255, 0.5);
	cursor: not-allowed;
	opacity: 0.6;
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
