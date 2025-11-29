import Konva from "konva";
import { registerCustomFilters } from "./KonvaFilter";
import { ImageFilterManager } from "./ImageFilterManager";

// 注册自定义滤镜（只注册一次）
let filtersRegistered = false;
if (!filtersRegistered) {
	registerCustomFilters();
	filtersRegistered = true;
}

export interface ImageEditorConfig {
	width: number;
	height: number;
	rotateEnabled?: boolean;
}

export class ImageEditor {
	private stage: Konva.Stage | null = null;
	private layer: Konva.Layer | null = null;
	private brushLayer: Konva.Layer | null = null; // 画笔图层
	private transformer: Konva.Transformer | null = null;
	private imageNode: Konva.Image | null = null;
	private container: HTMLElement | null = null;
	private config: ImageEditorConfig;
	public onImageStateChange?: () => void; // 图片状态变化回调
	
	// 画笔相关属性
	private isDrawing: boolean = false;
	private brushLine: Konva.Line | null = null;
	private brushPoints: number[] = [];
	private brushColor: string = '#000000';
	private brushSize: number = 10;
	
	// 原始图片尺寸（用于导出）
	private originalImageWidth: number = 0;
	private originalImageHeight: number = 0;
	private imageScale: number = 1; // 图片在画布上的缩放比例
	private imageOffsetX: number = 0; // 图片在画布上的 X 偏移
	private imageOffsetY: number = 0; // 图片在画布上的 Y 偏移

	// 图片效果管理模块（与基础画布能力解耦）
	private filterManager: ImageFilterManager;

