import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";
import type { VideoFilterOptions } from "../types";
import { DEFAULT_FILTER_VALUES } from "../types";

const baseURL = "https://cdn.jsdelivr.net/npm/@ffmpeg/core-mt@0.12.10/dist/esm";

/**
 * FFmpeg 封装类，负责 FFmpeg.wasm 的具体实现
 */
export class FFmpegWrapper {
  private ffmpeg: FFmpeg;
  private isLoaded: boolean = false;
  private loadingProgress: number = 0;
  private currentProgressCallback: ((progress: number) => void) | null = null;

  constructor() {
    this.ffmpeg = new FFmpeg();
  }

  /**
   * 初始化 FFmpeg（加载核心文件）
   */
  async load(): Promise<void> {
    if (this.isLoaded) {
      return;
    }

    try {
      // 先加载 FFmpeg，然后再设置事件监听器
      await this.ffmpeg.load({
        coreURL: await toBlobURL(
          `${baseURL}/ffmpeg-core.js`,
          "text/javascript"
        ),
        wasmURL: await toBlobURL(
          `${baseURL}/ffmpeg-core.wasm`,
          "application/wasm"
        ),
        workerURL: await toBlobURL(
          `${baseURL}/ffmpeg-core.worker.js`,
          "text/javascript"
        ),
      });

      // 在 load 之后设置事件监听器
      try {
        this.ffmpeg.on("log", ({ message }) => {
          console.log("[FFmpeg]", message);
        });

        // 设置一个通用的进度监听器，用于转发到当前的回调
        this.ffmpeg.on("progress", ({ progress }) => {
          const progressPercent = progress * 100;
          this.loadingProgress = progressPercent;
          console.log(`[FFmpeg] 加载进度: ${progressPercent.toFixed(2)}%`);
          // 如果有当前的回调，调用它
          if (this.currentProgressCallback) {
            this.currentProgressCallback(progressPercent);
          }
        });
      } catch (eventError) {
        console.warn("[FFmpeg] 设置事件监听器失败，继续执行:", eventError);
      }

      // 等待一小段时间确保文件系统完全初始化
      await new Promise((resolve) => setTimeout(resolve, 100));

      // 验证 FFmpeg 是否真正加载
      if (!this.ffmpeg.loaded) {
        throw new Error("FFmpeg 加载后状态异常");
      }

      this.isLoaded = true;
      console.log("[FFmpeg] 初始化完成，文件系统已就绪");
    } catch (error) {
      console.error("[FFmpeg] 初始化失败:", error);
      this.isLoaded = false;
      throw error;
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

    // 确保 FFmpeg 完全加载
    if (!this.ffmpeg.loaded) {
      throw new Error("FFmpeg 未正确加载，请稍后重试");
    }

    if (speed <= 0) {
      throw new Error("倍速值必须大于 0");
    }

    // 使用时间戳生成唯一文件名，避免文件冲突
    const timestamp = Date.now();
    const inputFileName = `input_${timestamp}.mp4`;
    const outputFileName = `output_${timestamp}.mp4`;

    try {
      // 将输入文件写入 FFmpeg 文件系统
      console.log("[FFmpeg] 开始读取输入文件...");
      const fileData = await fetchFile(inputFile);

      // 确保文件数据是有效的
      if (!fileData) {
        throw new Error("无法读取输入文件");
      }

      console.log("[FFmpeg] 文件数据大小:", fileData instanceof Uint8Array ? fileData.length : "未知");

      // 写入文件到 FFmpeg 虚拟文件系统
      console.log("[FFmpeg] 写入文件到虚拟文件系统:", inputFileName);
      await this.ffmpeg.writeFile(inputFileName, fileData);
      console.log("[FFmpeg] 文件写入成功");

      // 执行 FFmpeg 命令
      // setpts: 调整视频时间戳（视频倍速）
      // -an: 移除音频轨道
      console.log("[FFmpeg] 开始执行 FFmpeg 命令，倍速:", speed);
      await this.ffmpeg.exec([
        "-i", inputFileName,
        "-an",
        "-filter:v", `setpts=${1 / speed}*PTS`,
        "-c:v", "libx264",
        "-preset", "ultrafast",
        outputFileName,
      ]);

      // 读取输出文件
      console.log("[FFmpeg] 读取输出文件:", outputFileName);
      const data = (await this.ffmpeg.readFile(outputFileName)) as Uint8Array;
      console.log("[FFmpeg] 输出文件读取成功，大小:", data.length);

      // 转换为 Blob
      const arrayBuffer = new ArrayBuffer(data.length);
      const view = new Uint8Array(arrayBuffer);
      view.set(data);
      const resultBlob = new Blob([arrayBuffer], { type: "video/mp4" });

      // 清理文件
      try {
        await this.ffmpeg.deleteFile(inputFileName);
      } catch (cleanupError) {
        console.warn("[FFmpeg] 清理输入文件失败:", cleanupError);
      }
      try {
        await this.ffmpeg.deleteFile(outputFileName);
      } catch (cleanupError) {
        console.warn("[FFmpeg] 清理输出文件失败:", cleanupError);
      }

      return resultBlob;

    } catch (error) {
      console.error("[FFmpeg] 视频处理失败:", error);
      console.error("[FFmpeg] 错误详情:", {
        errorType: error instanceof Error ? error.constructor.name : typeof error,
        errorMessage: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined,
        ffmpegLoaded: this.ffmpeg.loaded,
        isLoaded: this.isLoaded,
      });

      // 确保在错误时也清理文件
      try {
        await this.ffmpeg.deleteFile(inputFileName);
      } catch (cleanupError) {
        console.warn("[FFmpeg] 清理输入文件失败:", cleanupError);
      }
      try {
        await this.ffmpeg.deleteFile(outputFileName);
      } catch (cleanupError) {
        console.warn("[FFmpeg] 清理输出文件失败:", cleanupError);
      }

      // 提供更详细的错误信息
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes("FS error") || errorMessage.includes("ErrnoError")) {
        throw new Error(
          `FFmpeg 文件系统错误。可能的原因：1) FFmpeg 未完全加载 2) 文件系统未初始化 3) 文件操作冲突。原始错误: ${errorMessage}`
        );
      }

      throw new Error(`视频倍速处理失败: ${errorMessage}`);
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

    // 确保 FFmpeg 完全加载
    if (!this.ffmpeg.loaded) {
      throw new Error("FFmpeg 未正确加载，请稍后重试");
    }

    if (contrast <= 0) {
      throw new Error("对比度值必须大于 0");
    }

    // 使用时间戳生成唯一文件名，避免文件冲突
    const timestamp = Date.now();
    const inputFileName = `input_${timestamp}.mp4`;
    const outputFileName = `output_${timestamp}.mp4`;

    try {
      // 将输入文件写入 FFmpeg 文件系统
      console.log("[FFmpeg] 开始读取输入文件...");
      const fileData = await fetchFile(inputFile);

      // 确保文件数据是有效的
      if (!fileData) {
        throw new Error("无法读取输入文件");
      }

      console.log("[FFmpeg] 文件数据大小:", fileData instanceof Uint8Array ? fileData.length : "未知");

      // 写入文件到 FFmpeg 虚拟文件系统
      console.log("[FFmpeg] 写入文件到虚拟文件系统:", inputFileName);
      await this.ffmpeg.writeFile(inputFileName, fileData);
      console.log("[FFmpeg] 文件写入成功");

      // 执行 FFmpeg 命令
      // eq 滤镜用于调整对比度：eq=contrast=值
      // -an 表示移除音频轨道
      console.log("[FFmpeg] 开始执行 FFmpeg 命令，对比度:", contrast);
      await this.ffmpeg.exec([
        "-i", inputFileName,
        "-vf", `eq=contrast=${contrast}`,
        "-an",
        "-c:v", "libx264",
        "-preset", "ultrafast",
        outputFileName,
      ]);

      // 读取输出文件
      console.log("[FFmpeg] 读取输出文件:", outputFileName);
      const data = (await this.ffmpeg.readFile(outputFileName)) as Uint8Array;
      console.log("[FFmpeg] 输出文件读取成功，大小:", data.length);

      // 转换为 Blob
      const arrayBuffer = new ArrayBuffer(data.length);
      const view = new Uint8Array(arrayBuffer);
      view.set(data);
      const resultBlob = new Blob([arrayBuffer], { type: "video/mp4" });

      // 清理文件
      try {
        await this.ffmpeg.deleteFile(inputFileName);
      } catch (cleanupError) {
        console.warn("[FFmpeg] 清理输入文件失败:", cleanupError);
      }
      try {
        await this.ffmpeg.deleteFile(outputFileName);
      } catch (cleanupError) {
        console.warn("[FFmpeg] 清理输出文件失败:", cleanupError);
      }

      return resultBlob;

    } catch (error) {
      console.error("[FFmpeg] 视频处理失败:", error);
      console.error("[FFmpeg] 错误详情:", {
        errorType: error instanceof Error ? error.constructor.name : typeof error,
        errorMessage: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined,
        ffmpegLoaded: this.ffmpeg.loaded,
        isLoaded: this.isLoaded,
      });

      // 确保在错误时也清理文件
      try {
        await this.ffmpeg.deleteFile(inputFileName);
      } catch (cleanupError) {
        console.warn("[FFmpeg] 清理输入文件失败:", cleanupError);
      }
      try {
        await this.ffmpeg.deleteFile(outputFileName);
      } catch (cleanupError) {
        console.warn("[FFmpeg] 清理输出文件失败:", cleanupError);
      }

      // 提供更详细的错误信息
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes("FS error") || errorMessage.includes("ErrnoError")) {
        throw new Error(
          `FFmpeg 文件系统错误。可能的原因：1) FFmpeg 未完全加载 2) 文件系统未初始化 3) 文件操作冲突。原始错误: ${errorMessage}`
        );
      }

      throw new Error(`视频对比度处理失败: ${errorMessage}`);
    }
  }

