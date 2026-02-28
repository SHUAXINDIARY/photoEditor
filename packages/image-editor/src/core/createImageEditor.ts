import type { IImageEditor, ImageEditorConfig, EditorEngine } from '../types';

/**
 * 创建图片编辑器的工厂选项
 */
export interface CreateImageEditorOptions extends ImageEditorConfig {
	/** 渲染引擎，默认 'konva' */
	engine?: EditorEngine;
}

/**
 * 图片编辑器工厂函数
 * @description 根据 engine 参数创建对应引擎的编辑器实例，
 * 返回统一的 IImageEditor 接口。业务层无需关心底层实现细节。
 *
 * @param container - DOM 容器元素
 * @param options - 编辑器配置（含引擎选择）
 * @returns IImageEditor 实例
 *
 * @example
 * // 使用 Konva 引擎（默认）
 * const editor = await createImageEditor(el, { width: 800, height: 600 });
 *
 * @example
 * // 使用 PixiJS 引擎（GPU 加速）
 * const editor = await createImageEditor(el, {
 *   width: 800,
 *   height: 600,
 *   engine: 'pixi',
 * });
 */
export async function createImageEditor(
	container: HTMLElement,
	options: CreateImageEditorOptions,
): Promise<IImageEditor> {
	const { engine = 'konva', ...config } = options;

	if (engine === 'pixi') {
		const { PixiImageEditor } = await import('../pixi/PixiImageEditor');
		return new PixiImageEditor(container, config);
	}

	const { KonvaImageEditorAdapter } = await import('./KonvaImageEditorAdapter');
	return new KonvaImageEditorAdapter(container, config);
}
