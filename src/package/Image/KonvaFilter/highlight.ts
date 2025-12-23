import Konva from "konva";

/**
 * 高光滤镜
 * 调整图片中亮部（高光）的亮度
 * @param imageData - 图片数据
 */
export function Highlight(this: any, imageData: ImageData) {
    const data = imageData.data;
    const highlightValue = this.highlight(); // -100 到 100

    if (highlightValue === 0) return;

    // 将 -100 到 100 映射到实际调整范围
    // 正值提亮高光，负值压暗高光
    const factor = highlightValue / 100; // -1 到 1

    for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];

        // 计算像素亮度 (使用感知亮度公式)
        const luminance = 0.299 * r + 0.587 * g + 0.114 * b;

        // 只影响亮部（高光）
        // 亮度越高，调整幅度越大
        const highlightWeight = Math.max(0, (luminance - 128) / 127); // 128-255 的像素受影响最大

        if (factor > 0) {
            // 正值：提亮高光
            const adjustment = factor * highlightWeight * 60; // 最多提亮 60
            data[i] = Math.min(255, r + adjustment);
            data[i + 1] = Math.min(255, g + adjustment);
            data[i + 2] = Math.min(255, b + adjustment);
        } else {
            // 负值：压暗高光（恢复过曝细节）
            const adjustment = Math.abs(factor) * highlightWeight * 80;
            data[i] = Math.max(0, r - adjustment);
            data[i + 1] = Math.max(0, g - adjustment);
            data[i + 2] = Math.max(0, b - adjustment);
        }
    }
}

/**
 * 注册高光滤镜
 */
export function registerHighlightFilter() {
    // 检查滤镜是否已注册
    if ((Konva.Filters as any).Highlight) {
        return;
    }

    // 注册到 Konva.Filters
    (Konva.Filters as any).Highlight = Highlight;

    // 为 Konva.Image 添加 highlight getter/setter
    if (!(Konva.Image.prototype as any).highlight) {
        (Konva.Image.prototype as any).highlight = function (val?: number) {
            if (val === undefined) {
                return this.getAttr("highlight") || 0;
            }
            this.setAttr("highlight", val);
            return this;
        };
    }

    console.log("[KonvaFilter] Highlight filter registered");
}

