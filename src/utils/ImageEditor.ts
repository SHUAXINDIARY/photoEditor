import Konva from "konva";
import { registerCustomFilters } from "./KonvaFilter";

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
	private transformer: Konva.Transformer | null = null;
	private imageNode: Konva.Image | null = null;
	private container: HTMLElement | null = null;
	private config: ImageEditorConfig;
	public onImageStateChange?: () => void; // 图片状态变化回调

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
						this.onImageStateChange?.();
					});

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

	private currentContrast: number = 0;
	private currentTemperature: number = 0;
	private currentEnhance: number = 0;
	private currentBlur: number = 0;

	private rafId: number | null = null;
	private isUpdating: boolean = false;

	/**
	 * 应用所有滤镜（使用 requestAnimationFrame 优化性能）
	 */
	private applyFilters(): void {
		if (!this.imageNode || this.isUpdating) return;

		// 取消之前的动画帧请求
		if (this.rafId !== null) {
			cancelAnimationFrame(this.rafId);
		}

		// 使用 requestAnimationFrame 优化渲染
		this.rafId = requestAnimationFrame(() => {
			this.rafId = null;
			this._applyFiltersSync();
		});
	}

	/**
	 * 同步应用滤镜
	 */
	private _applyFiltersSync(): void {
		if (!this.imageNode) return;

		this.isUpdating = true;

		try {
			const filters: any[] = [];
			const hasContrast = this.currentContrast !== 0;
			const hasTemperature = this.currentTemperature !== 0;
			const hasEnhance = this.currentEnhance !== 0;
			const hasBlur = this.currentBlur !== 0;

			// 应用对比度滤镜
			// Konva 的对比度值范围是 -1 到 1，需要将 -100 到 100 转换为 -1 到 1
			if (hasContrast) {
				filters.push(Konva.Filters.Contrast);
			}

			// 应用色温自定义滤镜
			if (hasTemperature) {
				filters.push((Konva.Filters as any).Temperature);
			}

			// 应用增强滤镜
			if (hasEnhance) {
				filters.push(Konva.Filters.Enhance);
			}

			// 应用模糊滤镜
			if (hasBlur) {
				filters.push(Konva.Filters.Blur);
			}

			// 先设置 filters 数组
			this.imageNode.filters(filters);

			// 然后设置对比度参数（范围 -1 到 1）
			if (hasContrast) {
				// 将 -100 到 100 转换为 -1 到 1
				this.imageNode.contrast(this.currentContrast / 100);
			} else {
				this.imageNode.contrast(0);
			}

			// 设置色温参数（使用自定义滤镜）
			if (hasTemperature) {
				// 直接设置色温值，自定义滤镜会处理
				if (typeof (this.imageNode as any).temperature === 'function') {
					(this.imageNode as any).temperature(this.currentTemperature);
				} else {
					(this.imageNode as any).temperature = this.currentTemperature;
				}
			} else {
				if (typeof (this.imageNode as any).temperature === 'function') {
					(this.imageNode as any).temperature(0);
				} else {
					(this.imageNode as any).temperature = 0;
				}
			}

			// 设置增强参数（范围 0 到 1）
			if (hasEnhance) {
				// 将 0 到 100 转换为 0 到 1
				this.imageNode.enhance(this.currentEnhance / 100);
			} else {
				this.imageNode.enhance(0);
			}

			// 设置模糊参数（范围 0 到 20）
			if (hasBlur) {
				// 将 0 到 100 转换为 0 到 20
				this.imageNode.blurRadius(this.currentBlur * 0.2);
			} else {
				this.imageNode.blurRadius(0);
			}

			// 清除缓存并重新缓存（重要：应用滤镜后必须重新缓存）
			this.imageNode.cache();
			// 重绘画布
			this.layer?.draw();
		} finally {
			this.isUpdating = false;
		}
	}

	/**
	 * 设置对比度
	 * @param contrast 对比度值，范围 -100 到 100，0 为原始值
	 */
	public setContrast(contrast: number): void {
		if (!this.imageNode) return;
		this.currentContrast = contrast;
		this.applyFilters();
	}

	/**
	 * 设置色温
	 * @param temperature 色温值，范围 -100 到 100，0 为原始值
	 *                    -100 为冷色调（蓝色），100 为暖色调（橙红色）
	 */
	public setTemperature(temperature: number): void {
		if (!this.imageNode) return;
		this.currentTemperature = temperature;
		this.applyFilters();
	}

	/**
	 * 设置增强
	 * @param enhance 增强值，范围 0 到 100，0 为原始值
	 */
	public setEnhance(enhance: number): void {
		if (!this.imageNode) return;
		this.currentEnhance = enhance;
		this.applyFilters();
	}

	/**
	 * 设置模糊
	 * @param blur 模糊值，范围 0 到 100，0 为原始值
	 */
	public setBlur(blur: number): void {
		if (!this.imageNode) return;
		this.currentBlur = blur;
		this.applyFilters();
	}

	/**
	 * 重置所有滤镜效果
	 */
	public resetFilters(): void {
		if (!this.imageNode) return;
		this.currentContrast = 0;
		this.currentTemperature = 0;
		this.currentEnhance = 0;
		this.currentBlur = 0;
		this.applyFilters();
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