  /**
   * 构建 FFmpeg eq 滤镜参数
   * eq 滤镜支持: contrast, brightness, saturation, gamma, gamma_r, gamma_g, gamma_b 等
   * 将所有颜色调整整合到一个 eq 滤镜中
   * @param options 滤镜选项
   * @returns eq 滤镜字符串，如果没有需要应用的效果则返回 null
   */
  private buildEqFilter(options: VideoFilterOptions): string | null {
    const eqParams: string[] = [];
    
    const contrast = options.contrast ?? DEFAULT_FILTER_VALUES.contrast;
    const saturation = options.saturation ?? DEFAULT_FILTER_VALUES.saturation;
    const shadows = options.shadows ?? DEFAULT_FILTER_VALUES.shadows;
    const highlights = options.highlights ?? DEFAULT_FILTER_VALUES.highlights;
    const temperature = options.temperature ?? DEFAULT_FILTER_VALUES.temperature;
    
    if (contrast !== 1.0) {
      eqParams.push(`contrast=${contrast.toFixed(3)}`);
    }
    
    if (saturation !== 1.0) {
      eqParams.push(`saturation=${saturation.toFixed(3)}`);
    }
    
    // 阴影/高光参数
    const shadowHighlightParams = this.buildShadowHighlightParams(shadows, highlights);
    if (shadowHighlightParams) {
      eqParams.push(...shadowHighlightParams);
    }
    
    // 色温参数（通过 gamma_r 和 gamma_b 实现）
    const temperatureParams = this.buildTemperatureParams(temperature);
    if (temperatureParams) {
      eqParams.push(...temperatureParams);
    }
    
    return eqParams.length > 0 ? `eq=${eqParams.join(":")}` : null;
  }

