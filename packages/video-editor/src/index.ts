/**
 * @photoedit/video-editor
 * @description 视频编辑器核心包，支持 FFmpeg (WASM) 和 WebAV (WebCodecs) 双引擎
 */

export { VideoEditor, type VideoProcessingMode } from './VideoEditor';

export type { VideoFilterOptions } from './types';
export {
	DEFAULT_FILTER_VALUES,
	isDefaultFilters,
	getActiveEffects,
	getEffectDescriptions,
} from './types';

export { FFmpegWrapper } from './ffmpeg';
export { WebAVWrapper } from './webav';

export type { FilterParams } from './shaders';
export { VERTEX_SHADER, FRAGMENT_SHADER, DEFAULT_FILTER_PARAMS } from './shaders';
