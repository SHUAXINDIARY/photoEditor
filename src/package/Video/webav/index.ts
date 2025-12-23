import { MP4Clip, Combinator, OffscreenSprite } from "@webav/av-cliper";

/**
 * WebAV 封装类，负责基于 WebCodecs 的视频处理实现
 * 提供与 FFmpegWrapper 相同的接口
 * 
 * 参考文档: https://webav-tech.github.io/WebAV/_api/av-cliper/
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
   * 通过 MP4Clip.tick() 手动 seek 到指定时间读取帧来实现真正的倍速效果
   * 
   * 倍速原理：
   * - 2x 倍速：输出时间 t 时，从源视频的 t*2 位置读取帧
   * - 0.5x 倍速：输出时间 t 时，从源视频的 t*0.5 位置读取帧
   * 
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
      return new Blob([await inputFile.arrayBuffer()], { type: "video/mp4" });
    }

    try {
      console.log("[WebAV] 开始调整倍速:", speed);
      this.updateProgress(5);

      // 读取视频文件，保存原始数据用于后续复制
      const originalBuffer = await inputFile.arrayBuffer();
      const videoData = new Uint8Array(originalBuffer);
      
      // 创建源视频 clip（使用复制的数据）
      const sourceClip = new MP4Clip(new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(videoData));
          controller.close();
        },
      }));
      await sourceClip.ready;
      this.updateProgress(10);

      const meta = sourceClip.meta;
      const originalDurationUs = meta.duration;
      const newDurationUs = originalDurationUs / speed;
      const fps = 30;
      const frameIntervalUs = 1_000_000 / fps;
      const totalOutputFrames = Math.ceil(newDurationUs / frameIntervalUs);
      
      console.log("[WebAV] 视频信息:", {
        width: meta.width,
        height: meta.height,
        originalDurationSec: originalDurationUs / 1e6,
        newDurationSec: newDurationUs / 1e6,
        speed,
        totalOutputFrames,
      });

      this.updateProgress(15);

      // 创建 Canvas 用于绘制帧
      const canvas = new OffscreenCanvas(meta.width, meta.height);
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        throw new Error("无法创建 Canvas 上下文");
      }

      // 收集所有需要输出的帧
      const frames: { timestamp: number; imageData: ImageData }[] = [];
      let processedFrames = 0;

      // 手动逐帧处理：对于输出的每一帧，从源视频的对应位置读取
      for (let i = 0; i < totalOutputFrames; i++) {
        const outputTimeUs = i * frameIntervalUs;
        const sourceTimeUs = outputTimeUs * speed;
        
        if (sourceTimeUs >= originalDurationUs) break;

        // 从源视频读取指定时间的帧
        const tickResult = await sourceClip.tick(sourceTimeUs);
        
        if (tickResult.state === "done" || !tickResult.video) break;

        // 绘制到 canvas
        ctx.drawImage(tickResult.video, 0, 0, meta.width, meta.height);
        tickResult.video.close();

        // 保存帧数据
        frames.push({
          timestamp: outputTimeUs,
          imageData: ctx.getImageData(0, 0, meta.width, meta.height),
        });

        processedFrames++;
        const progress = 15 + (processedFrames / totalOutputFrames) * 40;
        this.updateProgress(Math.min(55, progress));

        // 每处理一些帧后让出控制权
        if (processedFrames % 5 === 0) {
          await new Promise(resolve => setTimeout(resolve, 0));
        }
      }

      console.log("[WebAV] 帧提取完成，共", frames.length, "帧");
      this.updateProgress(60);

      // 清理源 clip
      await sourceClip.destroy?.();

      // 创建一个新的 clip，用于输出
      // 我们需要创建一个自定义的 clip，它返回我们预处理好的帧
      // 但 WebAV 不支持自定义 IClip，所以我们使用另一种方法：
      // 创建一个新的 MP4Clip，然后用 tickInterceptor 替换它的帧

      const outputClip = new MP4Clip(new ReadableStream({
        start(controller) {
          // 使用复制的数据创建新的 clip
          controller.enqueue(new Uint8Array(videoData));
          controller.close();
        },
      }));
      await outputClip.ready;

      // 使用帧索引来跟踪当前应该返回哪一帧
      let frameIndex = 0;
      
      outputClip.tickInterceptor = async (_, tickRet) => {
        if (tickRet.video && frameIndex < frames.length) {
          const frameData = frames[frameIndex];
          
          // 将预处理的帧数据绘制到 canvas
          ctx.putImageData(frameData.imageData, 0, 0);
          
          // 创建新的 VideoFrame
          const newFrame = new VideoFrame(canvas, {
            timestamp: frameData.timestamp,
            duration: frameIntervalUs,
          });
          
          tickRet.video.close();
          tickRet.video = newFrame;
          frameIndex++;
        }
        return tickRet;
      };

      this.updateProgress(65);

      // 创建 sprite 并设置输出时长
      const sprite = new OffscreenSprite(outputClip);
      sprite.time = { offset: 0, duration: newDurationUs };

      const combinator = new Combinator({
        width: meta.width,
        height: meta.height,
      });

      await combinator.addSprite(sprite);
      this.updateProgress(70);

      // 输出视频流
      const outputStream = combinator.output();
      const chunks: Uint8Array[] = [];
      const reader = outputStream.getReader();
      
      let totalBytes = 0;
      const estimatedSize = Math.max(videoData.byteLength / speed, 100000);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        chunks.push(value);
        totalBytes += value.byteLength;
        
        const progress = 70 + Math.min(25, (totalBytes / estimatedSize) * 25);
        this.updateProgress(progress);
      }

      // 合并数据
      const totalSize = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
      const resultBuffer = new Uint8Array(totalSize);
      let offset = 0;
      for (const chunk of chunks) {
        resultBuffer.set(chunk, offset);
        offset += chunk.length;
      }

      this.updateProgress(100);
      console.log("[WebAV] 倍速处理完成，输出大小:", totalSize, "输出帧数:", frames.length);

      // 清理资源
      await outputClip.destroy?.();

      return new Blob([resultBuffer], { type: "video/mp4" });
    } catch (error) {
      console.error("[WebAV] 倍速处理失败:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`倍速处理失败: ${errorMessage}`);
    }
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
   * 使用 WebAV 的 tickInterceptor 实现帧级处理
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

    // 如果只需要调整倍速，使用专门的倍速方法
    if (contrast === 1.0) {
      return this.changeSpeed(inputFile, speed);
    }

    try {
      console.log("[WebAV] 开始应用滤镜，倍速:", speed, "对比度:", contrast);
      this.updateProgress(5);

      // 读取视频文件并创建 MP4Clip
      const videoBuffer = await inputFile.arrayBuffer();
      const videoStream = new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(videoBuffer));
          controller.close();
        },
      });

      const clip = new MP4Clip(videoStream);
      await clip.ready;
      this.updateProgress(15);

      // 获取视频信息
      const meta = clip.meta;
      const originalDuration = meta.duration;
      const newDuration = originalDuration / speed;

      console.log("[WebAV] 视频信息:", {
        width: meta.width,
        height: meta.height,
        duration: originalDuration / 1e6,
        newDuration: newDuration / 1e6,
      });

      // 创建用于对比度处理的 Canvas
      const canvas = new OffscreenCanvas(meta.width, meta.height);
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        throw new Error("无法创建 Canvas 上下文");
      }

      // 使用 tickInterceptor 处理每一帧
      clip.tickInterceptor = async (_, tickRet) => {
        if (tickRet.video) {
          // 1. 调整时间戳（倍速）
          const newTimestamp = tickRet.video.timestamp / speed;
          const newDurationVal = tickRet.video.duration ? tickRet.video.duration / speed : undefined;

          // 2. 应用对比度滤镜
          if (contrast !== 1.0) {
            // 将 VideoFrame 绘制到 Canvas
            ctx.drawImage(tickRet.video, 0, 0);
            
            // 获取像素数据并应用对比度
            const imageData = ctx.getImageData(0, 0, meta.width, meta.height);
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
            }

            ctx.putImageData(imageData, 0, 0);

            // 创建新的 VideoFrame
            const newFrame = new VideoFrame(canvas, {
              timestamp: newTimestamp,
              duration: newDurationVal,
            });
            tickRet.video.close();
            tickRet.video = newFrame;
          } else {
            // 仅调整时间戳
            const newFrame = new VideoFrame(tickRet.video, {
              timestamp: newTimestamp,
              duration: newDurationVal,
            });
            tickRet.video.close();
            tickRet.video = newFrame;
          }
        }
        return tickRet;
      };

      this.updateProgress(25);

      // 创建 OffscreenSprite 并添加到 Combinator
      const sprite = new OffscreenSprite(clip);
      sprite.time = { offset: 0, duration: newDuration };

      // 创建 Combinator 进行视频合成
      const combinator = new Combinator({
        width: meta.width,
        height: meta.height,
      });

      await combinator.addSprite(sprite);
      this.updateProgress(35);

      // 输出视频流
      const outputStream = combinator.output();
      const chunks: Uint8Array[] = [];
      const reader = outputStream.getReader();

      let totalBytes = 0;
      const estimatedSize = videoBuffer.byteLength;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        chunks.push(value);
        totalBytes += value.byteLength;

        // 更新进度 (35% - 95%)
        const progress = 35 + Math.min(60, (totalBytes / estimatedSize) * 60);
        this.updateProgress(progress);
      }

      // 合并数据并创建 Blob
      const totalSize = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
      const resultBuffer = new Uint8Array(totalSize);
      let offset = 0;
      for (const chunk of chunks) {
        resultBuffer.set(chunk, offset);
        offset += chunk.length;
      }

      this.updateProgress(100);
      console.log("[WebAV] 滤镜处理完成，输出大小:", totalSize);

      // 清理资源
      await clip.destroy?.();

      return new Blob([resultBuffer], { type: "video/mp4" });
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
