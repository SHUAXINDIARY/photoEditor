import Konva from "konva";

export interface ImageEditorConfig {
	width: number;
	height: number;
	rotateEnabled?: boolean;
}

export class ImageEditor {
	private stage: Konva.Stage | null = null;
	private layer: Konva.Layer | null = null;
	private transformer: Konva.Transformer | null = null;
	private imageNode: Konva.Image | null = null;
	private container: HTMLElement | null = null;
	private config: ImageEditorConfig;

	constructor(container: HTMLElement, config: ImageEditorConfig) {
		this.container = container;
		this.config = config;
		this.initStage();
	}

	/**
	 * 初始化 Konva Stage
	 */
	private initStage(): void {
		if (!this.container) {
			throw new Error("Container element is required");
		}

		// 如果已存在，先销毁
		if (this.stage) {
			this.destroy();
		}

		// 创建新的 Stage
		this.stage = new Konva.Stage({
			container: this.container as HTMLDivElement,
			width: this.config.width,
			height: this.config.height,
		});

		// 创建 Layer
		this.layer = new Konva.Layer();
		this.stage.add(this.layer as any);

		// 创建 Transformer
		this.transformer = new Konva.Transformer({
			rotateEnabled: this.config.rotateEnabled ?? false,
		});
		this.layer.add(this.transformer as any);

		// 添加点击事件监听
		this.stage.on("click", (e) => this.handleStageClick(e));
	}

	/**
	 * 加载图片
	 */
	public loadImage(url: string): Promise<void> {
		return new Promise((resolve, reject) => {
			if (!this.stage || !this.layer || !this.transformer) {
				reject(new Error("Stage not initialized"));
				return;
			}

			// 如果已有图片节点，先移除
			if (this.imageNode) {
				this.imageNode.destroy();
				this.imageNode = null;
			}

			const image = new Image();
			image.onload = () => {
				try {
					const stageWidth = this.stage!.width();
					const stageHeight = this.stage!.height();

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
					konvaImage.on("click", () => this.handleImageClick());

					// 添加到图层
					this.layer!.add(konvaImage as any);

					// 保存引用
					this.imageNode = konvaImage;

					// 附加变换器
					this.transformer!.nodes([konvaImage]);

					// 重绘画布
					this.layer!.draw();

					resolve();
				} catch (error) {
					reject(error);
				}
			};

			image.onerror = () => {
				reject(new Error("Failed to load image"));
			};

			image.src = url;
		});
	}

	/**
	 * 处理图片点击事件
	 */
	private handleImageClick(): void {
		if (this.transformer && this.imageNode) {
			this.transformer.nodes([this.imageNode]);
			this.layer?.draw();
		}
	}

	/**
	 * 处理画布点击事件（点击空白处取消选中）
	 */
	private handleStageClick(e: Konva.KonvaEventObject<MouseEvent>): void {
		const clickedOnEmpty = e.target === e.target.getStage();
		if (clickedOnEmpty && this.transformer) {
			this.transformer.nodes([]);
			this.layer?.draw();
		}
	}

	/**
	 * 更新画布大小
	 */
	public updateSize(width: number, height: number): void {
		if (this.stage) {
			this.stage.width(width);
			this.stage.height(height);
			this.config.width = width;
			this.config.height = height;
			this.layer?.draw();
		}
	}

	/**
	 * 获取当前图片节点
	 */
	public getImageNode(): Konva.Image | null {
		return this.imageNode;
	}

	/**
	 * 获取 Stage 实例
	 */
	public getStage(): Konva.Stage | null {
		return this.stage;
	}

	/**
	 * 获取 Layer 实例
	 */
	public getLayer(): Konva.Layer | null {
		return this.layer;
	}

	/**
	 * 导出图片为 Data URL
	 */
	public exportImage(mimeType?: string, quality?: number): string | null {
		if (!this.stage) {
			return null;
		}
		return this.stage.toDataURL({ mimeType, quality });
	}

	/**
	 * 清除图片
	 */
	public clearImage(): void {
		if (this.imageNode) {
			this.imageNode.destroy();
			this.imageNode = null;
		}
		if (this.transformer) {
			this.transformer.nodes([]);
		}
		this.layer?.draw();
	}

	/**
	 * 销毁编辑器，清理所有资源
	 */
	public destroy(): void {
		if (this.imageNode) {
			this.imageNode.destroy();
			this.imageNode = null;
		}
		if (this.transformer) {
			this.transformer.destroy();
			this.transformer = null;
		}
		if (this.layer) {
			this.layer.destroy();
			this.layer = null;
		}
		if (this.stage) {
			this.stage.destroy();
			this.stage = null;
		}
		this.container = null;
	}
}

