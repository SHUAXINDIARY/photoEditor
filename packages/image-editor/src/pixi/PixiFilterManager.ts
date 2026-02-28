import { Filter, GlProgram, BlurFilter } from 'pixi.js';
import type { Sprite } from 'pixi.js';
import { adjustmentFragmentShader, defaultVertexShader } from './shaders';

/**
 * PixiJS 滤镜管理器
 * @description 使用 WebGL shader 在 GPU 上实时处理滤镜效果，
 * 所有非模糊滤镜合并为单个 GPU pass 执行
 */
export class PixiFilterManager {
	private sprite: Sprite | null = null;
	private adjustmentFilter: Filter | null = null;
	private blurFilter: BlurFilter | null = null;

	private currentContrast = 0;
	private currentTemperature = 0;
	private currentSaturation = 0;
	private currentEnhance = 0;
	private currentBlur = 0;
	private currentShadow = 0;
	private currentHighlight = 0;

	private rafId: number | null = null;

	/**
	 * 更新当前生效的 Sprite 引用
	 * @param sprite - 图片 Sprite 节点
	 */
	public setSpriteContext(sprite: Sprite | null): void {
		if (this.sprite === sprite) return;

		// 先停止任何 pending 的 rAF，避免下一帧访问已销毁资源
		if (this.rafId !== null) {
			cancelAnimationFrame(this.rafId);
			this.rafId = null;
		}

		// 切换/清理前，必须把旧 sprite 上的 filters 清空，
		// 否则 Pixi 在下一次渲染时可能仍尝试 useProgram 已 destroy 的 program
		if (this.sprite) {
			this.sprite.filters = [];
		}

		// 销毁旧滤镜，避免 program 泄漏/复用已失效资源
		this.adjustmentFilter?.destroy();
		this.blurFilter?.destroy();
		this.adjustmentFilter = null;
		this.blurFilter = null;

		this.sprite = sprite;
		if (sprite) {
			this.initFilters();
			this.applyFiltersNow();
		}
	}

	/**
	 * 初始化 GPU 滤镜
	 */
	private initFilters(): void {
		this.adjustmentFilter = new Filter({
			glProgram: new GlProgram({
				fragment: adjustmentFragmentShader,
				vertex: defaultVertexShader,
			}),
			resources: {
				adjustUniforms: {
					uContrast: { value: 0, type: 'f32' },
					uTemperature: { value: 0, type: 'f32' },
					uSaturation: { value: 0, type: 'f32' },
					uEnhance: { value: 0, type: 'f32' },
					uShadow: { value: 0, type: 'f32' },
					uHighlight: { value: 0, type: 'f32' },
				},
			},
		});

		this.blurFilter = new BlurFilter({ strength: 0, quality: 4 });
	}

	/**
	 * 调度一次滤镜更新（合并频繁调用）
	 */
	private scheduleApply(): void {
		if (!this.sprite) return;
		if (this.rafId !== null) {
			cancelAnimationFrame(this.rafId);
		}
		this.rafId = requestAnimationFrame(() => {
			this.rafId = null;
			this.applyFiltersNow();
		});
	}

	/**
	 * 同步应用所有滤镜到 Sprite
	 */
	private applyFiltersNow(): void {
		if (!this.sprite || !this.adjustmentFilter || !this.blurFilter) return;

		const uniforms = this.adjustmentFilter.resources.adjustUniforms.uniforms;
		uniforms.uContrast = this.currentContrast;
		uniforms.uTemperature = this.currentTemperature;
		uniforms.uSaturation = this.currentSaturation;
		uniforms.uEnhance = this.currentEnhance;
		uniforms.uShadow = this.currentShadow;
		uniforms.uHighlight = this.currentHighlight;

		const hasAdjustment =
			Math.abs(this.currentContrast) > 0.5 ||
			Math.abs(this.currentTemperature) > 0.5 ||
			Math.abs(this.currentSaturation) > 0.5 ||
			this.currentEnhance > 0.5 ||
			Math.abs(this.currentShadow) > 0.5 ||
			Math.abs(this.currentHighlight) > 0.5;

		const hasBlur = this.currentBlur > 0.5;
		this.blurFilter.strength = this.currentBlur * 0.2;

		const filters: Filter[] = [];
		if (hasAdjustment) filters.push(this.adjustmentFilter);
		if (hasBlur) filters.push(this.blurFilter);

		this.sprite.filters = filters.length > 0 ? filters : [];
	}

	/**
	 * 获取滤镜的克隆实例（用于导出时对临时 Sprite 应用相同效果）
	 * @returns 当前滤镜列表的副本
	 */
	public cloneFilters(): Filter[] {
		const filters: Filter[] = [];

		const hasAdjustment =
			Math.abs(this.currentContrast) > 0.5 ||
			Math.abs(this.currentTemperature) > 0.5 ||
			Math.abs(this.currentSaturation) > 0.5 ||
			this.currentEnhance > 0.5 ||
			Math.abs(this.currentShadow) > 0.5 ||
			Math.abs(this.currentHighlight) > 0.5;

		if (hasAdjustment) {
			const clone = new Filter({
				glProgram: new GlProgram({
					fragment: adjustmentFragmentShader,
					vertex: defaultVertexShader,
				}),
				resources: {
					adjustUniforms: {
						uContrast: { value: this.currentContrast, type: 'f32' },
						uTemperature: { value: this.currentTemperature, type: 'f32' },
						uSaturation: { value: this.currentSaturation, type: 'f32' },
						uEnhance: { value: this.currentEnhance, type: 'f32' },
						uShadow: { value: this.currentShadow, type: 'f32' },
						uHighlight: { value: this.currentHighlight, type: 'f32' },
					},
				},
			});
			filters.push(clone);
		}

		if (this.currentBlur > 0.5) {
			filters.push(new BlurFilter({ strength: this.currentBlur * 0.2, quality: 4 }));
		}

		return filters;
	}

	// ===== 对外暴露的滤镜设置接口 =====

	/** 设置对比度：-100 ~ 100 */
	public setContrast(value: number): void {
		this.currentContrast = value;
		this.scheduleApply();
	}

	/** 设置色温：-100 ~ 100 */
	public setTemperature(value: number): void {
		this.currentTemperature = value;
		this.scheduleApply();
	}

	/** 设置饱和度：-100 ~ 100 */
	public setSaturation(value: number): void {
		this.currentSaturation = value;
		this.scheduleApply();
	}

	/** 设置增强：0 ~ 100 */
	public setEnhance(value: number): void {
		this.currentEnhance = value;
		this.scheduleApply();
	}

	/** 设置模糊：0 ~ 100 */
	public setBlur(value: number): void {
		this.currentBlur = value;
		this.scheduleApply();
	}

	/** 设置阴影：-100 ~ 100 */
	public setShadow(value: number): void {
		this.currentShadow = value;
		this.scheduleApply();
	}

	/** 设置高光：-100 ~ 100 */
	public setHighlight(value: number): void {
		this.currentHighlight = value;
		this.scheduleApply();
	}

	/** 重置所有滤镜 */
	public reset(): void {
		this.currentContrast = 0;
		this.currentTemperature = 0;
		this.currentSaturation = 0;
		this.currentEnhance = 0;
		this.currentBlur = 0;
		this.currentShadow = 0;
		this.currentHighlight = 0;
		this.scheduleApply();
	}

	/** 销毁资源 */
	public destroy(): void {
		// 复用统一的清理逻辑：清空 sprite.filters + destroy filters
		this.setSpriteContext(null);
	}
}
