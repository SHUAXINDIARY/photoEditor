/**
 * 图片编辑器通用 API 层
 * @description 提供引擎无关的图片编辑器接口和工厂函数，
 * 支持在 Konva（CPU）和 PixiJS（GPU）之间切换
 */

export type {
	IImageEditor,
	ImageEditorConfig,
	ImageState,
	FilterType,
	FilterValues,
	EditorEngine,
} from './types';

export { DEFAULT_FILTER_VALUES } from './types';

export { createImageEditor } from './createImageEditor';
export type { CreateImageEditorOptions } from './createImageEditor';

export { KonvaImageEditorAdapter } from './KonvaImageEditorAdapter';
