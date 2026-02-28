/**
 * @photoedit/image-editor
 * @description 图片编辑器核心包，支持 Konva (CPU) 和 PixiJS (GPU) 双引擎
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

export { createImageEditor } from './core/createImageEditor';
export type { CreateImageEditorOptions } from './core/createImageEditor';

export { KonvaImageEditorAdapter } from './core/KonvaImageEditorAdapter';

export { calcCanvasSize, calcImageFitLayout } from './core/canvasLayout';
export type { ImageFitLayout, ContainerSizeParams } from './core/canvasLayout';