	constructor(container: HTMLElement, config: ImageEditorConfig) {
		this.container = container;
		this.config = config;
		this.filterManager = new ImageFilterManager();
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

		// 创建 Layer（用于图片和变换器）
		this.layer = new Konva.Layer();
		this.stage.add(this.layer as any);

		// 创建画笔 Layer（在图片图层之上）
		this.brushLayer = new Konva.Layer();
		this.stage.add(this.brushLayer as any);

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

					// 保存原始图片尺寸
					this.originalImageWidth = image.width;
					this.originalImageHeight = image.height;

					// 计算图片缩放比例以适应画布
					const scale = Math.min(
						stageWidth / image.width,
						stageHeight / image.height,
						1 // 不放大，只缩小
					);
					this.imageScale = scale;

					// 居中显示
					const x = (stageWidth - image.width * scale) / 2;
					const y = (stageHeight - image.height * scale) / 2;
					this.imageOffsetX = x;
					this.imageOffsetY = y;

					// 创建 Konva 图片节点
					const konvaImage = new Konva.Image({
						image: image,
						x: x,
						y: y,
						scaleX: scale,
						scaleY: scale,
						draggable: true,
					});

					// 启用缓存以提高滤镜性能
					konvaImage.cache();

					// 添加点击事件
					konvaImage.on("click", () => this.handleImageClick());

					// 添加拖拽结束事件，用于保存状态
					konvaImage.on("dragend", () => {
						this.onImageStateChange?.();
					});

					// 添加变换结束事件，用于保存状态
					konvaImage.on("transformend", () => {
						// 更新图片位置和缩放信息
						this.imageOffsetX = konvaImage.x();
						this.imageOffsetY = konvaImage.y();
						this.imageScale = konvaImage.scaleX();
						this.onImageStateChange?.();
					});
					
					// 添加拖拽事件，更新位置信息
					konvaImage.on("dragmove", () => {
						this.imageOffsetX = konvaImage.x();
						this.imageOffsetY = konvaImage.y();
					});

					// 添加到图层
					this.layer!.add(konvaImage as any);

					// 保存引用
					this.imageNode = konvaImage;

					// 告知滤镜模块当前图片与图层
					this.filterManager.setImageContext(this.imageNode, this.layer!);

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
	 * 获取图片状态（位置、缩放等）
	 */
	public getImageState(): {
		x: number;
		y: number;
		scaleX: number;
		scaleY: number;
	} | null {
		if (!this.imageNode) return null;
		return {
			x: this.imageNode.x(),
			y: this.imageNode.y(),
			scaleX: this.imageNode.scaleX(),
			scaleY: this.imageNode.scaleY(),
		};
	}

	/**
	 * 设置图片状态（位置、缩放等）
	 */
	public setImageState(state: {
		x: number;
		y: number;
		scaleX: number;
		scaleY: number;
	}): void {
		if (!this.imageNode) return;
		this.imageNode.x(state.x);
		this.imageNode.y(state.y);
		this.imageNode.scaleX(state.scaleX);
		this.imageNode.scaleY(state.scaleY);
		// 更新位置和缩放信息
		this.imageOffsetX = state.x;
		this.imageOffsetY = state.y;
		this.imageScale = state.scaleX;
		this.layer?.draw();
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
	 * 设置对比度
	 * @param contrast 对比度值，范围 -100 到 100，0 为原始值
	 */
	public setContrast(contrast: number): void {
		this.filterManager.setContrast(contrast);
	}

	/**
	 * 设置色温
	 * @param temperature 色温值，范围 -100 到 100，0 为原始值
	 *                    -100 为冷色调（蓝色），100 为暖色调（橙红色）
	 */
	public setTemperature(temperature: number): void {
		this.filterManager.setTemperature(temperature);
	}

	/**
	 * 设置增强
	 * @param enhance 增强值，范围 0 到 100（内部映射到 0~2）
	 */
	public setEnhance(enhance: number): void {
		this.filterManager.setEnhance(enhance);
	}

	/**
	 * 设置饱和度
	 * @param saturation 饱和度值，范围 -100 到 100，0 为原始值
	 */
	public setSaturation(saturation: number): void {
		this.filterManager.setSaturation(saturation);
	}

	/**
	 * 设置模糊
	 * @param blur 模糊值，范围 0 到 100，0 为原始值
	 */
	public setBlur(blur: number): void {
		this.filterManager.setBlur(blur);
	}

	/**
	 * 重置所有滤镜效果
	 */
	public resetFilters(): void {
		this.filterManager.reset();
	}

	/**
	 * 清除图片
	 */
	public clearImage(): void {
		if (this.imageNode) {
			this.imageNode.destroy();
			this.imageNode = null;
		}
		// 同步清空滤镜上下文
		this.filterManager.setImageContext(null, this.layer);
		if (this.transformer) {
			this.transformer.nodes([]);
		}
		this.layer?.draw();
		// 清除画笔痕迹
		this.clearBrush();
	}

	/**
	 * 开启画笔模式
	 */
	public enableBrush(color: string = '#000000', size: number = 10): void {
		if (!this.stage || !this.brushLayer) return;
		
		this.brushColor = color;
		this.brushSize = size;
		this.isDrawing = false;
		
		// 设置鼠标样式为画笔
		if (this.stage.content) {
			(this.stage.content as HTMLElement).style.cursor = 'crosshair';
		}
		
		// 禁用图片拖拽，避免干扰画笔绘制
		if (this.imageNode) {
			this.imageNode.draggable(false);
		}
		
		// 隐藏变换器
		if (this.transformer) {
			this.transformer.nodes([]);
			this.layer?.draw();
		}
		
		// 绑定画笔事件
		this.stage.on('mousedown touchstart', this.handleBrushStart);
		this.stage.on('mousemove touchmove', this.handleBrushMove);
		this.stage.on('mouseup touchend mouseleave', this.handleBrushEnd);
	}

	/**
	 * 关闭画笔模式
	 */
	public disableBrush(): void {
		if (!this.stage) return;
		
		// 恢复鼠标样式
		if (this.stage.content) {
			(this.stage.content as HTMLElement).style.cursor = 'default';
		}
		
		// 恢复图片拖拽
		if (this.imageNode) {
			this.imageNode.draggable(true);
		}
		
		// 取消绑定画笔事件
		this.stage.off('mousedown touchstart', this.handleBrushStart);
		this.stage.off('mousemove touchmove', this.handleBrushMove);
		this.stage.off('mouseup touchend mouseleave', this.handleBrushEnd);
		
		// 结束当前绘制
		if (this.isDrawing) {
			this.handleBrushEnd();
		}
	}

	/**
	 * 设置画笔粗细
	 */
	public setBrushSize(size: number): void {
		this.brushSize = Math.max(1, Math.min(50, size));
		// 如果正在绘制，更新当前线条的粗细
		if (this.brushLine) {
			this.brushLine.strokeWidth(this.brushSize);
			this.brushLayer?.draw();
		}
	}

	/**
	 * 清除所有画笔痕迹
	 */
	public clearBrush(): void {
		if (this.brushLayer) {
			this.brushLayer.destroyChildren();
			this.brushLayer.draw();
		}
		this.brushPoints = [];
		this.brushLine = null;
	}

	/**
	 * 画笔开始绘制
	 */
	private handleBrushStart = (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>): void => {
		if (!this.brushLayer) return;
		
		e.evt.preventDefault();
		this.isDrawing = true;
		
		// 获取鼠标位置（相对于 stage）
		const pos = this.stage!.getPointerPosition();
		if (!pos) return;
		
		// 开始新的线条
		this.brushPoints = [pos.x, pos.y];
		
		this.brushLine = new Konva.Line({
			points: this.brushPoints,
			stroke: this.brushColor,
			strokeWidth: this.brushSize,
			lineCap: 'round',
			lineJoin: 'round',
			globalCompositeOperation: 'source-over',
		});
		
		this.brushLayer.add(this.brushLine);
	}

	/**
	 * 画笔移动绘制
	 */
	private handleBrushMove = (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>): void => {
		if (!this.isDrawing || !this.brushLine || !this.brushLayer) return;
		
		e.evt.preventDefault();
		
		// 获取鼠标位置
		const pos = this.stage!.getPointerPosition();
		if (!pos) return;
		
		// 添加新的点
		this.brushPoints.push(pos.x, pos.y);
		
		// 更新线条
		this.brushLine.points(this.brushPoints);
		this.brushLayer.batchDraw();
	}

	/**
	 * 画笔结束绘制
	 */
	private handleBrushEnd = (): void => {
		this.isDrawing = false;
		this.brushLine = null;
	}

	/**
	 * 导出画笔图层为图片
	 * 返回黑色背景、白色画笔的图片，尺寸与原始图片一致
	 */
	public exportBrushLayer(): Promise<string> {
		return new Promise((resolve, reject) => {
			if (!this.brushLayer || !this.originalImageWidth || !this.originalImageHeight) {
				reject(new Error("画笔图层或图片未加载"));
				return;
			}

			// 检查是否有画笔痕迹
			const brushChildren = this.brushLayer.getChildren();
			if (brushChildren.length === 0) {
				reject(new Error("没有画笔痕迹可导出"));
				return;
			}

			try {
				// 创建临时 canvas，尺寸为原始图片尺寸，黑色背景
				const tempCanvas = document.createElement('canvas');
				tempCanvas.width = this.originalImageWidth;
				tempCanvas.height = this.originalImageHeight;
				const ctx = tempCanvas.getContext('2d');
				if (!ctx) {
					reject(new Error("无法创建 canvas 上下文"));
					return;
				}

				// 填充黑色背景
				ctx.fillStyle = '#000000';
				ctx.fillRect(0, 0, this.originalImageWidth, this.originalImageHeight);

				// 设置画笔样式为白色
				ctx.strokeStyle = '#ffffff';
				ctx.lineCap = 'round';
				ctx.lineJoin = 'round';

				// 遍历画笔图层中的所有线条
				brushChildren.forEach((child) => {
					if (child instanceof Konva.Line) {
						const originalPoints = child.points();
						
						if (originalPoints.length < 4) return; // 至少需要两个点

						// 设置画笔粗细（转换为原始图片尺寸）
						const brushWidth = child.strokeWidth() / this.imageScale;
						ctx.lineWidth = brushWidth;

						// 开始路径
						ctx.beginPath();

						// 转换每个点的坐标并绘制
						for (let i = 0; i < originalPoints.length; i += 2) {
							// 将 stage 坐标转换为图片坐标
							const stageX = originalPoints[i];
							const stageY = originalPoints[i + 1];
							
							// 减去图片在 stage 上的偏移
							const relativeX = stageX - this.imageOffsetX;
							const relativeY = stageY - this.imageOffsetY;
							
							// 转换为原始图片坐标
							const imageX = relativeX / this.imageScale;
							const imageY = relativeY / this.imageScale;
							
							if (i === 0) {
								ctx.moveTo(imageX, imageY);
							} else {
								ctx.lineTo(imageX, imageY);
							}
						}

						// 绘制路径
						ctx.stroke();
					}
				});

				// 导出为图片
				const dataURL = tempCanvas.toDataURL('image/png');

				resolve(dataURL);
			} catch (error) {
				reject(error);
			}
		});
	}

	/**
	 * 销毁编辑器，清理所有资源
	 */
	public destroy(): void {
		// 先关闭画笔模式
		this.disableBrush();
		
		if (this.imageNode) {
			this.imageNode.destroy();
			this.imageNode = null;
		}
		if (this.transformer) {
			this.transformer.destroy();
			this.transformer = null;
		}
		if (this.brushLayer) {
			this.brushLayer.destroy();
			this.brushLayer = null;
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

