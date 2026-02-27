import { Application, Sprite, Container, Rectangle } from 'pixi.js';
import type { FederatedPointerEvent } from 'pixi.js';
import type { IImageEditor, ImageEditorConfig, ImageState } from '../editor/types';
import { calcImageFitLayout } from '../editor/canvasLayout';
import type { ImageFitLayout } from '../editor/canvasLayout';
import { PixiFilterManager } from './PixiFilterManager';
import { PixiBrushManager } from './PixiBrushManager';
import { PixiTransformer } from './PixiTransformer';

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
	private transformer: PixiTransformer | null = null;

	/** 图片 fit 布局信息（由通用算法计算，引擎无关） */
	private fitLayout: ImageFitLayout | null = null;

	/** 当前是否选中图片 */
	private isSelected = false;

	/** 拖拽状态 */
	private dragging = false;
	private dragStartX = 0;
	private dragStartY = 0;
	private dragContainerStartX = 0;
	private dragContainerStartY = 0;
	private dragPointerDownHandler: ((e: FederatedPointerEvent) => void) | null = null;
	private stagePointerMoveHandler: ((e: FederatedPointerEvent) => void) | null = null;
	private stagePointerUpHandler: (() => void) | null = null;

	public onImageStateChange?: () => void;

	constructor(container: HTMLElement, config: ImageEditorConfig) {
		this.containerEl = container;
		this.config = config;
		this.filterManager = new PixiFilterManager();
	}

	/**
	 * 确保 PixiJS Application 已初始化
	 * @description PixiJS v8 需要异步初始化。
	 * 与 Konva 对齐：使用 resolution=1 避免高 DPI 下坐标系差异，
	 * 并显式设置容器 DOM 尺寸以匹配 Konva 的布局行为。
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
				resolution: 1,
			});

			// 与 Konva 对齐：给容器 div 设置固定尺寸，确保 flex 布局行为一致
			this.containerEl!.style.width = `${this.config.width}px`;
			this.containerEl!.style.height = `${this.config.height}px`;
			this.containerEl!.appendChild(app.canvas);
			app.stage.eventMode = 'static';
			app.stage.hitArea = app.screen;

			this.app = app;
			this.initialized = true;

			this.transformer = new PixiTransformer(app, {
				keepAspectRatio: true,
			});
			this.transformer.onTransformEnd = () => {
				this.updateHitArea();
				this.onImageStateChange?.();
			};

			this.setupStageClick();
		})().finally(() => {
			this.initPromise = null;
		});

		return this.initPromise;
	}

	/**
	 * 设置点击空白处取消选中
	 */
	private setupStageClick(): void {
		if (!this.app) return;

		this.app.stage.on('pointerdown', (e: FederatedPointerEvent) => {
			if (e.target === this.app?.stage) {
				this.deselectImage();
			}
		});
	}

	/**
	 * 选中图片，显示变换控制器
	 */
	private selectImage(): void {
		if (!this.imageContainer || !this.transformer || !this.fitLayout || this.isBrushMode) return;

		this.isSelected = true;
		this.transformer.attach(
			this.imageContainer,
			this.fitLayout.displayWidth,
			this.fitLayout.displayHeight,
		);
	}

	/**
	 * 取消选中图片
	 */
	private deselectImage(): void {
		if (!this.transformer) return;
		this.isSelected = false;
		this.transformer.detach();
		this.app?.renderer.render(this.app.stage);
	}

	/**
	 * 更新 hitArea 以匹配当前缩放后的可见区域
	 * @description hitArea 是相对于容器局部坐标系的，不会随 scale 变化。
	 * 因此 hitArea 始终保持为基础尺寸 displayWidth/displayHeight。
	 */
	private updateHitArea(): void {
		if (!this.imageContainer || !this.fitLayout) return;
		this.imageContainer.hitArea = new Rectangle(
			0,
			0,
			this.fitLayout.displayWidth,
			this.fitLayout.displayHeight,
		);
	}

	/**
	 * 释放当前图片节点
	 * @description 在 renderer 仍有效时显式销毁 texture/textureSource，
	 * 避免在 app.destroy() 后续阶段清理纹理池时触发 WebGL 上下文竞态。
	 */
	private disposeImageNodes(): void {
		if (!this.imageContainer) return;

		if (this.app?.stage && this.imageContainer.parent === this.app.stage) {
			this.app.stage.removeChild(this.imageContainer);
		}

		if (this.imageSprite) {
			this.imageSprite.filters = [];
			this.imageSprite.destroy({ texture: true, textureSource: true });
			this.imageSprite = null;
		}

		this.imageContainer.destroy({ children: false });
		this.imageContainer = null;
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
			this.disposeImageNodes();
		}

		const sprite = await this.loadSprite(url);
		if (seq !== this.loadSeq || !this.app) {
			sprite.destroy({ texture: true, textureSource: true });
			return;
		}
		const texture = sprite.texture;

		const layout = calcImageFitLayout(
			this.app.screen.width,
			this.app.screen.height,
			texture.width,
			texture.height,
		);
		this.fitLayout = layout;

		this.imageContainer = new Container();
		this.imageContainer.x = layout.x;
		this.imageContainer.y = layout.y;
		this.imageContainer.eventMode = 'static';
		this.imageContainer.cursor = 'grab';
		this.imageContainer.hitArea = new Rectangle(0, 0, layout.displayWidth, layout.displayHeight);

		this.imageSprite = sprite;
		this.imageSprite.eventMode = 'static';
		this.imageSprite.scale = layout.scale;
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
		const stage = this.app.stage;

		// 防止重复绑定导致监听器累积
		this.cleanupDrag();

		this.dragPointerDownHandler = (e: FederatedPointerEvent) => {
			if (this.isBrushMode) return;

			// 点击图片时选中它
			this.selectImage();

			this.dragging = true;
			container.cursor = 'grabbing';
			const pos = e.global;
			this.dragStartX = pos.x;
			this.dragStartY = pos.y;
			this.dragContainerStartX = container.x;
			this.dragContainerStartY = container.y;
		};
		container.on('pointerdown', this.dragPointerDownHandler);

		this.stagePointerMoveHandler = (e: FederatedPointerEvent) => {
			if (!this.dragging) return;
			const dx = e.global.x - this.dragStartX;
			const dy = e.global.y - this.dragStartY;
			container.x = this.dragContainerStartX + dx;
			container.y = this.dragContainerStartY + dy;

			// 更新 transformer 位置
			if (this.isSelected && this.transformer) {
				this.transformer.update();
			}

			// PixiJS v8 使用按需渲染,拖拽时需手动触发渲染更新
			this.app?.renderer.render(this.app.stage);
		};
		stage.on('pointermove', this.stagePointerMoveHandler);

		this.stagePointerUpHandler = () => {
			if (!this.dragging) return;
			this.dragging = false;
			container.cursor = this.isBrushMode ? 'crosshair' : 'grab';
			this.onImageStateChange?.();
		};

		stage.on('pointerup', this.stagePointerUpHandler);
		stage.on('pointerupoutside', this.stagePointerUpHandler);
	}

	/**
	 * 清理拖拽事件绑定
	 */
	private cleanupDrag(): void {
		if (this.imageContainer && this.dragPointerDownHandler) {
			this.imageContainer.off('pointerdown', this.dragPointerDownHandler);
		}
		if (this.app?.stage && this.stagePointerMoveHandler) {
			this.app.stage.off('pointermove', this.stagePointerMoveHandler);
		}
		if (this.app?.stage && this.stagePointerUpHandler) {
			this.app.stage.off('pointerup', this.stagePointerUpHandler);
			this.app.stage.off('pointerupoutside', this.stagePointerUpHandler);
		}

		this.dragPointerDownHandler = null;
		this.stagePointerMoveHandler = null;
		this.stagePointerUpHandler = null;
		this.dragging = false;
	}

	/**
	 * 清除当前图片
	 */
	public clearImage(): void {
		this.loadSeq += 1;
		this.cleanupDrag();
		this.filterManager.setSpriteContext(null);
		if (this.imageContainer) {
			this.brushManager?.destroy();
			this.brushManager = null;
			this.disposeImageNodes();
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
		if (this.containerEl) {
			this.containerEl.style.width = `${width}px`;
			this.containerEl.style.height = `${height}px`;
		}
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

		// 同步更新 transformer
		if (this.isSelected && this.transformer) {
			this.transformer.update();
		}
		this.app?.renderer.render(this.app.stage);
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

		// 画笔模式下取消选中，隐藏 transformer
		this.deselectImage();
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
		if (!this.imageSprite || !this.app || !this.fitLayout) {
			throw new Error('图片未加载');
		}

		const { originalWidth, originalHeight, scale } = this.fitLayout;

		const tempApp = new Application();
		await tempApp.init({
			width: originalWidth,
			height: originalHeight,
			backgroundColor: 0xffffff,
			antialias: true,
			preference: 'webgl',
		});

		try {
			const texture = this.imageSprite.texture;
			const tempSprite = new Sprite(texture);
			tempSprite.width = originalWidth;
			tempSprite.height = originalHeight;

			const filters = this.filterManager.cloneFilters();
			if (filters.length > 0) {
				tempSprite.filters = filters;
			}

			tempApp.stage.addChild(tempSprite);

			if (this.brushManager?.hasStrokes()) {
				const brushCanvas = document.createElement('canvas');
				brushCanvas.width = originalWidth;
				brushCanvas.height = originalHeight;
				const ctx = brushCanvas.getContext('2d')!;

				const scaleRatio = 1 / scale;
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
		if (!this.brushManager?.hasStrokes() || !this.fitLayout) {
			throw new Error('没有画笔痕迹可导出');
		}

		const { originalWidth, originalHeight, scale } = this.fitLayout;

		const canvas = document.createElement('canvas');
		canvas.width = originalWidth;
		canvas.height = originalHeight;
		const ctx = canvas.getContext('2d')!;

		ctx.fillStyle = '#000000';
		ctx.fillRect(0, 0, originalWidth, originalHeight);

		const scaleRatio = 1 / scale;
		this.brushManager.renderToCanvas(ctx, scaleRatio, '#ffffff');

		return canvas.toDataURL('image/png');
	}

	// ===== 资源清理 =====

	public destroy(): void {
		this.loadSeq += 1;
		this.cleanupDrag();
		this.disableBrush();
		this.clearImage();
		this.filterManager.destroy();

		if (this.transformer) {
			this.transformer.destroy();
			this.transformer = null;
		}

		if (this.containerEl) {
			this.containerEl.style.width = '';
			this.containerEl.style.height = '';
		}
		if (this.app) {
			this.app.destroy(true, { children: true });
			this.app = null;
		}
		this.containerEl = null;
		this.initialized = false;
	}
}
