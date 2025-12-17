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

        this.ffmpeg.on("progress", ({ progress }) => {
          this.loadingProgress = progress * 100;
          console.log(`[FFmpeg] 加载进度: ${this.loadingProgress.toFixed(2)}%`);
        });
      } catch (eventError) {
        console.warn("[FFmpeg] 设置事件监听器失败，继续执行:", eventError);
      }

      this.isLoaded = true;
      console.log("[FFmpeg] 初始化完成");
    } catch (error) {
      console.error("[FFmpeg] 初始化失败:", error);
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

    if (speed <= 0) {
      throw new Error("倍速值必须大于 0");
    }

    try {
      const inputFileName = "input.mp4";
      const outputFileName = "output.mp4";

      // 将输入文件写入 FFmpeg 文件系统
      await this.ffmpeg.writeFile(inputFileName, await fetchFile(inputFile));

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
      await this.ffmpeg.exec([
        "-i",
        inputFileName,
        "-filter_complex",
        filterComplex,
        "-map",
        "[v]",
        "-map",
        "[a]",
        "-c:v",
        "libx264",
        "-c:a",
        "aac",
        "-preset",
        "fast",
        "-crf",
        "23",
        outputFileName,
      ]);

      // 读取输出文件
      const data = await this.ffmpeg.readFile(outputFileName);

      // 清理文件
      await this.ffmpeg.deleteFile(inputFileName);
      await this.ffmpeg.deleteFile(outputFileName);

      // 转换为 Blob
      // data 可能是 Uint8Array 或 string
      if (data instanceof Uint8Array) {
        // 创建一个新的 ArrayBuffer 来避免类型问题
        const arrayBuffer = new ArrayBuffer(data.length);
        const view = new Uint8Array(arrayBuffer);
        view.set(data);
        return new Blob([arrayBuffer], { type: "video/mp4" });
      } else if (typeof data === "string") {
        // 如果是 base64 字符串，需要转换
        const binaryString = atob(data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        return new Blob([bytes.buffer], { type: "video/mp4" });
      } else {
        return new Blob([data], { type: "video/mp4" });
      }
    } catch (error) {
      console.error("[FFmpeg] 视频处理失败:", error);
      throw new Error(
        `视频倍速处理失败: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
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

    // 设置进度监听
    let progressHandler: ((event: any) => void) | undefined;
    if (onProgress) {
      progressHandler = ({ progress }: { progress: number }) => {
        onProgress(progress * 100);
      };
      this.ffmpeg.on("progress", progressHandler);
    }

    try {
      const result = await this.changeSpeed(inputFile, speed);
      return result;
    } finally {
      // 移除进度监听
      if (onProgress && progressHandler) {
        this.ffmpeg.off("progress", progressHandler);
      }
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
