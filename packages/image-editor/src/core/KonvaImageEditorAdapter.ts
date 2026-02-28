import { ImageEditor } from '../konva/ImageEditor';
import type { IImageEditor, ImageEditorConfig, ImageState } from '../types';

/**
 * Konva 编辑器适配器
 * @description 将现有的 Konva ImageEditor 包装为 IImageEditor 接口，
 * 使业务层可以通过统一接口无感切换 Konva / PixiJS 引擎
 */
export class KonvaImageEditorAdapter implements IImageEditor {
	private editor: ImageEditor;

	/** 图片状态变化回调 */
	get onImageStateChange(): (() => void) | undefined {
		return this.editor.onImageStateChange;
	}
	set onImageStateChange(fn: (() => void) | undefined) {
		this.editor.onImageStateChange = fn;
	}

	constructor(container: HTMLElement, config: ImageEditorConfig) {
		this.editor = new ImageEditor(container, config);
	}

	// ===== 图片加载与管理 =====

	public loadImage(url: string): Promise<void> {
		return this.editor.loadImage(url);
	}

	public clearImage(): void {
		this.editor.clearImage();
	}

	public updateSize(width: number, height: number): void {
		this.editor.updateSize(width, height);
	}

	// ===== 图片状态 =====

	public getImageState(): ImageState | null {
		return this.editor.getImageState();
	}

	public setImageState(state: ImageState): void {
		this.editor.setImageState(state);
	}

	// ===== 滤镜效果 =====

	public setContrast(value: number): void {
		this.editor.setContrast(value);
	}

	public setTemperature(value: number): void {
		this.editor.setTemperature(value);
	}

	public setSaturation(value: number): void {
		this.editor.setSaturation(value);
	}

	public setEnhance(value: number): void {
		this.editor.setEnhance(value);
	}

	public setBlur(value: number): void {
		this.editor.setBlur(value);
	}

	public setShadow(value: number): void {
		this.editor.setShadow(value);
	}

	public setHighlight(value: number): void {
		this.editor.setHighlight(value);
	}

	public resetFilters(): void {
		this.editor.resetFilters();
	}

	// ===== 画笔功能 =====

	public enableBrush(color = '#000000', size = 10): void {
		this.editor.enableBrush(color, size);
	}

	public disableBrush(): void {
		this.editor.disableBrush();
	}

	public setBrushSize(size: number): void {
		this.editor.setBrushSize(size);
	}

	public clearBrush(): void {
		this.editor.clearBrush();
	}

	// ===== 导出功能 =====

	public exportImage(mimeType?: string, quality?: number): string | null {
		return this.editor.exportImage(mimeType, quality);
	}

	public exportEditedImage(
		mimeType = 'image/png',
		quality?: number,
	): Promise<string> {
		return this.editor.exportEditedImage(mimeType, quality);
	}

	public exportBrushLayer(): Promise<string> {
		return this.editor.exportBrushLayer();
	}

	// ===== 资源清理 =====

	public destroy(): void {
		this.editor.destroy();
	}

	/**
	 * 获取底层 Konva ImageEditor 实例（仅在需要 Konva 特有功能时使用）
	 * @returns 原始 ImageEditor 实例
	 */
	public getKonvaEditor(): ImageEditor {
		return this.editor;
	}
}
