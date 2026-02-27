/**
 * 画布布局计算模块
 * @description 引擎无关的画布尺寸计算与图片 fit 布局算法。
 * 无论使用 Konva 还是 PixiJS，均通过此模块得到一致的初始化参数，
 * 确保两套引擎下图片位置、缩放、居中行为完全对齐。
 */

/**
 * 图片在画布上的 fit 布局结果
 * @description 包含图片适配画布后的缩放、偏移和显示尺寸
 */
export interface ImageFitLayout {
	/** 图片在画布上的 X 偏移（居中后） */
	x: number;
	/** 图片在画布上的 Y 偏移（居中后） */
	y: number;
	/** 图片适配画布所需的缩放比例（<= 1，不放大） */
	scale: number;
	/** 缩放后的显示宽度 */
	displayWidth: number;
	/** 缩放后的显示高度 */
	displayHeight: number;
	/** 原始图片宽度 */
	originalWidth: number;
	/** 原始图片高度 */
	originalHeight: number;
}

/**
 * 画布容器尺寸参数
 */
export interface ContainerSizeParams {
	/** 视口/窗口宽度 */
	viewportWidth: number;
	/** 视口/窗口高度 */
	viewportHeight: number;
	/** 水平方向留白（左右合计），默认 40 */
	horizontalPadding?: number;
	/** 垂直方向留白（上下合计，含顶栏高度等），默认 200 */
	verticalPadding?: number;
}

/**
 * 计算画布容器尺寸
 * @description 根据视口大小和留白参数计算画布可用区域。
 * 所有引擎使用同一套尺寸，保证画布大小一致。
 *
 * @param params - 容器尺寸参数
 * @returns 画布宽高
 *
 * @example
 * const { width, height } = calcCanvasSize({
 *   viewportWidth: window.innerWidth,
 *   viewportHeight: window.innerHeight,
 * });
 */
export function calcCanvasSize(params: ContainerSizeParams): {
	width: number;
	height: number;
} {
	const {
		viewportWidth,
		viewportHeight,
		horizontalPadding = 40,
		verticalPadding = 200,
	} = params;

	return {
		width: Math.max(1, viewportWidth - horizontalPadding),
		height: Math.max(1, viewportHeight - verticalPadding),
	};
}

/**
 * 计算图片在画布上的 fit 布局
 * @description 将原始图片按比例缩小（不放大）以适配画布，并居中放置。
 * 此为两套引擎共享的核心布局算法，确保切换引擎后图片位置一致。
 *
 * @param canvasWidth - 画布宽度
 * @param canvasHeight - 画布高度
 * @param imageWidth - 原始图片宽度
 * @param imageHeight - 原始图片高度
 * @returns 图片 fit 布局结果
 *
 * @example
 * const layout = calcImageFitLayout(800, 600, 1920, 1080);
 * // layout.scale ≈ 0.417, layout.x ≈ 0, layout.y ≈ 75
 */
export function calcImageFitLayout(
	canvasWidth: number,
	canvasHeight: number,
	imageWidth: number,
	imageHeight: number,
): ImageFitLayout {
	const scale = Math.min(
		canvasWidth / imageWidth,
		canvasHeight / imageHeight,
		1,
	);

	const displayWidth = imageWidth * scale;
	const displayHeight = imageHeight * scale;
	const x = (canvasWidth - displayWidth) / 2;
	const y = (canvasHeight - displayHeight) / 2;

	return {
		x,
		y,
		scale,
		displayWidth,
		displayHeight,
		originalWidth: imageWidth,
		originalHeight: imageHeight,
	};
}
