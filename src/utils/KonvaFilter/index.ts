import { registerTemperatureFilter } from "./temperature";
import { registerTintFilter } from "./tint";

/**
 * 注册所有自定义滤镜
 */
export function registerCustomFilters() {
	registerTemperatureFilter();
	registerTintFilter();
}

// 导出滤镜函数供外部使用
export { Temperature } from "./temperature";
export { Tint } from "./tint";

