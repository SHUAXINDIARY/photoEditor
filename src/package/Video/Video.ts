import { FFmpegWrapper } from "./ffmpeg";
import { WebAVWrapper } from "./webav";

/**
 * 视频处理模式
 */
export type VideoProcessingMode = "ffmpeg" | "webav";

/**
 * 视频处理包装器接口
 */
interface VideoWrapper {
  load(): Promise<void>;
  getProgress(): number;
  setProgressCallback(callback: ((progress: number) => void) | null): void;
  changeSpeed(inputFile: File, speed: number): Promise<Blob>;
  changeContrast(inputFile: File, contrast: number): Promise<Blob>;
  applyFilters(inputFile: File, options: { speed?: number; contrast?: number }): Promise<Blob>;
  destroy(): Promise<void>;
}

/**
 * 视频编辑器类，提供业务层接口
 * 支持 FFmpeg 和 WebAV 两种底层实现
 */
export class VideoEditor {
  private wrapper: VideoWrapper;
  private mode: VideoProcessingMode;
  private isLoading: boolean = false;
  private isLoaded: boolean = false;
  private loadProgress: number = 0;
  private loadError: string = "";
  private progressInterval: ReturnType<typeof setInterval> | null = null;

  constructor(mode: VideoProcessingMode = "ffmpeg") {
    this.mode = mode;
    this.wrapper = this.createWrapper(mode);
  }

  /**
   * 创建对应的包装器实例
   */
  private createWrapper(mode: VideoProcessingMode): VideoWrapper {
    switch (mode) {
      case "webav":
        return new WebAVWrapper();
      case "ffmpeg":
      default:
        return new FFmpegWrapper();
    }
  }

  /**
   * 获取当前模式
   */
  getMode(): VideoProcessingMode {
    return this.mode;
  }

  /**
   * 切换模式（需要重新初始化）
   */
  async switchMode(mode: VideoProcessingMode): Promise<void> {
    if (this.mode === mode) {
      return;
    }

    // 销毁旧的包装器
    if (this.wrapper) {
      await this.wrapper.destroy();
    }

    // 创建新的包装器
    this.mode = mode;
    this.wrapper = this.createWrapper(mode);
    this.isLoaded = false;
    this.isLoading = false;
    this.loadProgress = 0;
    this.loadError = "";
  }

  /**
   * 初始化 VideoEditor（加载 FFmpeg 核心文件）
   * @param onProgress 进度回调函数 (0-100)
   */
  async init(onProgress?: (progress: number) => void): Promise<void> {
    this.isLoading = true;
    this.isLoaded = false;
    this.loadError = "";
    this.loadProgress = 0;

    try {
      // 设置进度回调
      this.wrapper.setProgressCallback((progress) => {
        this.loadProgress = progress;
        if (onProgress) {
          onProgress(progress);
        }
      });

      // 模拟加载进度（因为 load 过程可能没有实时进度）
      // WebAV 模式不需要模拟进度，因为它有自己的进度管理
      if (this.mode === "ffmpeg") {
        this.progressInterval = setInterval(() => {
          if (this.loadProgress < 90) {
            this.loadProgress += 10;
            if (onProgress) {
              onProgress(this.loadProgress);
            }
          }
        }, 200);
      }

      await this.wrapper.load();

      // 加载完成，设置进度为 100%
      if (this.progressInterval) {
        clearInterval(this.progressInterval);
        this.progressInterval = null;
      }
      this.loadProgress = 100;
      if (onProgress) {
        onProgress(100);
      }

      this.isLoaded = true;
      this.isLoading = false;
    } catch (error) {
      console.error("VideoEditor 初始化失败:", error);
      this.loadError = error instanceof Error ? error.message : "未知错误";
      this.isLoading = false;
      this.isLoaded = false;

      if (this.progressInterval) {
        clearInterval(this.progressInterval);
        this.progressInterval = null;
      }

      throw error;
    } finally {
      // 清除进度回调
      this.wrapper.setProgressCallback(null);
    }
  }

  /**
   * 初始化（加载核心文件）
   * @deprecated 使用 init() 方法替代
   */
  async load(): Promise<void> {
    await this.wrapper.load();
  }

  /**
   * 获取加载进度
   */
  getProgress(): number {
    return this.loadProgress;
  }

  /**
   * 获取加载状态
   */
  getIsLoading(): boolean {
    return this.isLoading;
  }

  /**
   * 获取是否已加载
   */
  getIsLoaded(): boolean {
    return this.isLoaded;
  }

  /**
   * 获取加载错误信息
   */
  getLoadError(): string {
    return this.loadError;
  }

  /**
   * 调整视频倍速（带进度回调）
   * @param inputFile 输入视频文件
   * @param speed 倍速值
   * @param onProgress 进度回调函数 (0-100)
   * @returns 处理后的视频 Blob
   */
  async changeSpeedWithProgress(
    inputFile: File,
    speed: number,
    onProgress?: (progress: number) => void
  ): Promise<Blob> {
    // 设置进度回调
    this.wrapper.setProgressCallback(onProgress || null);

    try {
      const result = await this.wrapper.changeSpeed(inputFile, speed);
      return result;
    } finally {
      // 清除进度回调
      this.wrapper.setProgressCallback(null);
    }
  }

  /**
   * 调整视频对比度（带进度回调）
   * @param inputFile 输入视频文件
   * @param contrast 对比度值
   * @param onProgress 进度回调函数 (0-100)
   * @returns 处理后的视频 Blob
   */
  async changeContrastWithProgress(
    inputFile: File,
    contrast: number,
    onProgress?: (progress: number) => void
  ): Promise<Blob> {
    // 设置进度回调
    this.wrapper.setProgressCallback(onProgress || null);

    try {
      const result = await this.wrapper.changeContrast(inputFile, contrast);
      return result;
    } finally {
      // 清除进度回调
      this.wrapper.setProgressCallback(null);
    }
  }

  /**
   * 应用多个视频滤镜（倍速和对比度可以叠加）
   * @param inputFile 输入视频文件
   * @param options 滤镜选项
   * @param options.speed 倍速值（可选，默认 1.0）
   * @param options.contrast 对比度值（可选，默认 1.0）
   * @param onProgress 进度回调函数 (0-100)
   * @returns 处理后的视频 Blob
   */
  async applyFilters(
    inputFile: File,
    options: { speed?: number; contrast?: number } = {},
    onProgress?: (progress: number) => void
  ): Promise<Blob> {
    // 设置进度回调
    this.wrapper.setProgressCallback(onProgress || null);

    try {
      const result = await this.wrapper.applyFilters(inputFile, options);
      return result;
    } finally {
      // 清除进度回调
      this.wrapper.setProgressCallback(null);
    }
  }

  /**
   * 销毁实例
   */
  async destroy(): Promise<void> {
    await this.wrapper.destroy();
  }
}
