import { MP4Clip } from "@webav/av-cliper";

/**
 * WebAV 封装类，负责基于 WebCodecs 的视频处理实现
 * 提供与 FFmpegWrapper 相同的接口
 */
export class WebAVWrapper {
  private isLoaded: boolean = false;
  private loadingProgress: number = 0;
  private currentProgressCallback: ((progress: number) => void) | null = null;

  constructor() {
    // WebAV 基于 WebCodecs，不需要预加载，但需要检查浏览器支持
    this.checkWebCodecsSupport();
  }

  /**
   * 检查 WebCodecs 支持
   */
  private checkWebCodecsSupport(): void {
    if (typeof VideoDecoder === "undefined" || typeof VideoEncoder === "undefined") {
      console.warn("[WebAV] WebCodecs API 不支持，某些功能可能无法使用");
    }
  }

  /**
   * 初始化（WebAV 不需要预加载，但可以模拟加载过程）
   */
  async load(): Promise<void> {
    if (this.isLoaded) {
      return;
    }

    try {
      // 模拟加载进度（WebAV 基于 WebCodecs，不需要实际加载）
      this.loadingProgress = 0;
      this.updateProgress(10);

      // 检查 WebCodecs 支持
      if (typeof VideoDecoder === "undefined" || typeof VideoEncoder === "undefined") {
        throw new Error("浏览器不支持 WebCodecs API，请使用支持 WebCodecs 的浏览器");
      }

      await new Promise((resolve) => setTimeout(resolve, 100));
      this.updateProgress(50);

      await new Promise((resolve) => setTimeout(resolve, 100));
      this.updateProgress(100);

      this.isLoaded = true;
      console.log("[WebAV] 初始化完成");
    } catch (error) {
      console.error("[WebAV] 初始化失败:", error);
      this.isLoaded = false;
      throw error;
    }
  }

  /**
   * 更新进度
   */
  private updateProgress(progress: number): void {
    this.loadingProgress = progress;
    if (this.currentProgressCallback) {
      this.currentProgressCallback(progress);
    }
  }

  /**
   * 获取加载进度
   */
  getProgress(): number {
    return this.loadingProgress;
  }

  /**
   * 设置进度回调
   */
  setProgressCallback(callback: ((progress: number) => void) | null): void {
    this.currentProgressCallback = callback;
  }

  /**
   * 调整视频倍速
   * @param inputFile 输入视频文件
   * @param speed 倍速值（例如：0.5 = 0.5倍速，2.0 = 2倍速）
   * @returns 处理后的视频 Blob
   */
  async changeSpeed(inputFile: File, speed: number): Promise<Blob> {
    if (!this.isLoaded) {
      await this.load();
    }

    if (speed <= 0) {
      throw new Error("倍速值必须大于 0");
    }

    if (speed === 1.0) {
      // 如果倍速为 1.0，直接返回原文件
      return new Blob([await inputFile.arrayBuffer()], { type: "video/mp4" });
    }

    // 使用 applyFilters 实现倍速
    return this.applyFilters(inputFile, { speed, contrast: 1.0 });
  }

  /**
   * 调整视频对比度
   * @param inputFile 输入视频文件
   * @param contrast 对比度值（例如：0.5 = 降低对比度，1.0 = 原始对比度，2.0 = 增强对比度）
   * @returns 处理后的视频 Blob
   */
  async changeContrast(inputFile: File, contrast: number): Promise<Blob> {
    if (!this.isLoaded) {
      await this.load();
    }

    if (contrast <= 0) {
      throw new Error("对比度值必须大于 0");
    }

    if (contrast === 1.0) {
      // 如果对比度为 1.0，直接返回原文件
      return new Blob([await inputFile.arrayBuffer()], { type: "video/mp4" });
    }

    // 使用 applyFilters 实现对比度
    return this.applyFilters(inputFile, { speed: 1.0, contrast });
  }

