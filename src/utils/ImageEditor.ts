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
	private brushLayer: Konva.Layer | null = null; // 画笔图层（在 group 内部）
	private imageGroup: Konva.Group | null = null; // 将图片和画笔捆绑在一起
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

		// 创建主 Layer
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

			// 如果已有图片组，先移除
			if (this.imageGroup) {
				this.imageGroup.destroy();
				this.imageGroup = null;
				this.imageNode = null;
				this.brushLayer = null;
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

					// 创建 Group 来包含图片和画笔
					this.imageGroup = new Konva.Group({
						x: x,
						y: y,
						draggable: true,
					});

					// 创建 Konva 图片节点（相对于 Group 的位置为 0,0）
					const konvaImage = new Konva.Image({
						image: image,
						x: 0,
						y: 0,
						scaleX: scale,
						scaleY: scale,
						draggable: false, // 图片本身不可拖拽，由 Group 控制
					});

					// 启用缓存以提高滤镜性能
					konvaImage.cache();

					// 创建画笔层（Layer -> Group 改为直接在 Group 内）
					// 注意：这里不再创建 Layer，而是直接用 Group 管理
					this.brushLayer = new Konva.Layer(); // 保持引用方式，但实际画笔线条会添加到 imageGroup
					
					// 将图片添加到 Group
					this.imageGroup.add(konvaImage as any);

					// 添加 Group 点击事件
					this.imageGroup.on("click", () => this.handleImageClick());

					// 添加拖拽结束事件，用于保存状态
					this.imageGroup.on("dragend", () => {
						// 更新图片位置信息
						this.imageOffsetX = this.imageGroup!.x();
						this.imageOffsetY = this.imageGroup!.y();
						this.onImageStateChange?.();
					});

					// 添加变换结束事件，用于保存状态
					this.imageGroup.on("transformend", () => {
						// 更新图片位置和缩放信息
						this.imageOffsetX = this.imageGroup!.x();
						this.imageOffsetY = this.imageGroup!.y();
						this.imageScale = this.imageGroup!.scaleX() * scale; // 组的缩放 * 图片初始缩放
						this.onImageStateChange?.();
					});
					
					// 添加拖拽事件，更新位置信息
					this.imageGroup.on("dragmove", () => {
						this.imageOffsetX = this.imageGroup!.x();
						this.imageOffsetY = this.imageGroup!.y();
					});

					// 将 Group 添加到图层
					this.layer!.add(this.imageGroup as any);

					// 保存图片节点引用
					this.imageNode = konvaImage;

					// 告知滤镜模块当前图片与图层
					this.filterManager.setImageContext(this.imageNode, this.layer!);

					// 附加变换器到 Group
					this.transformer!.nodes([this.imageGroup as any]);

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
		if (this.transformer && this.imageGroup) {
			this.transformer.nodes([this.imageGroup as any]);
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
		if (!this.imageGroup) return null;
		return {
			x: this.imageGroup.x(),
			y: this.imageGroup.y(),
			scaleX: this.imageGroup.scaleX(),
			scaleY: this.imageGroup.scaleY(),
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
		if (!this.imageGroup) return;
		this.imageGroup.x(state.x);
		this.imageGroup.y(state.y);
		this.imageGroup.scaleX(state.scaleX);
		this.imageGroup.scaleY(state.scaleY);
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
		if (this.imageGroup) {
			this.imageGroup.destroy();
			this.imageGroup = null;
			this.imageNode = null;
			this.brushLayer = null;
		}
		// 同步清空滤镜上下文
		this.filterManager.setImageContext(null, this.layer);
		if (this.transformer) {
			this.transformer.nodes([]);
		}
		this.layer?.draw();
	}

	/**
	 * 开启画笔模式
	 */
	public enableBrush(color: string = '#000000', size: number = 10): void {
		if (!this.stage || !this.imageGroup) return;
		
		this.brushColor = color;
		this.brushSize = size;
		this.isDrawing = false;
		
		// 设置鼠标样式为画笔
		if (this.stage.content) {
			(this.stage.content as HTMLElement).style.cursor = 'crosshair';
		}
		
		// 禁用 Group 拖拽，避免干扰画笔绘制
		if (this.imageGroup) {
			this.imageGroup.draggable(false);
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
		
		// 恢复 Group 拖拽
		if (this.imageGroup) {
			this.imageGroup.draggable(true);
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
			this.layer?.draw();
		}
	}

	/**
	 * 清除所有画笔痕迹
	 */
	public clearBrush(): void {
		if (this.imageGroup) {
			// 移除 Group 中除了图片之外的所有子元素（即画笔线条）
			const children = this.imageGroup.getChildren();
			// 第一个子元素是图片，保留它
			for (let i = children.length - 1; i > 0; i--) {
				children[i].destroy();
			}
			this.layer?.draw();
		}
		this.brushPoints = [];
		this.brushLine = null;
	}

	/**
	 * 画笔开始绘制
	 */
	private handleBrushStart = (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>): void => {
		if (!this.imageGroup) return;
		
		e.evt.preventDefault();
		this.isDrawing = true;
		
		// 获取鼠标位置（相对于 stage）
		const pos = this.stage!.getPointerPosition();
		if (!pos) return;
		
		// 转换为相对于 Group 的坐标
		const groupPos = this.imageGroup.getRelativePointerPosition();
		if (!groupPos) return;
		
		// 开始新的线条（坐标相对于 Group）
		this.brushPoints = [groupPos.x, groupPos.y];
		
		this.brushLine = new Konva.Line({
			points: this.brushPoints,
			stroke: this.brushColor,
			strokeWidth: this.brushSize,
			lineCap: 'round',
			lineJoin: 'round',
			globalCompositeOperation: 'source-over',
		});
		
		// 将画笔线条添加到 Group 中
		this.imageGroup.add(this.brushLine as any);
	}

	/**
	 * 画笔移动绘制
	 */
	private handleBrushMove = (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>): void => {
		if (!this.isDrawing || !this.brushLine || !this.imageGroup) return;
		
		e.evt.preventDefault();
		
		// 获取相对于 Group 的鼠标位置
		const groupPos = this.imageGroup.getRelativePointerPosition();
		if (!groupPos) return;
		
		// 添加新的点（相对于 Group）
		this.brushPoints.push(groupPos.x, groupPos.y);
		
		// 更新线条
		this.brushLine.points(this.brushPoints);
		this.layer?.batchDraw();
	}

	/**
	 * 画笔结束绘制
	 */
	private handleBrushEnd = (): void => {
		this.isDrawing = false;
		this.brushLine = null;
	}

	/**
	 * 导出编辑后的完整图片（包含滤镜效果和画笔图层）
	 * 返回合并后的图片，尺寸与原始图片一致
	 */
	public exportEditedImage(mimeType: string = 'image/png', quality?: number): Promise<string> {
		return new Promise((resolve, reject) => {
			if (!this.imageNode || !this.originalImageWidth || !this.originalImageHeight) {
				reject(new Error("图片未加载"));
				return;
			}

			try {
				// 创建临时 canvas，尺寸为原始图片尺寸
				const tempCanvas = document.createElement('canvas');
				tempCanvas.width = this.originalImageWidth;
				tempCanvas.height = this.originalImageHeight;
				const ctx = tempCanvas.getContext('2d');
				if (!ctx) {
					reject(new Error("无法创建 canvas 上下文"));
					return;
				}

				// 获取应用了滤镜的图片
				// 使用 Konva 的 toDataURL 方法获取当前图片节点的数据
				// 需要创建一个临时的 stage 来导出
				const tempStage = new Konva.Stage({
					container: document.createElement('div'),
					width: this.originalImageWidth,
					height: this.originalImageHeight,
				});

				const tempLayer = new Konva.Layer();
				tempStage.add(tempLayer);

				// 创建新的图片节点，使用原始尺寸
				const originalImage = (this.imageNode as any).image();
				if (!originalImage) {
					reject(new Error("无法获取原始图片"));
					return;
				}

				// 复制当前图片节点，但使用原始尺寸
				const tempImageNode = new Konva.Image({
					image: originalImage,
					x: 0,
					y: 0,
					width: this.originalImageWidth,
					height: this.originalImageHeight,
				});

				// 复制所有滤镜和参数
				const filters = this.imageNode.filters();
				tempImageNode.filters(filters);
				
				// 复制滤镜参数
				const imageNodeAny = this.imageNode as any;
				if (typeof imageNodeAny.contrast === 'function') {
					(tempImageNode as any).contrast(imageNodeAny.contrast());
				} else if (imageNodeAny.contrast !== undefined) {
					(tempImageNode as any).contrast = imageNodeAny.contrast;
				}
				if (typeof imageNodeAny.temperature === 'function') {
					(tempImageNode as any).temperature(imageNodeAny.temperature());
				} else if (imageNodeAny.temperature !== undefined) {
					(tempImageNode as any).temperature = imageNodeAny.temperature;
				}
				if (typeof this.imageNode.enhance === 'function') {
					tempImageNode.enhance(this.imageNode.enhance());
				}
				if (typeof this.imageNode.saturation === 'function') {
					tempImageNode.saturation(this.imageNode.saturation());
				}
				if (typeof this.imageNode.blurRadius === 'function') {
					tempImageNode.blurRadius(this.imageNode.blurRadius());
				}

				// 缓存并添加到图层
				tempImageNode.cache();
				tempLayer.add(tempImageNode);
				tempLayer.draw();

				// 获取应用了滤镜的图片数据
				const imageDataURL = tempStage.toDataURL({ 
					pixelRatio: 1,
					mimeType: mimeType,
					quality: quality 
				});

				// 加载图片到 canvas
				const img = new Image();
				img.onload = () => {
					// 绘制应用了滤镜的图片
					ctx.drawImage(img, 0, 0, this.originalImageWidth, this.originalImageHeight);

					// 如果有画笔痕迹，叠加绘制画笔
					if (this.imageGroup) {
						const groupChildren = this.imageGroup.getChildren();
						// 第一个元素是图片，从第二个开始是画笔线条
						if (groupChildren.length > 1) {
							ctx.save();

							for (let i = 1; i < groupChildren.length; i++) {
								const child = groupChildren[i];
								if (child instanceof Konva.Line) {
									const originalPoints = child.points();
									
									if (originalPoints.length < 4) continue;

									// 设置画笔样式
									ctx.strokeStyle = child.stroke();
									ctx.lineWidth = child.strokeWidth() / this.imageScale;
									ctx.lineCap = child.lineCap() as CanvasLineCap;
									ctx.lineJoin = child.lineJoin() as CanvasLineJoin;

									// 开始路径
									ctx.beginPath();

									// 画笔线条坐标已经是相对于 Group 的，直接转换为原始图片坐标
									for (let j = 0; j < originalPoints.length; j += 2) {
										const groupX = originalPoints[j];
										const groupY = originalPoints[j + 1];
										
										const imageX = groupX / this.imageScale;
										const imageY = groupY / this.imageScale;
										
										if (j === 0) {
											ctx.moveTo(imageX, imageY);
										} else {
											ctx.lineTo(imageX, imageY);
										}
									}

									ctx.stroke();
								}
							}

							ctx.restore();
						}
					}

					// 导出为图片
					const dataURL = tempCanvas.toDataURL(mimeType, quality);
					
					// 清理临时资源
					tempStage.destroy();
					
					resolve(dataURL);
				};

				img.onerror = () => {
					tempStage.destroy();
					reject(new Error("无法加载滤镜后的图片"));
				};

				img.src = imageDataURL;
			} catch (error) {
				reject(error);
			}
		});
	}

	/**
	 * 导出画笔图层为图片
	 * 返回黑色背景、白色画笔的图片，尺寸与原始图片一致
	 */
	public exportBrushLayer(): Promise<string> {
		return new Promise((resolve, reject) => {
			if (!this.imageGroup || !this.originalImageWidth || !this.originalImageHeight) {
				reject(new Error("画笔图层或图片未加载"));
				return;
			}

			// 检查是否有画笔痕迹（Group 的第一个子元素是图片，其余是画笔线条）
			const groupChildren = this.imageGroup.getChildren();
			if (groupChildren.length <= 1) {
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

				// 遍历 Group 中的所有画笔线条（跳过第一个元素，即图片）
				for (let i = 1; i < groupChildren.length; i++) {
					const child = groupChildren[i];
					if (child instanceof Konva.Line) {
						const originalPoints = child.points();
						
						if (originalPoints.length < 4) continue; // 至少需要两个点

						// 设置画笔粗细（转换为原始图片尺寸）
						const brushWidth = child.strokeWidth() / this.imageScale;
						ctx.lineWidth = brushWidth;

						// 开始路径
						ctx.beginPath();

						// 画笔线条的坐标已经是相对于 Group 的，直接转换为原始图片坐标
						for (let j = 0; j < originalPoints.length; j += 2) {
							// Group 内的坐标（已经相对于图片）
							const groupX = originalPoints[j];
							const groupY = originalPoints[j + 1];
							
							// 转换为原始图片坐标（考虑图片的缩放）
							const imageX = groupX / this.imageScale;
							const imageY = groupY / this.imageScale;
							
							if (j === 0) {
								ctx.moveTo(imageX, imageY);
							} else {
								ctx.lineTo(imageX, imageY);
							}
						}

						// 绘制路径
						ctx.stroke();
					}
				}

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
		
		if (this.imageGroup) {
			this.imageGroup.destroy();
			this.imageGroup = null;
			this.imageNode = null;
			this.brushLayer = null;
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

