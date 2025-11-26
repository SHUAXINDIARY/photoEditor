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

// 初始化图片编辑器
const initImageEditor = () => {
	if (!containerRef.value) return;
	
	imageEditor.value = new ImageEditor(containerRef.value, {
		width: stageConfig.value.width,
		height: stageConfig.value.height,
		rotateEnabled: false,
	});
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
				await imageEditor.value.loadImage(result);
			} catch (error) {
				console.error("加载图片失败:", error);
				alert("加载图片失败，请重试");
			}
		}
	};
	reader.readAsDataURL(file);
};

onMounted(() => {
	// 初始化画布大小
	if (typeof window !== "undefined") {
		stageConfig.value = {
			width: window.innerWidth - 40,
			height: window.innerHeight - 200,
		};
	}
	
	// 初始化图片编辑器（容器始终存在，只是隐藏）
	nextTick(() => {
		initImageEditor();
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
			<h1>图片编辑器</h1>
			<div class="upload-area">
				<input
					type="file"
					accept="image/*"
					@change="handleFileUpload"
					id="file-input"
					class="file-input"
				/>
				<label for="file-input" class="upload-button">
					选择图片上传
				</label>
			</div>
		</div>

		<div class="canvas-container" v-show="imageUrl">
			<div ref="containerRef" class="konva-container"></div>
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
	padding: 20px;
	min-height: 100vh;
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
</style>
