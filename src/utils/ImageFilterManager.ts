import Konva from "konva";

/**
 * 图片滤镜管理模块
 * 负责对当前图片节点应用对比度 / 色温 / 饱和度 / 模糊 / 增强等效果
 * 与画布初始化、画笔等基础能力解耦
 */
export class ImageFilterManager {
    private imageNode: Konva.Image | null = null;
    private layer: Konva.Layer | null = null;

    private currentContrast: number = 0;
    private currentTemperature: number = 0;
    private currentEnhance: number = 0;
    private currentSaturation: number = 0;
    private currentBlur: number = 0;

    private rafId: number | null = null;
    private isUpdating: boolean = false;

    /**
     * 更新当前生效的图片节点与所在图层
     * 在图片重新加载 / 清除时需要调用
     */
    public setImageContext(
        imageNode: Konva.Image | null,
        layer: Konva.Layer | null
    ) {
        this.imageNode = imageNode;
        this.layer = layer;
    }

    /**
     * 内部：调度一次滤镜应用（使用 requestAnimationFrame 合并频繁更新）
     */
    private scheduleApplyFilters(): void {
        if (!this.imageNode || this.isUpdating) return;

        // 取消之前的动画帧请求
        if (this.rafId !== null) {
            cancelAnimationFrame(this.rafId);
        }

        this.rafId = requestAnimationFrame(() => {
            this.rafId = null;
            this.applyFiltersNow();
        });
    }

    /**
     * 同步应用所有滤镜到当前图片节点
     */
    private applyFiltersNow(): void {
        const imageNode = this.imageNode;
        if (!imageNode) return;

        this.isUpdating = true;

        try {
            const filters: any[] = [];
            const hasContrast = this.currentContrast !== 0;
            const hasTemperature = this.currentTemperature !== 0;
            const hasSaturation = this.currentSaturation !== 0;
            const hasBlur = this.currentBlur !== 0;

            // 应用对比度滤镜（使用自定义滤镜，效果更强）
            if (hasContrast) {
                filters.push((Konva.Filters as any).Contrast);
            }

            // 应用色温自定义滤镜
            if (hasTemperature) {
                filters.push((Konva.Filters as any).Temperature);
            }

            // 应用增强滤镜（始终应用，通过数值控制强度）
            filters.push(Konva.Filters.Enhance);

            // 应用饱和度滤镜（使用 HSL 滤镜）
            if (hasSaturation) {
                filters.push(Konva.Filters.HSL);
            }

            // 应用模糊滤镜
            if (hasBlur) {
                filters.push(Konva.Filters.Blur);
            }

            // 先设置 filters 数组
            imageNode.filters(filters);

            // 然后设置对比度参数（使用自定义滤镜，直接使用 -100 到 100 的值）
            if (hasContrast) {
                // 自定义对比度滤镜直接接受 -100 到 100 的值
                if (typeof (imageNode as any).contrast === "function") {
                    (imageNode as any).contrast(this.currentContrast);
                } else {
                    (imageNode as any).contrast = this.currentContrast;
                }
            } else {
                if (typeof (imageNode as any).contrast === "function") {
                    (imageNode as any).contrast(0);
                } else {
                    (imageNode as any).contrast = 0;
                }
            }

            // 设置色温参数（使用自定义滤镜）
            if (hasTemperature) {
                // 直接设置色温值，自定义滤镜会处理
                if (typeof (imageNode as any).temperature === "function") {
                    (imageNode as any).temperature(this.currentTemperature);
                } else {
                    (imageNode as any).temperature = this.currentTemperature;
                }
            } else {
                if (typeof (imageNode as any).temperature === "function") {
                    (imageNode as any).temperature(0);
                } else {
                    (imageNode as any).temperature = 0;
                }
            }

            // 设置增强参数（范围 0 到 2）
            // Konva Enhance 滤镜：0 为无增强，1 为轻微增强，>1 为强增强
            // 将 0 到 100 映射到 0 到 2
            const enhanceValue = Math.min(
                2,
                Math.max(0, this.currentEnhance / 50)
            );
            imageNode.enhance(enhanceValue);

            // 设置饱和度参数（使用 HSL 滤镜）
            // HSL 滤镜的饱和度范围是 -1 到 1
            if (hasSaturation) {
                const saturationValue = Math.max(
                    -1,
                    Math.min(1, this.currentSaturation / 100)
                );
                imageNode.saturation(saturationValue);
                // HSL 滤镜需要设置其他参数为 0
                imageNode.hue(0);
                imageNode.luminance(0);
            } else {
                imageNode.saturation(0);
                imageNode.hue(0);
                imageNode.luminance(0);
            }

            // 设置模糊参数（范围 0 到 20）
            if (hasBlur) {
                // 将 0 到 100 转换为 0 到 20
                imageNode.blurRadius(this.currentBlur * 0.2);
            } else {
                imageNode.blurRadius(0);
            }

            // 清除缓存并重新缓存（重要：应用滤镜后必须重新缓存）
            imageNode.clearCache();
            imageNode.cache();

            // 重绘画布
            if (this.layer) {
                this.layer.draw();
            }
        } finally {
            this.isUpdating = false;
        }
    }

    // ===== 对外暴露的滤镜设置接口 =====

    /** 设置对比度：-100 ~ 100，0 为原始值 */
    public setContrast(contrast: number): void {
        this.currentContrast = contrast;
        this.scheduleApplyFilters();
    }

    /** 设置色温：-100 ~ 100，-100 冷色，100 暖色 */
    public setTemperature(temperature: number): void {
        this.currentTemperature = temperature;
        this.scheduleApplyFilters();
    }

    /** 设置增强：0 ~ 100，内部映射到 0 ~ 2 */
    public setEnhance(enhance: number): void {
        this.currentEnhance = enhance;
        this.scheduleApplyFilters();
    }

    /** 设置饱和度：-100 ~ 100，0 为原始值 */
    public setSaturation(saturation: number): void {
        this.currentSaturation = saturation;
        this.scheduleApplyFilters();
    }

    /** 设置模糊：0 ~ 100，0 为原始值 */
    public setBlur(blur: number): void {
        this.currentBlur = blur;
        this.scheduleApplyFilters();
    }

    /** 重置所有滤镜 */
    public reset(): void {
        this.currentContrast = 0;
        this.currentTemperature = 0;
        this.currentEnhance = 0;
        this.currentSaturation = 0;
        this.currentBlur = 0;
        this.scheduleApplyFilters();
    }
}
