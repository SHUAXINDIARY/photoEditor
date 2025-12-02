import Konva from "konva";

/**
 * 阴影/高光滤镜
 * 调整图片中暗部（阴影）和亮部（高光）的亮度
 * @param imageData - 图片数据
 */
export function Shadow(this: any, imageData: ImageData) {
    const data = imageData.data;
    const shadowValue = this.shadow(); // -100 到 100

    if (shadowValue === 0) return;

    // 将 -100 到 100 映射到实际调整范围
    // 正值提亮阴影，负值压暗阴影
    const factor = shadowValue / 100; // -1 到 1

    for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];

        // 计算像素亮度 (使用感知亮度公式)
        const luminance = 0.299 * r + 0.587 * g + 0.114 * b;

        // 只影响暗部（阴影）
        // 亮度越低，调整幅度越大
        const shadowWeight = Math.max(0, 1 - luminance / 128); // 0-128 的像素受影响最大

        if (factor > 0) {
            // 正值：提亮阴影
            const adjustment = factor * shadowWeight * 80; // 最多提亮 80
            data[i] = Math.min(255, r + adjustment);
            data[i + 1] = Math.min(255, g + adjustment);
            data[i + 2] = Math.min(255, b + adjustment);
        } else {
            // 负值：压暗阴影
            const adjustment = Math.abs(factor) * shadowWeight * 80;
            data[i] = Math.max(0, r - adjustment);
            data[i + 1] = Math.max(0, g - adjustment);
            data[i + 2] = Math.max(0, b - adjustment);
        }
    }
}

/**
 * 注册阴影滤镜
 */
export function registerShadowFilter() {
    // 检查滤镜是否已注册
    if ((Konva.Filters as any).Shadow) {
        return;
    }

    // 注册到 Konva.Filters
    (Konva.Filters as any).Shadow = Shadow;

    // 为 Konva.Image 添加 shadow getter/setter
    if (!(Konva.Image.prototype as any).shadow) {
        (Konva.Image.prototype as any).shadow = function (val?: number) {
            if (val === undefined) {
                return this.getAttr("shadow") || 0;
            }
            this.setAttr("shadow", val);
            return this;
        };
    }

    console.log("[KonvaFilter] Shadow filter registered");
}

