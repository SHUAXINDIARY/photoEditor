/**
 * 图片编辑器通用类型定义
 * @description 为 Konva 和 PixiJS 两种引擎提供统一的类型约束
 */

/** 编辑器引擎类型 */
export type EditorEngine = 'konva' | 'pixi';

/** 编辑器初始化配置 */
export interface ImageEditorConfig {
	/** 画布宽度（像素） */
	width: number;
	/** 画布高度（像素） */
	height: number;
	/** 是否启用旋转控制，默认 false */
	rotateEnabled?: boolean;
}

/**
 * 图片状态（位置与缩放）
 * @description 用于保存 / 恢复图片在画布上的变换状态
 */
export interface ImageState {
	/** 图片 X 坐标 */
	x: number;
	/** 图片 Y 坐标 */
	y: number;
	/** X 方向缩放 */
	scaleX: number;
	/** Y 方向缩放 */
	scaleY: number;
}

/**
 * 滤镜类型枚举
 * @description 与滤镜设置方法一一对应
 */
export type FilterType =
	| 'contrast'
	| 'temperature'
	| 'saturation'
	| 'enhance'
	| 'blur'
	| 'shadow'
	| 'highlight';

/**
 * 滤镜参数集合
 * @description 所有滤镜的当前值，key 为 FilterType
 */
export interface FilterValues {
	/** 对比度：-100 ~ 100，0 为原始值 */
	contrast: number;
	/** 色温：-100 ~ 100，-100 冷色，100 暖色 */
	temperature: number;
	/** 饱和度：-100 ~ 100，0 为原始值 */
	saturation: number;
	/** 增强：0 ~ 100 */
	enhance: number;
	/** 模糊：0 ~ 100 */
	blur: number;
	/** 阴影：-100 ~ 100，负值压暗，正值提亮 */
	shadow: number;
	/** 高光：-100 ~ 100，负值压暗，正值提亮 */
	highlight: number;
}

/** 默认滤镜值 */
export const DEFAULT_FILTER_VALUES: FilterValues = {
	contrast: 0,
	temperature: 0,
	saturation: 0,
	enhance: 0,
	blur: 0,
	shadow: 0,
	highlight: 0,
};

/**
 * 图片编辑器通用接口
 * @description 所有引擎实现（Konva / PixiJS）都必须实现此接口，
 * 业务层仅依赖此接口编程，实现引擎无关的切换
 */
export interface IImageEditor {
	/** 图片状态变化回调（拖拽、缩放时触发） */
	onImageStateChange?: () => void;

	// ===== 图片加载与管理 =====

	/**
	 * 加载图片
	 * @param url - 图片地址（支持 Data URL）
	 */
	loadImage(url: string): Promise<void>;

	/**
	 * 清除当前图片
	 */
	clearImage(): void;

	/**
	 * 更新画布尺寸
	 * @param width - 新宽度
	 * @param height - 新高度
	 */
	updateSize(width: number, height: number): void;

	// ===== 图片状态 =====

	/**
	 * 获取图片状态（位置、缩放）
	 * @returns 图片状态，未加载时返回 null
	 */
	getImageState(): ImageState | null;

	/**
	 * 设置图片状态（用于恢复保存的状态）
	 * @param state - 要恢复的图片状态
	 */
	setImageState(state: ImageState): void;

	// ===== 滤镜效果 =====

	/**
	 * 设置对比度
	 * @param value - 对比度值，范围 -100 到 100，0 为原始值
	 */
	setContrast(value: number): void;

	/**
	 * 设置色温
	 * @param value - 色温值，范围 -100 到 100
	 */
	setTemperature(value: number): void;

	/**
	 * 设置饱和度
	 * @param value - 饱和度值，范围 -100 到 100
	 */
	setSaturation(value: number): void;

	/**
	 * 设置增强
	 * @param value - 增强值，范围 0 到 100
	 */
	setEnhance(value: number): void;

	/**
	 * 设置模糊
	 * @param value - 模糊值，范围 0 到 100
	 */
	setBlur(value: number): void;

	/**
	 * 设置阴影
	 * @param value - 阴影强度，范围 -100 到 100
	 */
	setShadow(value: number): void;

	/**
	 * 设置高光
	 * @param value - 高光强度，范围 -100 到 100
	 */
	setHighlight(value: number): void;

	/**
	 * 重置所有滤镜效果
	 */
	resetFilters(): void;

	// ===== 画笔功能 =====

	/**
	 * 开启画笔模式
	 * @param color - 画笔颜色，默认 '#000000'
	 * @param size - 画笔粗细，默认 10
	 */
	enableBrush(color?: string, size?: number): void;

	/**
	 * 关闭画笔模式
	 */
	disableBrush(): void;

	/**
	 * 设置画笔粗细
	 * @param size - 画笔粗细，范围 1 到 50
	 */
	setBrushSize(size: number): void;

	/**
	 * 清除所有画笔痕迹
	 */
	clearBrush(): void;

	// ===== 导出功能 =====

	/**
	 * 导出当前画布为 Data URL（包含缩放）
	 * @param mimeType - 图片 MIME 类型
	 * @param quality - 图片质量 0~1
	 * @returns Data URL 或 null
	 */
	exportImage(mimeType?: string, quality?: number): string | null;

	/**
	 * 导出编辑后完整图片（原始尺寸，包含滤镜和画笔）
	 * @param mimeType - 图片 MIME 类型
	 * @param quality - 图片质量 0~1
	 * @returns Data URL
	 */
	exportEditedImage(mimeType?: string, quality?: number): Promise<string>;

	/**
	 * 导出画笔图层（黑色背景 + 白色画笔，原始尺寸）
	 * @returns Data URL
	 */
	exportBrushLayer(): Promise<string>;

	// ===== 资源清理 =====

	/**
	 * 销毁编辑器，清理所有资源
	 */
	destroy(): void;
}
