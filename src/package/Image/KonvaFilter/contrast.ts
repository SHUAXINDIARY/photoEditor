import Konva from "konva";

// 简单缓存最近一次对比度对应的查找表，避免重复计算
let lastContrastValue: number | null = null;
let lastLUT: Uint8ClampedArray | null = null;

/**
 * 根据对比度值生成查找表（0~255 映射）
 * 使用非线性映射增强高对比度时的效果，但只计算 256 次
 */
function getContrastLUT(contrastValue: number): Uint8ClampedArray {
	// 缓存命中，直接复用
	if (lastLUT && lastContrastValue === contrastValue) {
		return lastLUT;
	}

	const lut = new Uint8ClampedArray(256);

	// 将 -100 到 100 转换为 -1 到 1
	const normalizedValue = contrastValue / 100;

	// 使用更强的映射曲线
	let contrastFactor: number;
	if (normalizedValue >= 0) {
		// 增强对比度：使用指数函数，范围 1.0 到 3.0
		contrastFactor = 1.0 + Math.pow(normalizedValue, 0.7) * 2.0;
	} else {
		// 降低对比度：使用平方根函数，范围 0.3 到 1.0
		const absValue = -normalizedValue;
		contrastFactor = 0.3 + (1.0 - 0.3) * (1.0 - Math.pow(absValue, 0.5));
	}

	const midpoint = 128;

	for (let i = 0; i < 256; i++) {
		const v = (i - midpoint) * contrastFactor + midpoint;
		// 手写 clamp，避免多次 Math.min/Math.max
		lut[i] = v < 0 ? 0 : v > 255 ? 255 : v;
	}

	lastContrastValue = contrastValue;
	lastLUT = lut;
	return lut;
}

/**
 * 增强对比度自定义滤镜（优化版）
 * - 使用查找表（LUT）减少每个像素的运算
 * - 避免在高像素图片上做大量 Math.pow / clamp 运算
 */
export function Contrast(this: any, imageData: ImageData) {
	const data = imageData.data;
	const len = data.length;

	// 从节点获取对比度值（-100 到 100）
	const contrastValue =
		this.contrast && typeof this.contrast === "function"
			? this.contrast()
			: this.contrast || 0;

	// 对比度为 0 时直接返回，避免不必要的遍历
	if (!contrastValue) return;

	const lut = getContrastLUT(contrastValue);

	// 使用查找表对 RGB 通道做 O(1) 映射
	for (let i = 0; i < len; i += 4) {
		data[i] = lut[data[i]]; // R
		data[i + 1] = lut[data[i + 1]]; // G
		data[i + 2] = lut[data[i + 2]]; // B
		// data[i + 3] 是 alpha，保持不变
	}
}

/**
 * 注册对比度滤镜到 Konva
 */
export function registerContrastFilter() {
	(Konva.Filters as any).Contrast = Contrast;
	// 定义滤镜的依赖属性
	((Konva.Filters as any).Contrast as any).deps = ['contrast'];
	
	// 注册 contrast 属性到 Konva.Image
	const KonvaAny = Konva as any;
	if (KonvaAny.Factory) {
		KonvaAny.Factory.addGetterSetter(
			Konva.Image,
			'contrast',
			0,
			KonvaAny.Validators?.getNumberValidator?.() || (() => true)
		);
	} else {
		// 如果 Factory 不可用，使用 Object.defineProperty
		Object.defineProperty(Konva.Image.prototype, 'contrast', {
			get: function() {
				return this.getAttr('contrast') || 0;
			},
			set: function(val: number) {
				this.setAttr('contrast', val);
			}
		});
	}
}

