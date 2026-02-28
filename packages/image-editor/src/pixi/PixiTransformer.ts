import { Container, Graphics } from 'pixi.js';
import type { FederatedPointerEvent, Application } from 'pixi.js';

/** 控制点位置类型 */
type HandlePosition =
	| 'top-left'
	| 'top-right'
	| 'bottom-left'
	| 'bottom-right'
	| 'top-center'
	| 'bottom-center'
	| 'left-center'
	| 'right-center';

/** Transformer 配置 */
interface TransformerConfig {
	/** 控制点大小（像素），默认 10 */
	handleSize?: number;
	/** 控制点颜色，默认白色 */
	handleColor?: number;
	/** 控制点边框颜色，默认蓝色 */
	handleBorderColor?: number;
	/** 边框线宽，默认 2 */
	borderWidth?: number;
	/** 边框颜色，默认蓝色 */
	borderColor?: number;
	/** 是否启用旋转（暂不支持），默认 false */
	rotateEnabled?: boolean;
	/** 是否保持宽高比，默认 true */
	keepAspectRatio?: boolean;
}

const DEFAULT_CONFIG: Required<TransformerConfig> = {
	handleSize: 10,
	handleColor: 0xffffff,
	handleBorderColor: 0x667eea,
	borderWidth: 2,
	borderColor: 0x667eea,
	rotateEnabled: false,
	keepAspectRatio: true,
};

/**
 * PixiJS 图片变换控制器
 * @description 在目标容器周围绘制控制点和边框，支持通过拖拽控制点缩放图片。
 * 类似 Konva.Transformer 的功能。
 */
export class PixiTransformer {
	private app: Application;
	private target: Container | null = null;
	private container: Container;
	private border: Graphics;
	private handles: Map<HandlePosition, Graphics> = new Map();
	private config: Required<TransformerConfig>;

	/** 拖拽状态 */
	private dragging = false;
	private activeHandle: HandlePosition | null = null;
	private dragStartX = 0;
	private dragStartY = 0;
	private startWidth = 0;
	private startHeight = 0;
	private startScaleX = 1;
	private startScaleY = 1;
	private startX = 0;
	private startY = 0;

	/** 目标原始尺寸（布局计算后的 displayWidth/displayHeight） */
	private targetBaseWidth = 0;
	private targetBaseHeight = 0;

	/** 变换完成回调 */
	public onTransformEnd?: () => void;

	constructor(app: Application, config?: TransformerConfig) {
		this.app = app;
		this.config = { ...DEFAULT_CONFIG, ...config };

		this.container = new Container();
		this.container.eventMode = 'static';
		this.container.zIndex = 9999;

		this.border = new Graphics();
		this.border.eventMode = 'none';
		this.container.addChild(this.border);

		this.createHandles();
		this.hide();

		this.app.stage.addChild(this.container);

		this.setupStageEvents();
	}

	/**
	 * 创建 8 个控制点
	 */
	private createHandles(): void {
		const positions: HandlePosition[] = [
			'top-left',
			'top-center',
			'top-right',
			'left-center',
			'right-center',
			'bottom-left',
			'bottom-center',
			'bottom-right',
		];

		for (const pos of positions) {
			const handle = new Graphics();
			handle.eventMode = 'static';
			handle.cursor = this.getCursorForHandle(pos);
			handle.label = pos;

			handle.on('pointerdown', (e: FederatedPointerEvent) => {
				e.stopPropagation();
				this.startResize(pos, e);
			});

			this.handles.set(pos, handle);
			this.container.addChild(handle);
		}
	}

	/**
	 * 获取控制点对应的鼠标样式
	 */
	private getCursorForHandle(pos: HandlePosition): string {
		switch (pos) {
			case 'top-left':
			case 'bottom-right':
				return 'nwse-resize';
			case 'top-right':
			case 'bottom-left':
				return 'nesw-resize';
			case 'top-center':
			case 'bottom-center':
				return 'ns-resize';
			case 'left-center':
			case 'right-center':
				return 'ew-resize';
			default:
				return 'pointer';
		}
	}

	/**
	 * 设置 Stage 级别的鼠标事件
	 */
	private setupStageEvents(): void {
		this.app.stage.on('pointermove', this.handlePointerMove);
		this.app.stage.on('pointerup', this.handlePointerUp);
		this.app.stage.on('pointerupoutside', this.handlePointerUp);
	}

	/**
	 * 绑定目标容器
	 * @param target - 要变换的容器
	 * @param baseWidth - 容器内容的基础宽度（不含 scale）
	 * @param baseHeight - 容器内容的基础高度（不含 scale）
	 */
	public attach(target: Container, baseWidth: number, baseHeight: number): void {
		this.target = target;
		this.targetBaseWidth = baseWidth;
		this.targetBaseHeight = baseHeight;
		this.show();
		this.update();
	}

	/**
	 * 解绑目标容器
	 */
	public detach(): void {
		this.target = null;
		this.hide();
	}

	/**
	 * 显示变换控制器
	 */
	public show(): void {
		this.container.visible = true;
	}

	/**
	 * 隐藏变换控制器
	 */
	public hide(): void {
		this.container.visible = false;
	}

