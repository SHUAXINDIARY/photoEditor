import Konva from "konva";

/**
 * 将色温（Kelvin）转换为 RGB
 */
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

/**
 * 获取白平衡增益
 */
function getWBGains(targetKelvin: number) {
	const white = temperature2rgb(targetKelvin); // 目标色温下的"白"
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

/**
 * 色温自定义滤镜
 * @param imageData 图像数据
 */
export function Temperature(this: any, imageData: ImageData) {
	const data = imageData.data;
	const len = data.length;

	// 从节点获取色温值
	const temperature = (this.temperature && typeof this.temperature === 'function') 
		? this.temperature() 
		: (this.temperature || 0);

	// 将 -100 到 100 映射到色温范围（Kelvin）
	// 中性色温：5500K（日光）
	// 暖色调（正值）：3000K - 5500K
	// 冷色调（负值）：5500K - 8000K
	const tempValue = temperature / 100; // -1 到 1

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

	// 应用增益到每个像素
	for (let i = 0; i < len; i += 4) {
		// 应用增益，限制调整幅度避免过度
		const rGain = Math.pow(gains.r, 0.6); // 限制到 60%
		const gGain = Math.pow(gains.g, 0.6);
		const bGain = Math.pow(gains.b, 0.6);

		data[i] = Math.min(255, Math.max(0, data[i] * rGain));     // R
		data[i + 1] = Math.min(255, Math.max(0, data[i + 1] * gGain)); // G
		data[i + 2] = Math.min(255, Math.max(0, data[i + 2] * bGain)); // B
		// data[i + 3] 是 alpha，保持不变
	}
}

/**
 * 注册色温滤镜到 Konva
 */
export function registerTemperatureFilter() {
	(Konva.Filters as any).Temperature = Temperature;
	// 定义滤镜的依赖属性
	((Konva.Filters as any).Temperature as any).deps = ['temperature'];
	
	// 注册 temperature 属性到 Konva.Image
	const KonvaAny = Konva as any;
	if (KonvaAny.Factory) {
		KonvaAny.Factory.addGetterSetter(
			Konva.Image,
			'temperature',
			0,
			KonvaAny.Validators?.getNumberValidator?.() || (() => true)
		);
	}
}

