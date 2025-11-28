import Konva from "konva";

/**
 * 色调自定义滤镜
 * @param imageData 图像数据
 */
export function Tint(this: any, imageData: ImageData) {
	const data = imageData.data;
	const len = data.length;

	// 从节点获取色调值
	const tint = (this.tint && typeof this.tint === 'function') 
		? this.tint() 
		: (this.tint || 0);

	// 将 -100 到 100 映射到色调调整
	const tintValue = tint / 100; // -1 到 1

	// 使用平滑曲线
	const smoothCurve = (x: number): number => {
		return Math.tanh(x * 1.2);
	};

	const curveValue = smoothCurve(tintValue);

	// 色调调整：在绿色和洋红色之间调整
	// 正值增加洋红色（减少绿色），负值增加绿色（减少洋红色）
	const greenAdjust = -curveValue * 0.3;  // 绿色调整
	const redAdjust = curveValue * 0.15;    // 红色调整
	const blueAdjust = curveValue * 0.15;   // 蓝色调整

	// 应用调整到每个像素
	for (let i = 0; i < len; i += 4) {
		// 计算调整后的值
		let r = data[i] + redAdjust * 255;
		let g = data[i + 1] + greenAdjust * 255;
		let b = data[i + 2] + blueAdjust * 255;

		// 限制在有效范围
		data[i] = Math.min(255, Math.max(0, r));     // R
		data[i + 1] = Math.min(255, Math.max(0, g)); // G
		data[i + 2] = Math.min(255, Math.max(0, b)); // B
		// data[i + 3] 是 alpha，保持不变
	}
}

/**
 * 注册色调滤镜到 Konva
 */
export function registerTintFilter() {
	(Konva.Filters as any).Tint = Tint;
	// 定义滤镜的依赖属性
	((Konva.Filters as any).Tint as any).deps = ['tint'];
	
	// 注册 tint 属性到 Konva.Image
	const KonvaAny = Konva as any;
	if (KonvaAny.Factory) {
		KonvaAny.Factory.addGetterSetter(
			Konva.Image,
			'tint',
			0,
			KonvaAny.Validators?.getNumberValidator?.() || (() => true)
		);
	}
}