  /**
   * 构建色温滤镜
   * 使用 eq 滤镜的 saturation 配合 hue 滤镜实现色温效果
   * 由于 FFmpeg.wasm 可能不支持 colorbalance/colorchannelmixer，使用更基础的方法
   * @param temperature 色温值 (-1 到 1)
   * @returns 色温相关的 eq 参数数组，如果不需要则返回 null
   */
  private buildTemperatureParams(temperature: number): string[] | null {
    if (temperature === 0) return null;
    
    // 使用 eq 滤镜的 eval=frame 模式，通过调整 brightness 和 gamma_r/gamma_b 来模拟色温
    // 暖色调: 增加红色gamma，减少蓝色gamma
    // 冷色调: 减少红色gamma，增加蓝色gamma
    const params: string[] = [];
    
    if (temperature > 0) {
      // 暖色调
      // gamma_r > 1 增强红色, gamma_b < 1 减弱蓝色
      const gammaR = 1 + temperature * 0.2;
      const gammaB = 1 - temperature * 0.2;
      params.push(`gamma_r=${gammaR.toFixed(3)}`);
      params.push(`gamma_b=${gammaB.toFixed(3)}`);
    } else {
      // 冷色调
      const coolness = Math.abs(temperature);
      const gammaR = 1 - coolness * 0.15;
      const gammaB = 1 + coolness * 0.2;
      params.push(`gamma_r=${gammaR.toFixed(3)}`);
      params.push(`gamma_b=${gammaB.toFixed(3)}`);
    }
    
    return params;
  }

