import Konva from "konva";

export interface ImageEditorConfig {
	width: number;
	height: number;
	rotateEnabled?: boolean;
}

function temperature2rgb(kelvin: number) {
	// 将色温限制在有效范围
	kelvin = Math.max(1000, Math.min(15000, kelvin));
	const temp = kelvin / 100;

	let r, g, b;

	// Red
	if (temp <= 66) {
		r = 255;
	} else {
		r = temp - 60;
		r = 329.698727446 * Math.pow(r, -0.1332047592);
		r = Math.max(0, Math.min(255, r));
	}

	// Green
	if (temp <= 66) {
		g = temp;
		g = 99.4708025861 * Math.log(g) - 161.1195681661;
	} else {
		g = temp - 60;
		g = 288.1221695283 * Math.pow(g, -0.0755148492);
	}
	g = Math.max(0, Math.min(255, g));

	// Blue
	if (temp >= 66) {
		b = 255;
	} else if (temp <= 19) {
		b = 0;
	} else {
		b = temp - 10;
		b = 138.5177312231 * Math.log(b) - 305.0447927307;
		b = Math.max(0, Math.min(255, b));
	}

	return { r: r / 255, g: g / 255, b: b / 255 }; // 归一化到 [0,1]
}

function getWBGains(targetKelvin: number) {
	const white = temperature2rgb(targetKelvin); // 目标色温下的“白”
	// 白平衡增益 = 1 / white （让 white 变成 (1,1,1)）
	const gainR = 1 / white.r;
	const gainG = 1 / white.g;
	const gainB = 1 / white.b;

	// 通常以绿色通道为基准（gainG = 1），避免整体亮度变化
	return {
		r: gainR / gainG,
		g: 1,
		b: gainB / gainG
	};
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

			// 应用对比度滤镜
			// Konva 的对比度值范围是 -1 到 1，需要将 -100 到 100 转换为 -1 到 1
			if (hasContrast) {
				filters.push(Konva.Filters.Contrast);
			}

			// 应用色温滤镜
			if (hasTemperature) {
				filters.push(Konva.Filters.RGB);
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

			// 设置色温参数（使用标准色温算法）
			if (hasTemperature) {
				// 将 -100 到 100 映射到色温范围（Kelvin）
				// 中性色温：5500K（日光）
				// 暖色调（正值）：3000K - 5500K
				// 冷色调（负值）：5500K - 8000K
				const tempValue = this.currentTemperature / 100; // -1 到 1
				
				// 使用平滑曲线，使调整更自然
				const smoothCurve = (x: number): number => {
					// 使用 tanh 函数创建平滑的 S 曲线
					return Math.tanh(x * 1.2);
				};
				
				const curveValue = smoothCurve(tempValue);
				
				// 将曲线值映射到色温范围
				// 中性 5500K，范围 3000K - 8000K
				const neutralKelvin = 5500;
				const minKelvin = 3000;
				const maxKelvin = 8000;
				const range = (maxKelvin - minKelvin) / 2;
				
				// 计算目标色温
				const targetKelvin = neutralKelvin - curveValue * range;
				
				// 获取白平衡增益
				const gains = getWBGains(targetKelvin);
				
				// 将增益转换为 Konva RGB 滤镜的参数
				// Konva RGB 滤镜使用乘法增益，需要转换为偏移量
				// 增益 > 1 表示增加，增益 < 1 表示减少
				// 转换为 -100 到 100 的范围
				const convertGainToOffset = (gain: number): number => {
					// 将增益 [0.5, 2.0] 映射到 [-100, 100]
					// 增益 1.0 对应偏移 0
					if (gain >= 1.0) {
						// 增益 1.0-2.0 映射到 0-100
						return (gain - 1.0) * 100;
					} else {
						// 增益 0.5-1.0 映射到 -100-0
						return (gain - 1.0) * 200;
					}
				};
				
				// 应用增益，但限制调整幅度，避免过度
				const redOffset = convertGainToOffset(gains.r) * 0.6;   // 限制到 60%
				const greenOffset = convertGainToOffset(gains.g) * 0.6; // 限制到 60%
				const blueOffset = convertGainToOffset(gains.b) * 0.6;  // 限制到 60%
				
				// 确保值在合理范围内
				const red = Math.max(-100, Math.min(100, redOffset));
				const green = Math.max(-100, Math.min(100, greenOffset));
				const blue = Math.max(-100, Math.min(100, blueOffset));

				this.imageNode.red(red);
				this.imageNode.green(green);
				this.imageNode.blue(blue);
			} else {
				this.imageNode.red(0);
				this.imageNode.green(0);
				this.imageNode.blue(0);
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
	 * 重置所有滤镜效果
	 */
	public resetFilters(): void {
		if (!this.imageNode) return;
		this.currentContrast = 0;
		this.currentTemperature = 0;
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