  /**
   * 应用多个视频滤镜（倍速和对比度可以叠加）
   * @param inputFile 输入视频文件
   * @param options 滤镜选项
   * @param options.speed 倍速值（可选，默认 1.0）
   * @param options.contrast 对比度值（可选，默认 1.0）
   * @returns 处理后的视频 Blob
   */
  async applyFilters(
    inputFile: File,
    options: { speed?: number; contrast?: number } = {}
  ): Promise<Blob> {
    if (!this.isLoaded) {
      await this.load();
    }

    const speed = options.speed ?? 1.0;
    const contrast = options.contrast ?? 1.0;

    if (speed <= 0) {
      throw new Error("倍速值必须大于 0");
    }

    if (contrast <= 0) {
      throw new Error("对比度值必须大于 0");
    }

    // 如果两个都是默认值，直接返回原文件
    if (speed === 1.0 && contrast === 1.0) {
      return new Blob([await inputFile.arrayBuffer()], { type: "video/mp4" });
    }

    try {
      console.log("[WebAV] 开始应用滤镜，倍速:", speed, "对比度:", contrast);

      // 读取视频文件
      const videoBuffer = await inputFile.arrayBuffer();
      const videoStream = new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(videoBuffer));
          controller.close();
        },
      });

      // 创建 MP4Clip
      const clip = new MP4Clip(videoStream);
      await clip.ready;

      // 获取视频信息
      const videoInfo = clip.meta;
      const width = videoInfo.width;
      const height = videoInfo.height;
      const duration = videoInfo.duration;

      console.log("[WebAV] 视频信息:", { duration, width, height });

      // 创建 Canvas 用于处理视频帧
      const canvas = new OffscreenCanvas(width, height);
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        throw new Error("无法创建 Canvas 上下文");
      }

      // 创建 VideoEncoder
      const chunks: Uint8Array[] = [];
      let frameCount = 0;
      const fps = 30; // 默认帧率
      const frameTime = 1 / fps;
      const outputDuration = duration / speed; // 倍速调整后的时长

      const encoder = new VideoEncoder({
        output: (chunk) => {
          // EncodedVideoChunk 的 data 是 ArrayBuffer
          chunks.push(new Uint8Array(chunk.byteLength));
          chunk.copyTo(chunks[chunks.length - 1]);
          frameCount++;
          // 更新进度
          if (this.currentProgressCallback) {
            const totalFrames = Math.ceil(outputDuration * fps);
            const progress = Math.min(95, (frameCount / totalFrames) * 100);
            this.currentProgressCallback(progress);
          }
        },
        error: (err) => {
          console.error("[WebAV] 编码错误:", err);
        },
      });

      // 配置编码器
      encoder.configure({
        codec: "avc1.42001E", // H.264 Baseline
        width,
        height,
        bitrate: 2_000_000, // 2 Mbps
        framerate: fps,
      });

      // 处理视频帧
      const videoElement = document.createElement("video");
      videoElement.src = URL.createObjectURL(inputFile);
      videoElement.muted = true; // 静音以便更快加载
      await new Promise((resolve) => {
        videoElement.onloadedmetadata = resolve;
      });

      let inputTime = 0; // 输入视频的时间
      let outputTime = 0; // 输出视频的时间

      const processFrame = async (): Promise<Blob> => {
        if (outputTime >= outputDuration) {
          await encoder.flush();
          this.updateProgress(100);

          // 合并所有 chunks
          const totalSize = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
          const resultBuffer = new Uint8Array(totalSize);
          let offset = 0;
          for (const chunk of chunks) {
            resultBuffer.set(chunk, offset);
            offset += chunk.length;
          }

          const resultBlob = new Blob([resultBuffer], { type: "video/mp4" });
          console.log("[WebAV] 滤镜处理完成，输出大小:", resultBlob.size);

          // 清理资源
          URL.revokeObjectURL(videoElement.src);
          videoElement.src = "";
          await clip.destroy?.();
          encoder.close();

          return resultBlob;
        }

        // 根据倍速计算输入视频的时间位置
        inputTime = outputTime * speed;

        if (inputTime >= duration) {
          // 如果输入时间超出，停止处理
          await encoder.flush();
          this.updateProgress(100);

          const totalSize = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
          const resultBuffer = new Uint8Array(totalSize);
          let offset = 0;
          for (const chunk of chunks) {
            resultBuffer.set(chunk, offset);
            offset += chunk.length;
          }

          const resultBlob = new Blob([resultBuffer], { type: "video/mp4" });

          URL.revokeObjectURL(videoElement.src);
          videoElement.src = "";
          await clip.destroy?.();
          encoder.close();

          return resultBlob;
        }

        // 跳转到指定时间
        videoElement.currentTime = inputTime;
        await new Promise<void>((resolve) => {
          const onSeeked = () => {
            videoElement.removeEventListener("seeked", onSeeked);
            resolve();
          };
          videoElement.addEventListener("seeked", onSeeked);
        });

        // 等待视频帧就绪
        await new Promise<void>((resolve) => {
          const onCanPlay = () => {
            videoElement.removeEventListener("canplay", onCanPlay);
            resolve();
          };
          videoElement.addEventListener("canplay", onCanPlay);
          // 如果已经可以播放，立即 resolve
          if (videoElement.readyState >= 2) {
            resolve();
          }
        });

        // 绘制到 canvas
        ctx.drawImage(videoElement, 0, 0, width, height);

        // 应用对比度滤镜（如果对比度不为 1.0）
        if (contrast !== 1.0) {
          const imageData = ctx.getImageData(0, 0, width, height);
          const data = imageData.data;
          const factor = contrast;
          const midpoint = 128;

          for (let i = 0; i < data.length; i += 4) {
            // RGB 通道
            for (let j = 0; j < 3; j++) {
              const value = data[i + j];
              const adjusted = (value - midpoint) * factor + midpoint;
              data[i + j] = Math.max(0, Math.min(255, adjusted));
            }
            // Alpha 通道保持不变
          }

          ctx.putImageData(imageData, 0, 0);
        }

        // 编码帧（使用输出时间作为时间戳，单位微秒）
        const frame = new VideoFrame(canvas, { timestamp: outputTime * 1_000_000 });
        encoder.encode(frame);
        frame.close();

        outputTime += frameTime;
        return await processFrame();
      };

      const resultBlob = await processFrame();
      return resultBlob;
    } catch (error) {
      console.error("[WebAV] 视频处理失败:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`视频处理失败: ${errorMessage}`);
    }
  }

  /**
   * 销毁实例
   */
  async destroy(): Promise<void> {
    this.isLoaded = false;
    this.loadingProgress = 0;
    this.currentProgressCallback = null;
  }
}
