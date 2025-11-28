import Konva from "konva";

/**
 * 增强对比度自定义滤镜
 * 使用更强的算法，使对比度调整效果更明显
 * @param imageData 图像数据
 */
export function Contrast(this: any, imageData: ImageData) {
	const data = imageData.data;
	const len = data.length;

	// 从节点获取对比度值（-100 到 100）
	const contrastValue = (this.contrast && typeof this.contrast === 'function') 
		? this.contrast() 
		: (this.contrast || 0);

	// 将 -100 到 100 转换为对比度系数
	// 使用非线性映射，使效果更明显
	// 正值增强对比度，负值降低对比度
	const normalizedValue = contrastValue / 100; // -1 到 1
	
	// 使用更强的映射曲线
	// 对于正值（增强对比度），使用指数函数放大效果
	// 对于负值（降低对比度），使用平方根函数
	let contrastFactor: number;
	if (normalizedValue >= 0) {
		// 增强对比度：使用指数函数，范围 1.0 到 3.0
		contrastFactor = 1.0 + Math.pow(normalizedValue, 0.7) * 2.0;
	} else {
		// 降低对比度：使用平方根函数，范围 0.3 到 1.0
		const absValue = Math.abs(normalizedValue);
		contrastFactor = 0.3 + (1.0 - 0.3) * (1.0 - Math.pow(absValue, 0.5));
	}

	// 应用对比度调整
	// 标准对比度公式：newValue = (oldValue - 128) * factor + 128
	// 使用 128 作为中点（50% 灰度）
	const midpoint = 128;

	for (let i = 0; i < len; i += 4) {
		// 对 RGB 通道分别应用对比度
		data[i] = Math.min(255, Math.max(0, (data[i] - midpoint) * contrastFactor + midpoint));     // R
		data[i + 1] = Math.min(255, Math.max(0, (data[i + 1] - midpoint) * contrastFactor + midpoint)); // G
		data[i + 2] = Math.min(255, Math.max(0, (data[i + 2] - midpoint) * contrastFactor + midpoint)); // B
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

