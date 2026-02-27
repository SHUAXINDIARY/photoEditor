import { Application, Sprite, Container } from 'pixi.js';
import type { FederatedPointerEvent } from 'pixi.js';
import type { IImageEditor, ImageEditorConfig, ImageState } from '../editor/types';
import { PixiFilterManager } from './PixiFilterManager';
import { PixiBrushManager } from './PixiBrushManager';

/**
 * 基于 PixiJS 的图片编辑器
 * @description 使用 WebGL GPU 加速渲染，滤镜在 GPU shader 中执行，
 * 性能优于 Konva 的 CPU 逐像素处理。实现 IImageEditor 通用接口，
 * 可与 KonvaImageEditor 互换使用。
 */
export class PixiImageEditor implements IImageEditor {
	private app: Application | null = null;
	private imageContainer: Container | null = null;
	private imageSprite: Sprite | null = null;
	private containerEl: HTMLElement | null = null;
	private config: ImageEditorConfig;
	private initialized = false;
	private initPromise: Promise<void> | null = null;
	private isBrushMode = false;
	private loadSeq = 0;

	private filterManager: PixiFilterManager;
	private brushManager: PixiBrushManager | null = null;

	/** 原始图片尺寸 */
	private originalWidth = 0;
	private originalHeight = 0;
	/** 图片在画布上的初始缩放 */
	private fitScale = 1;

	/** 拖拽状态 */
	private dragging = false;
	private dragStartX = 0;
	private dragStartY = 0;
	private dragContainerStartX = 0;
	private dragContainerStartY = 0;

	public onImageStateChange?: () => void;

	constructor(container: HTMLElement, config: ImageEditorConfig) {
		this.containerEl = container;
		this.config = config;
		this.filterManager = new PixiFilterManager();
	}

	/**
	 * 确保 PixiJS Application 已初始化
	 * @description PixiJS v8 需要异步初始化
	 */
	private async ensureInit(): Promise<void> {
		if (this.initialized) return;
		if (this.initPromise) return this.initPromise;
		if (!this.containerEl) throw new Error('Container element is required');

		this.initPromise = (async () => {
			const app = new Application();
			await app.init({
				width: this.config.width,
				height: this.config.height,
				backgroundColor: 0xf5f5f5,
				antialias: true,
				preference: 'webgl',
			});

			this.containerEl!.appendChild(app.canvas);
			app.stage.eventMode = 'static';
			app.stage.hitArea = app.screen;

			this.app = app;
			this.initialized = true;
		})().finally(() => {
			this.initPromise = null;
		});

		return this.initPromise;
	}

	// ===== 图片加载与管理 =====

	/**
	 * 通过原生 Image 加载图片并创建 PixiJS Sprite
	 * @description 使用 Sprite.from(img, true) 走 PixiJS 内部的 Texture.from 流程，
	 * 避免手工构造 Texture 时因实例不一致导致的 transform/ObservablePoint 异常。
	 */
	private loadSprite(url: string): Promise<Sprite> {
		return new Promise((resolve, reject) => {
			const img = new Image();
			img.crossOrigin = 'anonymous';
			img.onload = () => {
				try {
					// skipCache=true，避免 data URL 造成全局纹理缓存增长
					resolve(Sprite.from(img, true));
				} catch (err) {
					reject(err);
				}
			};
			img.onerror = (_e) => reject(new Error(`图片加载失败: ${url.slice(0, 60)}...`));
			img.src = url;
		});
	}