  /**
   * 构建阴影/高光滤镜
   * 使用 eq 滤镜的 gamma 和 brightness 参数
   * 参数与 WebGL 着色器保持一致
   * @param shadows 阴影值 (0-2)
   * @param highlights 高光值 (0-2)
   * @returns eq 滤镜参数数组，如果不需要则返回 null
   */
  private buildShadowHighlightParams(shadows: number, highlights: number): string[] | null {
    if (shadows === 1.0 && highlights === 1.0) return null;
    
    const params: string[] = [];
    
    // 阴影调整：使用 gamma 参数
    // WebGL: rgb = pow(rgb, vec3(gamma)), gamma = 1.0 / pow(shadows, 0.6)
    if (shadows !== 1.0) {
      const gamma = 1.0 / Math.pow(shadows, 0.6);
      // 限制 gamma 范围，避免极端值
      const clampedGamma = Math.max(0.4, Math.min(2.5, gamma));
      params.push(`gamma=${clampedGamma.toFixed(3)}`);
    }
    
    // 高光调整：使用 brightness 参数
    // WebGL: rgb = rgb + brightness, brightness = (highlights - 1.0) * 0.3
    if (highlights !== 1.0) {
      const brightness = (highlights - 1.0) * 0.3;
      // 限制 brightness 范围
      const clampedBrightness = Math.max(-0.5, Math.min(0.5, brightness));
      params.push(`brightness=${clampedBrightness.toFixed(3)}`);
    }
    
    return params.length > 0 ? params : null;
  }

