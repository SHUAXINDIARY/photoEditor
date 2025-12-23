import { FFmpegWrapper } from "./ffmpeg";

/**
 * 视频编辑器类，提供业务层接口
 * 内部使用 FFmpegWrapper 进行实际的视频处理
 */
export class VideoEditor {
  private ffmpegWrapper: FFmpegWrapper;
  private isLoading: boolean = false;
  private isLoaded: boolean = false;
  private loadProgress: number = 0;
  private loadError: string = "";
  private progressInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.ffmpegWrapper = new FFmpegWrapper();
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
      this.ffmpegWrapper.setProgressCallback((progress) => {
        this.loadProgress = progress;
        if (onProgress) {
          onProgress(progress);
        }
      });

      // 模拟加载进度（因为 load 过程可能没有实时进度）
      this.progressInterval = setInterval(() => {
        if (this.loadProgress < 90) {
          this.loadProgress += 10;
          if (onProgress) {
            onProgress(this.loadProgress);
          }
        }
      }, 200);

      await this.ffmpegWrapper.load();

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
      this.ffmpegWrapper.setProgressCallback(null);
    }
  }

  /**
   * 初始化 FFmpeg（加载核心文件）
   * @deprecated 使用 init() 方法替代
   */
  async load(): Promise<void> {
    await this.ffmpegWrapper.load();
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
    this.ffmpegWrapper.setProgressCallback(onProgress || null);

    try {
      const result = await this.ffmpegWrapper.changeSpeed(inputFile, speed);
      return result;
    } finally {
      // 清除进度回调
      this.ffmpegWrapper.setProgressCallback(null);
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
    this.ffmpegWrapper.setProgressCallback(onProgress || null);

    try {
      const result = await this.ffmpegWrapper.changeContrast(inputFile, contrast);
      return result;
    } finally {
      // 清除进度回调
      this.ffmpegWrapper.setProgressCallback(null);
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
    this.ffmpegWrapper.setProgressCallback(onProgress || null);

    try {
      const result = await this.ffmpegWrapper.applyFilters(inputFile, options);
      return result;
    } finally {
      // 清除进度回调
      this.ffmpegWrapper.setProgressCallback(null);
    }
  }

  /**
   * 销毁 FFmpeg 实例
   */
  async destroy(): Promise<void> {
    await this.ffmpegWrapper.destroy();
  }
}
