import { registerTemperatureFilter } from "./temperature";
import { registerTintFilter } from "./tint";
import { registerContrastFilter } from "./contrast";

/**
 * 注册所有自定义滤镜
 */
export function registerCustomFilters() {
	registerTemperatureFilter();
	registerTintFilter();
	registerContrastFilter();
}

// 导出滤镜函数供外部使用
export { Temperature } from "./temperature";
export { Tint } from "./tint";
export { Contrast } from "./contrast";