  /**
   * 应用多个视频滤镜
   * @param inputFile 输入视频文件
   * @param options 滤镜选项（倍速、对比度、饱和度、色温、阴影、高光）
   * @returns 处理后的视频 Blob
   */
  async applyFilters(
    inputFile: File,
    options: VideoFilterOptions = {}
  ): Promise<Blob> {
    if (!this.isLoaded) {
      await this.load();
    }

    // 确保 FFmpeg 完全加载
    if (!this.ffmpeg.loaded) {
      throw new Error("FFmpeg 未正确加载，请稍后重试");
    }

    const speed = options.speed ?? DEFAULT_FILTER_VALUES.speed;
    const contrast = options.contrast ?? DEFAULT_FILTER_VALUES.contrast;
    const saturation = options.saturation ?? DEFAULT_FILTER_VALUES.saturation;
    const temperature = options.temperature ?? DEFAULT_FILTER_VALUES.temperature;
    const shadows = options.shadows ?? DEFAULT_FILTER_VALUES.shadows;
    const highlights = options.highlights ?? DEFAULT_FILTER_VALUES.highlights;

    if (speed <= 0) {
      throw new Error("倍速值必须大于 0");
    }

    if (contrast <= 0) {
      throw new Error("对比度值必须大于 0");
    }

    // 使用时间戳生成唯一文件名，避免文件冲突
    const timestamp = Date.now();
    const inputFileName = `input_${timestamp}.mp4`;
    const outputFileName = `output_${timestamp}.mp4`;

    try {
      // 将输入文件写入 FFmpeg 文件系统
      console.log("[FFmpeg] 开始读取输入文件...");
      const fileData = await fetchFile(inputFile);

      if (!fileData) {
        throw new Error("无法读取输入文件");
      }

      console.log("[FFmpeg] 文件数据大小:", fileData instanceof Uint8Array ? fileData.length : "未知");

      // 写入文件到 FFmpeg 虚拟文件系统
      console.log("[FFmpeg] 写入文件到虚拟文件系统:", inputFileName);
      await this.ffmpeg.writeFile(inputFileName, fileData);
      console.log("[FFmpeg] 文件写入成功");

      // 构建滤镜链
      // 所有颜色调整都整合到一个 eq 滤镜中（对比度、饱和度、阴影、高光、色温）
      const filters: string[] = [];

      // 1. eq 滤镜（包含所有颜色调整）
      const eqFilter = this.buildEqFilter({ contrast, saturation, shadows, highlights, temperature });
      if (eqFilter) {
        filters.push(eqFilter);
      }

      // 2. 倍速滤镜（最后应用）
      if (speed !== 1.0) {
        filters.push(`setpts=${1 / speed}*PTS`);
      }

      // 构建 FFmpeg 命令
      // -y 覆盖输出文件，避免交互式提示
      const ffmpegArgs: string[] = ["-y", "-i", inputFileName];

      // 如果有滤镜，应用它们
      if (filters.length > 0) {
        // 添加 format=yuv420p 确保输出格式兼容
        const filterComplex = filters.join(",") + ",format=yuv420p";
        ffmpegArgs.push("-vf", filterComplex);
      } else {
        // 即使没有其他滤镜，也确保输出格式
        ffmpegArgs.push("-vf", "format=yuv420p");
      }

      // 移除音频轨道并设置编码参数
      ffmpegArgs.push("-an", "-c:v", "libx264", "-preset", "ultrafast", outputFileName);

      console.log("[FFmpeg] 开始执行 FFmpeg 命令");
      console.log("[FFmpeg] 完整命令:", ["ffmpeg", ...ffmpegArgs].join(" "));
      console.log("[FFmpeg] 效果参数:", { speed, contrast, saturation, temperature, shadows, highlights });
      console.log("[FFmpeg] 滤镜链:", filters.join(","));
      
      try {
        await this.ffmpeg.exec(ffmpegArgs);
      } catch (execError) {
        console.error("[FFmpeg] exec 执行失败:", execError);
        throw execError;
      }

      // 读取输出文件
      console.log("[FFmpeg] 读取输出文件:", outputFileName);
      const data = (await this.ffmpeg.readFile(outputFileName)) as Uint8Array;
      console.log("[FFmpeg] 输出文件读取成功，大小:", data.length);

      // 转换为 Blob
      const arrayBuffer = new ArrayBuffer(data.length);
      const view = new Uint8Array(arrayBuffer);
      view.set(data);
      const resultBlob = new Blob([arrayBuffer], { type: "video/mp4" });

      // 清理文件
      try {
        await this.ffmpeg.deleteFile(inputFileName);
      } catch (cleanupError) {
        console.warn("[FFmpeg] 清理输入文件失败:", cleanupError);
      }
      try {
        await this.ffmpeg.deleteFile(outputFileName);
      } catch (cleanupError) {
        console.warn("[FFmpeg] 清理输出文件失败:", cleanupError);
      }

      return resultBlob;

    } catch (error) {
      console.error("[FFmpeg] 视频处理失败:", error);
      console.error("[FFmpeg] 错误详情:", {
        errorType: error instanceof Error ? error.constructor.name : typeof error,
        errorMessage: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined,
        ffmpegLoaded: this.ffmpeg.loaded,
        isLoaded: this.isLoaded,
      });

      // 确保在错误时也清理文件
      try {
        await this.ffmpeg.deleteFile(inputFileName);
      } catch (cleanupError) {
        console.warn("[FFmpeg] 清理输入文件失败:", cleanupError);
      }
      try {
        await this.ffmpeg.deleteFile(outputFileName);
      } catch (cleanupError) {
        console.warn("[FFmpeg] 清理输出文件失败:", cleanupError);
      }

      // 提供更详细的错误信息
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes("FS error") || errorMessage.includes("ErrnoError")) {
        throw new Error(
          `FFmpeg 文件系统错误。可能的原因：1) FFmpeg 未完全加载 2) 文件系统未初始化 3) 文件操作冲突。原始错误: ${errorMessage}`
        );
      }

      throw new Error(`视频处理失败: ${errorMessage}`);
    }
  }

  /**
   * 销毁 FFmpeg 实例
   */
  async destroy(): Promise<void> {
    if (this.ffmpeg) {
      // FFmpeg 没有显式的 destroy 方法，但可以清理资源
      this.isLoaded = false;
      this.loadingProgress = 0;
      this.currentProgressCallback = null;
    }
  }
}

