import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";

const baseURL = "https://cdn.jsdelivr.net/npm/@ffmpeg/core-mt@0.12.10/dist/esm";

/**
 * 视频编辑器类，使用 ffmpeg.wasm 进行视频处理
 */
export class VideoEditor {
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
      // 使用 this.ffmpeg 而不是创建新实例
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
      // 使用 fetchFile 获取文件数据
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

      // 构建 FFmpeg 命令
      // setpts: 调整视频时间戳（视频倍速）
      // atempo: 调整音频倍速（范围 0.5-2.0）
      // 如果倍速超过 2.0，需要链式使用多个 atempo 滤镜
      let audioFilter = "";
      if (speed <= 2.0) {
        audioFilter = `atempo=${speed}`;
      } else {
        // 对于超过 2.0 的倍速，需要链式使用
        // 例如：3.0 = 2.0 * 1.5
        const factors: number[] = [];
        let remaining = speed;
        while (remaining > 2.0) {
          factors.push(2.0);
          remaining /= 2.0;
        }
        if (remaining > 1.0) {
          factors.push(remaining);
        }
        audioFilter = factors.map((f) => `atempo=${f}`).join(",");
      }

      const videoFilter = `setpts=${1 / speed}*PTS`;
      const filterComplex = `[0:v]${videoFilter}[v];[0:a]${audioFilter}[a]`;

      // 执行 FFmpeg 命令
      console.log("[FFmpeg] 开始执行 FFmpeg 命令，倍速:", speed);
      await this.ffmpeg.exec([
        "-i", inputFileName,
        "-an",
        "-filter:v", `setpts=${1 / speed}*PTS`,
        "-c:v", "libx264",
        "-preset", "ultrafast",
        outputFileName,
      ]);
      // 读取输出文件（注意：readFile 返回 Promise）
      console.log("[FFmpeg] 读取输出文件:", outputFileName);
      const data = (await this.ffmpeg.readFile(outputFileName)) as Uint8Array;
      console.log("[FFmpeg] 输出文件读取成功，大小:", data.length);

      // 转换为 Blob（data 是 Uint8Array）
      // 创建新的 ArrayBuffer 以避免 SharedArrayBuffer 类型问题
      const arrayBuffer = new ArrayBuffer(data.length);
      const view = new Uint8Array(arrayBuffer);
      view.set(data);
      const resultBlob = new Blob([arrayBuffer], { type: "video/mp4" });

      // 清理文件（在 finally 中确保清理）
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
    if (!this.isLoaded) {
      await this.load();
    }

    // 使用回调函数的方式，而不是直接设置事件监听器
    // 这样可以避免访问私有成员的问题
    const previousCallback = this.currentProgressCallback;
    this.currentProgressCallback = onProgress || null;

    try {
      const result = await this.changeSpeed(inputFile, speed);
      return result;
    } finally {
      // 恢复之前的回调
      this.currentProgressCallback = previousCallback;
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
    }
  }
}
