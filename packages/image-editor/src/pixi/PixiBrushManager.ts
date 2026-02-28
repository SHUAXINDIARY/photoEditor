import { Graphics, Container } from 'pixi.js';
import type { FederatedPointerEvent } from 'pixi.js';

/**
 * 画笔线条数据
 * @description 记录每条画笔线的点序列和样式
 */
interface BrushStroke {
	/** 点序列 [x0, y0, x1, y1, ...] */
	points: number[];
	/** 画笔颜色 */
	color: string;
	/** 画笔粗细 */
	size: number;
}

/**
 * PixiJS 画笔管理器
 * @description 在 PixiJS Container 上实现自由绘制功能，
 * 画笔坐标相对于图片容器（与 Konva 版保持一致）
 */
export class PixiBrushManager {
	private container: Container;
	private graphics: Graphics;
	private strokes: BrushStroke[] = [];
	private currentStroke: BrushStroke | null = null;
	private isDrawing = false;
	private brushColor = '#000000';
	private brushSize = 10;
	private enabled = false;

	/**
	 * @param container - 画笔绑定的图片容器（坐标空间与图片一致）
	 */
	constructor(container: Container) {
		this.container = container;
		this.graphics = new Graphics();
		this.container.addChild(this.graphics);
	}

	/**
	 * 开启画笔模式
	 * @param color - 画笔颜色
	 * @param size - 画笔粗细
	 */
	public enable(color = '#000000', size = 10): void {
		this.brushColor = color;
		this.brushSize = size;
		this.enabled = true;

		this.container.eventMode = 'static';
		this.container.cursor = 'crosshair';
		this.container.on('pointerdown', this.onPointerDown);
		this.container.on('pointermove', this.onPointerMove);
		this.container.on('pointerup', this.onPointerUp);
		this.container.on('pointerupoutside', this.onPointerUp);
	}

	/**
	 * 关闭画笔模式
	 */
	public disable(): void {
		this.enabled = false;
		this.isDrawing = false;
		this.currentStroke = null;

		this.container.cursor = 'default';
		this.container.off('pointerdown', this.onPointerDown);
		this.container.off('pointermove', this.onPointerMove);
		this.container.off('pointerup', this.onPointerUp);
		this.container.off('pointerupoutside', this.onPointerUp);
	}

	/**
	 * 设置画笔粗细
	 * @param size - 1 ~ 50
	 */
	public setSize(size: number): void {
		this.brushSize = Math.max(1, Math.min(50, size));
	}

	/**
	 * 清除所有画笔痕迹
	 */
	public clear(): void {
		this.strokes = [];
		this.currentStroke = null;
		this.graphics.clear();
	}

	/**
	 * 是否有画笔痕迹
	 */
	public hasStrokes(): boolean {
		return this.strokes.length > 0;
	}

	/**
	 * 获取所有画笔线条（用于导出）
	 */
	public getStrokes(): BrushStroke[] {
		return this.strokes;
	}

	/**
	 * 将画笔渲染到指定 Canvas 上下文（用于导出）
	 * @param ctx - 2D Canvas 上下文
	 * @param scaleRatio - 画笔坐标到导出尺寸的缩放比
	 * @param strokeColor - 覆盖画笔颜色（导出画笔层时用白色）
	 */
	public renderToCanvas(
		ctx: CanvasRenderingContext2D,
		scaleRatio: number,
		strokeColor?: string,
	): void {
		for (const stroke of this.strokes) {
			if (stroke.points.length < 4) continue;

			ctx.strokeStyle = strokeColor ?? stroke.color;
			ctx.lineWidth = stroke.size * scaleRatio;
			ctx.lineCap = 'round';
			ctx.lineJoin = 'round';

			ctx.beginPath();
			for (let j = 0; j < stroke.points.length; j += 2) {
				const x = stroke.points[j] * scaleRatio;
				const y = stroke.points[j + 1] * scaleRatio;
				if (j === 0) {
					ctx.moveTo(x, y);
				} else {
					ctx.lineTo(x, y);
				}
			}
			ctx.stroke();
		}
	}

	// ===== 内部事件处理 =====

	private onPointerDown = (e: FederatedPointerEvent): void => {
		if (!this.enabled) return;
		e.stopPropagation();

		this.isDrawing = true;
		const local = this.container.toLocal(e.global);

		this.currentStroke = {
			points: [local.x, local.y],
			color: this.brushColor,
			size: this.brushSize,
		};
		this.strokes.push(this.currentStroke);
	};

	private onPointerMove = (e: FederatedPointerEvent): void => {
		if (!this.isDrawing || !this.currentStroke) return;
		e.stopPropagation();

		const local = this.container.toLocal(e.global);
		this.currentStroke.points.push(local.x, local.y);
		this.redrawGraphics();
	};

	private onPointerUp = (): void => {
		this.isDrawing = false;
		this.currentStroke = null;
	};

	/**
	 * 重绘所有画笔到 Graphics
	 */
	private redrawGraphics(): void {
		this.graphics.clear();
		for (const stroke of this.strokes) {
			if (stroke.points.length < 4) continue;
			this.graphics
				.setStrokeStyle({
					width: stroke.size,
					color: stroke.color,
					cap: 'round',
					join: 'round',
				})
				.moveTo(stroke.points[0], stroke.points[1]);

			for (let j = 2; j < stroke.points.length; j += 2) {
				this.graphics.lineTo(stroke.points[j], stroke.points[j + 1]);
			}
			this.graphics.stroke();
		}
	}

	/** 销毁资源 */
	public destroy(): void {
		this.disable();
		this.strokes = [];
		this.graphics.destroy();
	}
}