	/**
	 * 更新边框和控制点位置
	 */
	public update(): void {
		if (!this.target) return;

		const { handleSize, handleColor, handleBorderColor, borderWidth, borderColor } = this.config;
		const halfHandle = handleSize / 2;

		const x = this.target.x;
		const y = this.target.y;
		const width = this.targetBaseWidth * this.target.scale.x;
		const height = this.targetBaseHeight * this.target.scale.y;

		this.border.clear();
		this.border.rect(x, y, width, height);
		this.border.stroke({ width: borderWidth, color: borderColor });

		const handlePositions: Record<HandlePosition, { x: number; y: number }> = {
			'top-left': { x, y },
			'top-center': { x: x + width / 2, y },
			'top-right': { x: x + width, y },
			'left-center': { x, y: y + height / 2 },
			'right-center': { x: x + width, y: y + height / 2 },
			'bottom-left': { x, y: y + height },
			'bottom-center': { x: x + width / 2, y: y + height },
			'bottom-right': { x: x + width, y: y + height },
		};

		for (const [pos, handle] of this.handles) {
			const { x: hx, y: hy } = handlePositions[pos];
			handle.clear();
			handle.rect(-halfHandle, -halfHandle, handleSize, handleSize);
			handle.fill(handleColor);
			handle.stroke({ width: 2, color: handleBorderColor });
			handle.x = hx;
			handle.y = hy;
		}

		this.render();
	}

	/**
	 * 开始缩放
	 */
	private startResize(pos: HandlePosition, e: FederatedPointerEvent): void {
		if (!this.target) return;

		this.dragging = true;
		this.activeHandle = pos;
		this.dragStartX = e.global.x;
		this.dragStartY = e.global.y;
		this.startScaleX = this.target.scale.x;
		this.startScaleY = this.target.scale.y;
		this.startX = this.target.x;
		this.startY = this.target.y;
		this.startWidth = this.targetBaseWidth * this.startScaleX;
		this.startHeight = this.targetBaseHeight * this.startScaleY;
	}

	/**
	 * 处理鼠标移动
	 */
	private handlePointerMove = (e: FederatedPointerEvent): void => {
		if (!this.dragging || !this.target || !this.activeHandle) return;

		const dx = e.global.x - this.dragStartX;
		const dy = e.global.y - this.dragStartY;

		let newWidth = this.startWidth;
		let newHeight = this.startHeight;
		let newX = this.startX;
		let newY = this.startY;

		switch (this.activeHandle) {
			case 'bottom-right':
				newWidth = this.startWidth + dx;
				newHeight = this.startHeight + dy;
				break;
			case 'bottom-left':
				newWidth = this.startWidth - dx;
				newHeight = this.startHeight + dy;
				newX = this.startX + dx;
				break;
			case 'top-right':
				newWidth = this.startWidth + dx;
				newHeight = this.startHeight - dy;
				newY = this.startY + dy;
				break;
			case 'top-left':
				newWidth = this.startWidth - dx;
				newHeight = this.startHeight - dy;
				newX = this.startX + dx;
				newY = this.startY + dy;
				break;
			case 'right-center':
				newWidth = this.startWidth + dx;
				break;
			case 'left-center':
				newWidth = this.startWidth - dx;
				newX = this.startX + dx;
				break;
			case 'bottom-center':
				newHeight = this.startHeight + dy;
				break;
			case 'top-center':
				newHeight = this.startHeight - dy;
				newY = this.startY + dy;
				break;
		}

		const minSize = 50;
		newWidth = Math.max(minSize, newWidth);
		newHeight = Math.max(minSize, newHeight);

		if (this.config.keepAspectRatio) {
			const corners = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
			if (corners.includes(this.activeHandle)) {
				const aspectRatio = this.startWidth / this.startHeight;
				const widthFromHeight = newHeight * aspectRatio;
				const heightFromWidth = newWidth / aspectRatio;

				if (Math.abs(dx) > Math.abs(dy)) {
					newHeight = heightFromWidth;
				} else {
					newWidth = widthFromHeight;
				}

				if (this.activeHandle === 'top-left') {
					newX = this.startX + (this.startWidth - newWidth);
					newY = this.startY + (this.startHeight - newHeight);
				} else if (this.activeHandle === 'top-right') {
					newY = this.startY + (this.startHeight - newHeight);
				} else if (this.activeHandle === 'bottom-left') {
					newX = this.startX + (this.startWidth - newWidth);
				}
			}
		}

		const newScaleX = newWidth / this.targetBaseWidth;
		const newScaleY = newHeight / this.targetBaseHeight;

		this.target.scale.set(newScaleX, newScaleY);
		this.target.x = newX;
		this.target.y = newY;

		this.update();
	};

	/**
	 * 处理鼠标抬起
	 */
	private handlePointerUp = (): void => {
		if (this.dragging) {
			this.dragging = false;
			this.activeHandle = null;
			this.onTransformEnd?.();
		}
	};

	/**
	 * 手动触发渲染
	 */
	private render(): void {
		this.app.renderer.render(this.app.stage);
	}

	/**
	 * 销毁 Transformer
	 */
	public destroy(): void {
		this.app.stage.off('pointermove', this.handlePointerMove);
		this.app.stage.off('pointerup', this.handlePointerUp);
		this.app.stage.off('pointerupoutside', this.handlePointerUp);

		this.handles.forEach((handle) => handle.destroy());
		this.handles.clear();
		this.border.destroy();
		this.container.destroy();
		this.target = null;
	}
}
