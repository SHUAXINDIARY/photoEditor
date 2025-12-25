/**
 * 视频滤镜选项类型定义
 * 所有效果值都是可选的，默认值为 1.0（或 0 表示无效果）
 */
export interface VideoFilterOptions {
	/** 倍速 (0.25 - 4.0, 默认 1.0) */
	speed?: number;
	/** 对比度 (0.5 - 2.0, 默认 1.0) */
	contrast?: number;
	/** 饱和度 (0 - 3.0, 默认 1.0) */
	saturation?: number;
	/** 色温 (-1.0 到 1.0, 默认 0, 负值偏冷/蓝，正值偏暖/黄) */
	temperature?: number;
	/** 阴影 (0 - 2.0, 默认 1.0, <1 压暗阴影, >1 提亮阴影) */
	shadows?: number;
	/** 高光 (0 - 2.0, 默认 1.0, <1 压暗高光, >1 提亮高光) */
	highlights?: number;
}

/**
 * 效果默认值
 */
export const DEFAULT_FILTER_VALUES: Required<VideoFilterOptions> = {
	speed: 1.0,
	contrast: 1.0,
	saturation: 1.0,
	temperature: 0,
	shadows: 1.0,
	highlights: 1.0,
};

/**
 * 检查滤镜选项是否都是默认值
 */
export function isDefaultFilters(options: VideoFilterOptions): boolean {
	return (
		(options.speed ?? DEFAULT_FILTER_VALUES.speed) === DEFAULT_FILTER_VALUES.speed &&
		(options.contrast ?? DEFAULT_FILTER_VALUES.contrast) === DEFAULT_FILTER_VALUES.contrast &&
		(options.saturation ?? DEFAULT_FILTER_VALUES.saturation) === DEFAULT_FILTER_VALUES.saturation &&
		(options.temperature ?? DEFAULT_FILTER_VALUES.temperature) === DEFAULT_FILTER_VALUES.temperature &&
		(options.shadows ?? DEFAULT_FILTER_VALUES.shadows) === DEFAULT_FILTER_VALUES.shadows &&
		(options.highlights ?? DEFAULT_FILTER_VALUES.highlights) === DEFAULT_FILTER_VALUES.highlights
	);
}

/**
 * 获取非默认值的效果列表（用于生成文件名等）
 */
export function getActiveEffects(options: VideoFilterOptions): string[] {
	const effects: string[] = [];
	if ((options.speed ?? 1.0) !== 1.0) effects.push(`speed${options.speed}`);
	if ((options.contrast ?? 1.0) !== 1.0) effects.push(`contrast${options.contrast?.toFixed(2)}`);
	if ((options.saturation ?? 1.0) !== 1.0) effects.push(`saturation${options.saturation?.toFixed(2)}`);
	if ((options.temperature ?? 0) !== 0) effects.push(`temp${options.temperature?.toFixed(2)}`);
	if ((options.shadows ?? 1.0) !== 1.0) effects.push(`shadows${options.shadows?.toFixed(2)}`);
	if ((options.highlights ?? 1.0) !== 1.0) effects.push(`highlights${options.highlights?.toFixed(2)}`);
	return effects;
}

/**
 * 获取效果描述列表（用于提示信息）
 */
export function getEffectDescriptions(options: VideoFilterOptions): string[] {
	const descriptions: string[] = [];
	if ((options.speed ?? 1.0) !== 1.0) descriptions.push(`${options.speed}x 倍速`);
	if ((options.contrast ?? 1.0) !== 1.0) descriptions.push(`对比度 ${options.contrast?.toFixed(2)}`);
	if ((options.saturation ?? 1.0) !== 1.0) descriptions.push(`饱和度 ${options.saturation?.toFixed(2)}`);
	if ((options.temperature ?? 0) !== 0) {
		const temp = options.temperature ?? 0;
		descriptions.push(`色温 ${temp > 0 ? '+' : ''}${temp.toFixed(2)}`);
	}
	if ((options.shadows ?? 1.0) !== 1.0) descriptions.push(`阴影 ${options.shadows?.toFixed(2)}`);
	if ((options.highlights ?? 1.0) !== 1.0) descriptions.push(`高光 ${options.highlights?.toFixed(2)}`);
	return descriptions;
}

