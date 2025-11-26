<script setup lang="ts">
import { ref, onMounted, nextTick, onBeforeUnmount } from "vue";
import Konva from "konva";

const containerRef = ref<HTMLDivElement | null>(null);
const imageUrl = ref<string>("");
const stage = ref<Konva.Stage | null>(null);
const layer = ref<Konva.Layer | null>(null);
const transformer = ref<Konva.Transformer | null>(null);
const imageNode = ref<any>(null);
const stageConfig = ref({
	width: 800,
	height: 600,
});

// 初始化 Konva Stage
const initStage = () => {
	if (!containerRef.value) return;
	
	// 如果已存在，先销毁
	if (stage.value) {
		stage.value.destroy();
	}
	
	// 创建新的 Stage
	stage.value = new Konva.Stage({
		container: containerRef.value,
		width: stageConfig.value.width,
		height: stageConfig.value.height,
	});
	
	// 创建 Layer
	layer.value = new Konva.Layer();
	stage.value.add(layer.value as any);
	
	// 创建 Transformer
	transformer.value = new Konva.Transformer({
		rotateEnabled: false,
	});
	layer.value.add(transformer.value as any);
	
	// 添加点击事件监听
	stage.value.on("click", handleStageClick);
};

// 处理图片上传
const handleFileUpload = (event: Event) => {
	const target = event.target as HTMLInputElement;
	const file = target.files?.[0];
	if (!file) return;

	// 检查是否为图片文件
	if (!file.type.startsWith("image/")) {
		alert("请上传图片文件");
		return;
	}

	const reader = new FileReader();
	reader.onload = (e) => {
		const result = e.target?.result as string;
		imageUrl.value = result;
		
		// 创建图片对象并加载到 Konva
		nextTick(() => {
			loadImageToKonva(result);
		});
	};
	reader.readAsDataURL(file);
};

// 将图片加载到 Konva
const loadImageToKonva = (url: string) => {
	if (!stage.value || !layer.value || !transformer.value) {
		// 如果 stage 未初始化，先初始化
		if (!stage.value) {
			initStage();
		}
		if (!stage.value || !layer.value || !transformer.value) return;
	}
	
	// 如果已有图片节点，先移除
	if (imageNode.value) {
		imageNode.value.destroy();
		imageNode.value = null;
	}
	
	const image = new Image();
	image.onload = () => {
		const stageWidth = stage.value!.width();
		const stageHeight = stage.value!.height();
		
		// 计算图片缩放比例以适应画布
		const scale = Math.min(
			stageWidth / image.width,
			stageHeight / image.height,
			1 // 不放大，只缩小
		);
		
		// 居中显示
		const x = (stageWidth - image.width * scale) / 2;
		const y = (stageHeight - image.height * scale) / 2;
		
		// 创建 Konva 图片节点
		const konvaImage = new Konva.Image({
			image: image,
			x: x,
			y: y,
			scaleX: scale,
			scaleY: scale,
			draggable: true,
		});
		
		// 添加点击事件
		konvaImage.on("click", handleImageClick);
		
		// 添加到图层
		layer.value!.add(konvaImage as any);
		
		// 保存引用
		imageNode.value = konvaImage;
		
		// 附加变换器
		transformer.value!.nodes([konvaImage]);
		
		// 重绘画布
		layer.value!.draw();
	};
	image.src = url;
};

// 图片节点点击事件
const handleImageClick = () => {
	if (transformer.value && imageNode.value) {
		transformer.value.nodes([imageNode.value]);
		layer.value?.draw();
	}
};

// 画布点击事件（点击空白处取消选中）
const handleStageClick = (e: Konva.KonvaEventObject<MouseEvent>) => {
	const clickedOnEmpty = e.target === e.target.getStage();
	if (clickedOnEmpty && transformer.value) {
		transformer.value.nodes([]);
		layer.value?.draw();
	}
};

onMounted(() => {
	// 初始化画布大小
	if (typeof window !== "undefined") {
		stageConfig.value = {
			width: window.innerWidth - 40,
			height: window.innerHeight - 200,
		};
	}
	
	// 初始化 Stage
	nextTick(() => {
		initStage();
	});
});

onBeforeUnmount(() => {
	// 清理资源
	if (stage.value) {
		stage.value.destroy();
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

		<div class="canvas-container" v-if="imageUrl">
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