	/**
	 * 加载图片
	 * @param url - 图片地址（支持 Data URL）
	 */
	public async loadImage(url: string): Promise<void> {
		const seq = ++this.loadSeq;
		await this.ensureInit();
		if (seq !== this.loadSeq) return;
		if (!this.app) throw new Error('Application not initialized');

		// 清除已有图片：必须先解除 filterManager 对旧 sprite 的引用，
		// 再销毁容器，否则 pending 的 rAF 回调会访问已销毁的 sprite
		if (this.imageContainer) {
			this.filterManager.setSpriteContext(null);
			this.brushManager?.destroy();
			this.brushManager = null;
			this.app.stage.removeChild(this.imageContainer);
			this.imageContainer.destroy({ children: true });
			this.imageContainer = null;
			this.imageSprite = null;
		}

		const sprite = await this.loadSprite(url);
		if (seq !== this.loadSeq) {
			sprite.destroy();
			return;
		}
		const texture = sprite.texture;
		const stageWidth = this.app.screen.width;
		const stageHeight = this.app.screen.height;

		this.originalWidth = texture.width;
		this.originalHeight = texture.height;

		const scale = Math.min(
			stageWidth / texture.width,
			stageHeight / texture.height,
			1,
		);
		this.fitScale = scale;

		const displayW = texture.width * scale;
		const displayH = texture.height * scale;
		const x = (stageWidth - displayW) / 2;
		const y = (stageHeight - displayH) / 2;

		this.imageContainer = new Container();
		this.imageContainer.x = x;
		this.imageContainer.y = y;
		this.imageContainer.eventMode = 'static';
		this.imageContainer.cursor = 'grab';

		this.imageSprite = sprite;
		// 使用 scale setter，保证首次写入时正确初始化 ObservablePoint observer
		this.imageSprite.scale = scale;
		this.imageContainer.addChild(this.imageSprite);

		this.filterManager.setSpriteContext(this.imageSprite);

		this.brushManager = new PixiBrushManager(this.imageContainer);

		this.app.stage.addChild(this.imageContainer);

		this.setupDrag();
	}

	/**
	 * 设置拖拽交互
	 */
	private setupDrag(): void {
		if (!this.imageContainer || !this.app) return;
		const container = this.imageContainer;

		container.on('pointerdown', (e: FederatedPointerEvent) => {
			if (this.isBrushMode) return;
			this.dragging = true;
			container.cursor = 'grabbing';
			const pos = e.global;
			this.dragStartX = pos.x;
			this.dragStartY = pos.y;
			this.dragContainerStartX = container.x;
			this.dragContainerStartY = container.y;
		});

		this.app.stage.on('pointermove', (e: FederatedPointerEvent) => {
			if (!this.dragging) return;
			const dx = e.global.x - this.dragStartX;
			const dy = e.global.y - this.dragStartY;
			container.x = this.dragContainerStartX + dx;
			container.y = this.dragContainerStartY + dy;
		});

		const endDrag = () => {
			if (!this.dragging) return;
			this.dragging = false;
			container.cursor = this.isBrushMode ? 'crosshair' : 'grab';
			this.onImageStateChange?.();
		};

		this.app.stage.on('pointerup', endDrag);
		this.app.stage.on('pointerupoutside', endDrag);
	}

	/**
	 * 清除当前图片
	 */
	public clearImage(): void {
		this.filterManager.setSpriteContext(null);
		if (this.imageContainer) {
			this.brushManager?.destroy();
			this.brushManager = null;
			this.imageContainer.destroy({ children: true });
			this.imageContainer = null;
			this.imageSprite = null;
		}
	}

	/**
	 * 更新画布尺寸
	 */
	public updateSize(width: number, height: number): void {
		if (!this.app) return;
		this.app.renderer.resize(width, height);
		this.config.width = width;
		this.config.height = height;
	}

	// ===== 图片状态 =====

	public getImageState(): ImageState | null {
		if (!this.imageContainer) return null;
		return {
			x: this.imageContainer.x,
			y: this.imageContainer.y,
			scaleX: this.imageContainer.scale.x,
			scaleY: this.imageContainer.scale.y,
		};
	}

	public setImageState(state: ImageState): void {
		if (!this.imageContainer) return;
		this.imageContainer.x = state.x;
		this.imageContainer.y = state.y;
		this.imageContainer.scale.set(state.scaleX, state.scaleY);
	}

	// ===== 滤镜效果 =====

	public setContrast(value: number): void {
		this.filterManager.setContrast(value);
	}

	public setTemperature(value: number): void {
		this.filterManager.setTemperature(value);
	}

	public setSaturation(value: number): void {
		this.filterManager.setSaturation(value);
	}

	public setEnhance(value: number): void {
		this.filterManager.setEnhance(value);
	}

	public setBlur(value: number): void {
		this.filterManager.setBlur(value);
	}

	public setShadow(value: number): void {
		this.filterManager.setShadow(value);
	}

	public setHighlight(value: number): void {
		this.filterManager.setHighlight(value);
	}

	public resetFilters(): void {
		this.filterManager.reset();
	}

	// ===== 画笔功能 =====

	public enableBrush(color = '#000000', size = 10): void {
		if (!this.imageContainer || !this.brushManager) return;
		this.isBrushMode = true;
		this.imageContainer.cursor = 'crosshair';
		this.brushManager.enable(color, size);
	}

	public disableBrush(): void {
		if (!this.brushManager) return;
		this.isBrushMode = false;
		if (this.imageContainer) {
			this.imageContainer.cursor = 'grab';
		}
		this.brushManager.disable();
	}

	public setBrushSize(size: number): void {
		this.brushManager?.setSize(size);
	}

	public clearBrush(): void {
		this.brushManager?.clear();
	}

	// ===== 导出功能 =====

	public exportImage(mimeType?: string, _quality?: number): string | null {
		if (!this.app) return null;
		const canvas = this.app.canvas as HTMLCanvasElement;
		return canvas.toDataURL(mimeType ?? 'image/png');
	}

	/**
	 * 导出编辑后完整图片（原始尺寸，包含滤镜和画笔）
	 */
	public async exportEditedImage(
		mimeType = 'image/png',
		quality?: number,
	): Promise<string> {
		if (!this.imageSprite || !this.app) {
			throw new Error('图片未加载');
		}

		const tempApp = new Application();
		await tempApp.init({
			width: this.originalWidth,
			height: this.originalHeight,
			backgroundColor: 0xffffff,
			antialias: true,
			preference: 'webgl',
		});

		try {
			const texture = this.imageSprite.texture;
			const tempSprite = new Sprite(texture);
			tempSprite.width = this.originalWidth;
			tempSprite.height = this.originalHeight;

			const filters = this.filterManager.cloneFilters();
			if (filters.length > 0) {
				tempSprite.filters = filters;
			}

			tempApp.stage.addChild(tempSprite);

			// 如果有画笔，叠加渲染
			if (this.brushManager?.hasStrokes()) {
				const brushCanvas = document.createElement('canvas');
				brushCanvas.width = this.originalWidth;
				brushCanvas.height = this.originalHeight;
				const ctx = brushCanvas.getContext('2d')!;

				const scaleRatio = 1 / this.fitScale;
				this.brushManager.renderToCanvas(ctx, scaleRatio);

				const brushSprite = Sprite.from(brushCanvas, true);
				tempApp.stage.addChild(brushSprite);
			}

			tempApp.render();

			const canvas = tempApp.canvas as HTMLCanvasElement;
			const dataURL = canvas.toDataURL(mimeType, quality);
			return dataURL;
		} finally {
			// 临时滤镜显式销毁，避免 program 生命周期边界触发 WebGL 警告
			try {
				const tempFilters = (tempApp.stage.children[0] as Sprite | undefined)?.filters;
				if (tempFilters && tempFilters.length > 0) {
					for (const f of tempFilters) {
						f.destroy();
					}
				}
			} catch {
				// ignore
			}
			tempApp.destroy(true);
		}
	}

	/**
	 * 导出画笔图层（黑色背景 + 白色画笔）
	 */
	public async exportBrushLayer(): Promise<string> {
		if (!this.brushManager?.hasStrokes()) {
			throw new Error('没有画笔痕迹可导出');
		}

		const canvas = document.createElement('canvas');
		canvas.width = this.originalWidth;
		canvas.height = this.originalHeight;
		const ctx = canvas.getContext('2d')!;

		ctx.fillStyle = '#000000';
		ctx.fillRect(0, 0, this.originalWidth, this.originalHeight);

		const scaleRatio = 1 / this.fitScale;
		this.brushManager.renderToCanvas(ctx, scaleRatio, '#ffffff');

		return canvas.toDataURL('image/png');
	}

	// ===== 资源清理 =====

	public destroy(): void {
		this.disableBrush();
		this.brushManager?.destroy();
		this.brushManager = null;
		this.filterManager.destroy();
		if (this.imageContainer) {
			this.imageContainer.destroy({ children: true });
			this.imageContainer = null;
			this.imageSprite = null;
		}
		if (this.app) {
			this.app.destroy(true, { children: true });
			this.app = null;
		}
		this.containerEl = null;
		this.initialized = false;
	}
}
