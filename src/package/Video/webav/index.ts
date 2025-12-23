import { MP4Clip, Combinator, OffscreenSprite } from "@webav/av-cliper";

/**
 * WebGL 硬件加速渲染器
 * 使用 GPU 并行处理像素，大幅提升对比度等滤镜的处理速度
 */
class WebGLContrastRenderer {
  private canvas: OffscreenCanvas;
  private gl: WebGL2RenderingContext | WebGLRenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private texture: WebGLTexture | null = null;
  private framebuffer: WebGLFramebuffer | null = null;
  private outputTexture: WebGLTexture | null = null;
  private contrastLocation: WebGLUniformLocation | null = null;
  private positionBuffer: WebGLBuffer | null = null;
  private texCoordBuffer: WebGLBuffer | null = null;
  private isInitialized: boolean = false;
  private width: number = 0;
  private height: number = 0;

  // 顶点着色器
  private static readonly VERTEX_SHADER = `
    attribute vec2 a_position;
    attribute vec2 a_texCoord;
    varying vec2 v_texCoord;
    void main() {
      gl_Position = vec4(a_position, 0.0, 1.0);
      v_texCoord = a_texCoord;
    }
  `;

  // 片段着色器 - 对比度处理
  private static readonly FRAGMENT_SHADER = `
    precision mediump float;
    uniform sampler2D u_texture;
    uniform float u_contrast;
    varying vec2 v_texCoord;
    void main() {
      vec4 color = texture2D(u_texture, v_texCoord);
      // 对比度公式: (color - 0.5) * contrast + 0.5
      vec3 adjusted = (color.rgb - 0.5) * u_contrast + 0.5;
      gl_FragColor = vec4(clamp(adjusted, 0.0, 1.0), color.a);
    }
  `;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.canvas = new OffscreenCanvas(width, height);
  }

  /**
   * 初始化 WebGL 上下文和着色器
   */
  init(): boolean {
    if (this.isInitialized) return true;

    // 尝试获取 WebGL2，否则回退到 WebGL1
    this.gl = this.canvas.getContext("webgl2") as WebGL2RenderingContext | null;
    if (!this.gl) {
      this.gl = this.canvas.getContext("webgl") as WebGLRenderingContext | null;
    }

    if (!this.gl) {
      console.warn("[WebGL] WebGL 不可用，将使用 CPU 处理");
      return false;
    }

    const gl = this.gl;

    // 编译着色器
    const vertexShader = this.compileShader(gl.VERTEX_SHADER, WebGLContrastRenderer.VERTEX_SHADER);
    const fragmentShader = this.compileShader(gl.FRAGMENT_SHADER, WebGLContrastRenderer.FRAGMENT_SHADER);

    if (!vertexShader || !fragmentShader) {
      console.warn("[WebGL] 着色器编译失败");
      return false;
    }

    // 创建程序
    this.program = gl.createProgram();
    if (!this.program) return false;

    gl.attachShader(this.program, vertexShader);
    gl.attachShader(this.program, fragmentShader);
    gl.linkProgram(this.program);

    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
      console.warn("[WebGL] 程序链接失败:", gl.getProgramInfoLog(this.program));
      return false;
    }

    gl.useProgram(this.program);

    // 设置顶点数据
    const positions = new Float32Array([
      -1, -1,  1, -1,  -1, 1,
      -1, 1,   1, -1,   1, 1,
    ]);
    const texCoords = new Float32Array([
      0, 1,  1, 1,  0, 0,
      0, 0,  1, 1,  1, 0,
    ]);

    // 位置缓冲
    this.positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
    const positionLocation = gl.getAttribLocation(this.program, "a_position");
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

    // 纹理坐标缓冲
    this.texCoordBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, texCoords, gl.STATIC_DRAW);
    const texCoordLocation = gl.getAttribLocation(this.program, "a_texCoord");
    gl.enableVertexAttribArray(texCoordLocation);
    gl.vertexAttribPointer(texCoordLocation, 2, gl.FLOAT, false, 0, 0);

    // 获取 uniform 位置
    this.contrastLocation = gl.getUniformLocation(this.program, "u_contrast");

    // 创建输入纹理
    this.texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    // 设置视口
    gl.viewport(0, 0, this.width, this.height);

    this.isInitialized = true;
    console.log("[WebGL] 硬件加速初始化成功");
    return true;
  }

  /**
   * 编译着色器
   */
  private compileShader(type: number, source: string): WebGLShader | null {
    if (!this.gl) return null;
    const shader = this.gl.createShader(type);
    if (!shader) return null;

    this.gl.shaderSource(shader, source);
    this.gl.compileShader(shader);

    if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
      console.warn("[WebGL] 着色器编译错误:", this.gl.getShaderInfoLog(shader));
      this.gl.deleteShader(shader);
      return null;
    }

    return shader;
  }

  /**
   * 使用 GPU 处理视频帧的对比度
   * @param videoFrame 输入的视频帧
   * @param contrast 对比度值
   * @returns 处理后的像素数据
   */
  processFrame(videoFrame: VideoFrame, contrast: number): Uint8ClampedArray | null {
    if (!this.gl || !this.program || !this.texture) {
      return null;
    }

    const gl = this.gl;

    // 上传视频帧到纹理
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, videoFrame);

    // 设置对比度
    gl.uniform1f(this.contrastLocation, contrast);

    // 渲染
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    // 读取结果
    const pixels = new Uint8ClampedArray(this.width * this.height * 4);
    gl.readPixels(0, 0, this.width, this.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

    // WebGL 的 Y 轴是反的，需要翻转
    const flipped = new Uint8ClampedArray(pixels.length);
    const rowSize = this.width * 4;
    for (let y = 0; y < this.height; y++) {
      const srcOffset = y * rowSize;
      const dstOffset = (this.height - 1 - y) * rowSize;
      flipped.set(pixels.subarray(srcOffset, srcOffset + rowSize), dstOffset);
    }

    return flipped;
  }

  /**
   * 直接处理 ImageBitmap 或 Canvas
   */
  processImageSource(source: ImageBitmap | OffscreenCanvas | HTMLCanvasElement, contrast: number): Uint8ClampedArray | null {
    if (!this.gl || !this.program || !this.texture) {
      return null;
    }

    const gl = this.gl;

    // 上传图像到纹理
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);

    // 设置对比度
    gl.uniform1f(this.contrastLocation, contrast);

    // 渲染
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    // 读取结果
    const pixels = new Uint8ClampedArray(this.width * this.height * 4);
    gl.readPixels(0, 0, this.width, this.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

    // WebGL 的 Y 轴是反的，需要翻转
    const flipped = new Uint8ClampedArray(pixels.length);
    const rowSize = this.width * 4;
    for (let y = 0; y < this.height; y++) {
      const srcOffset = y * rowSize;
      const dstOffset = (this.height - 1 - y) * rowSize;
      flipped.set(pixels.subarray(srcOffset, srcOffset + rowSize), dstOffset);
    }

    return flipped;
  }

  /**
   * 获取 Canvas 用于创建 VideoFrame
   */
  getCanvas(): OffscreenCanvas {
    return this.canvas;
  }

  /**
   * 检查是否可用
   */
  isAvailable(): boolean {
    return this.isInitialized && this.gl !== null;
  }

  /**
   * 销毁资源
   */
  destroy(): void {
    if (this.gl) {
      if (this.texture) this.gl.deleteTexture(this.texture);
      if (this.outputTexture) this.gl.deleteTexture(this.outputTexture);
      if (this.framebuffer) this.gl.deleteFramebuffer(this.framebuffer);
      if (this.positionBuffer) this.gl.deleteBuffer(this.positionBuffer);
      if (this.texCoordBuffer) this.gl.deleteBuffer(this.texCoordBuffer);
      if (this.program) this.gl.deleteProgram(this.program);
    }
    this.isInitialized = false;
  }
}

/**
 * WebAV 封装类，负责基于 WebCodecs 的视频处理实现
 * 提供与 FFmpegWrapper 相同的接口
 * 
 * 参考文档: https://webav-tech.github.io/WebAV/_api/av-cliper/
 * 
 * 倍速实现原理（基于 demo）：
 * - 使用 clip.tick(time) 可以读取视频指定时间点的帧
 * - 倍速播放时：outputTime -> sourceTime = outputTime * speed
 * - 例如 2x 倍速：输出第 1 秒时，从源视频的第 2 秒读取帧
 * 
 * 对比度处理：
 * - 优先使用 WebGL 硬件加速（GPU 并行处理）
 * - 如果 WebGL 不可用，回退到 CPU 处理（使用 LUT 优化）
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
   * 
   * 基于 demo 的实现原理：
   * - 使用 clip.tick(sourceTime) 读取源视频指定时间的帧
   * - 倍速公式：sourceTime = outputTime * speed
   * - 例如 2x 倍速：输出第 0.5 秒时，从源视频第 1 秒读取帧
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

      // 读取视频文件
      const videoBuffer = await inputFile.arrayBuffer();
      const videoData = new Uint8Array(videoBuffer);
      
      // 创建用于读取源帧的 clip
      const sourceClip = new MP4Clip(new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(videoData));
          controller.close();
        },
      }));
      await sourceClip.ready;
      this.updateProgress(10);

      const meta = sourceClip.meta;
      const originalDurationUs = meta.duration; // 微秒
      const newDurationUs = originalDurationUs / speed;
      
      // 输出帧率和帧间隔
      const fps = 30;
      const frameIntervalUs = 1_000_000 / fps; // 每帧间隔（微秒）
      const totalOutputFrames = Math.ceil(newDurationUs / frameIntervalUs);
      
      console.log("[WebAV] 视频信息:", {
        width: meta.width,
        height: meta.height,
        originalDurationSec: originalDurationUs / 1e6,
        newDurationSec: newDurationUs / 1e6,
        speed,
        fps,
        totalOutputFrames,
      });

      this.updateProgress(15);

      // 创建 Canvas 用于绘制帧
      const canvas = new OffscreenCanvas(meta.width, meta.height);
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        throw new Error("无法创建 Canvas 上下文");
      }

      // 预先提取所有需要的帧的图像数据
      // 核心逻辑：对于输出的每一帧（outputTime），从源视频的 sourceTime = outputTime * speed 位置读取
      const frameImages: ImageData[] = [];
      
      for (let i = 0; i < totalOutputFrames; i++) {
        const outputTimeUs = i * frameIntervalUs;
        const sourceTimeUs = Math.round(outputTimeUs * speed);
        
        // 超出源视频时长则停止
        if (sourceTimeUs >= originalDurationUs) break;

        // 从源视频读取指定时间的帧（这是 demo 中的核心方法）
        const { state, video } = await sourceClip.tick(sourceTimeUs);
        
        if (state === "done") break;
        
        if (video != null && state === "success") {
          // 绘制到 canvas
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(video, 0, 0, video.codedWidth, video.codedHeight, 0, 0, canvas.width, canvas.height);
          video.close();

          // 保存图像数据
          frameImages.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
        }

        // 更新进度 (15% - 55%)
        const progress = 15 + (i / totalOutputFrames) * 40;
        this.updateProgress(Math.min(55, progress));

        // 每处理一些帧后让出控制权，避免阻塞 UI
        if (i % 10 === 0) {
          await new Promise(resolve => setTimeout(resolve, 0));
        }
      }

      console.log("[WebAV] 帧提取完成，共", frameImages.length, "帧");
      this.updateProgress(60);

      // 销毁源 clip
      sourceClip.destroy();

      // 创建新的 clip 用于输出
      const outputClip = new MP4Clip(new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(videoData));
          controller.close();
        },
      }));
      await outputClip.ready;

      // 使用 tickInterceptor 替换帧
      outputClip.tickInterceptor = async (time, tickRet) => {
        // 计算当前应该使用哪一帧
        const targetIndex = Math.min(
          Math.floor(time / frameIntervalUs),
          frameImages.length - 1
        );
        
        if (targetIndex >= 0 && targetIndex < frameImages.length && tickRet.video) {
          // 将预处理的帧数据绘制到 canvas
          ctx.putImageData(frameImages[targetIndex], 0, 0);
          
          // 创建新的 VideoFrame，使用新的时间戳
          const newFrame = new VideoFrame(canvas, {
            timestamp: time,
            duration: frameIntervalUs,
          });
          
          tickRet.video.close();
          tickRet.video = newFrame;
        }
        
        return tickRet;
      };

      this.updateProgress(65);

      // 使用 OffscreenSprite 包装，设置新的时长
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
      console.log("[WebAV] 倍速处理完成，输出大小:", totalSize, "输出帧数:", frameImages.length);

      // 清理资源
      outputClip.destroy();
      frameImages.length = 0;

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
      return new Blob([await inputFile.arrayBuffer()], { type: "video/mp4" });
    }

    // 使用 applyFilters 实现对比度
    return this.applyFilters(inputFile, { speed: 1.0, contrast });
  }

  /**
   * 应用多个视频滤镜（倍速和对比度可以叠加）
   * 
   * 实现原理：
   * - 倍速：使用 clip.tick(outputTime * speed) 从源视频读取帧
   * - 对比度：使用 Canvas 对每帧进行像素级处理
   * 
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

      // 读取视频文件（只读取一次，复用 buffer）
      const videoBuffer = await inputFile.arrayBuffer();
      const videoData = new Uint8Array(videoBuffer);
      
      // 创建用于读取源帧的 clip
      const sourceClip = new MP4Clip(new ReadableStream({
        start(controller) {
          controller.enqueue(videoData.slice()); // 使用 slice 避免 detached
          controller.close();
        },
      }));
      await sourceClip.ready;
      this.updateProgress(10);

      const meta = sourceClip.meta;
      const { width, height, duration: originalDurationUs } = meta;
      const newDurationUs = originalDurationUs / speed;
      
      const fps = 30;
      const frameIntervalUs = 1_000_000 / fps;
      const totalOutputFrames = Math.ceil(newDurationUs / frameIntervalUs);

      console.log("[WebAV] 视频信息:", {
        width,
        height,
        originalDurationSec: originalDurationUs / 1e6,
        newDurationSec: newDurationUs / 1e6,
        speed,
        contrast,
        totalOutputFrames,
      });

      this.updateProgress(15);

      // 尝试使用 WebGL 硬件加速
      const glRenderer = new WebGLContrastRenderer(width, height);
      const useWebGL = glRenderer.init();
      
      // 创建 2D Canvas 用于绘制帧和回退处理
      const canvas = new OffscreenCanvas(width, height);
      const ctx = canvas.getContext("2d", { 
        willReadFrequently: true,
        alpha: false,
      });
      if (!ctx) {
        throw new Error("无法创建 Canvas 上下文");
      }

      // CPU 回退：预计算对比度 LUT（查找表）
      let contrastLUT: Uint8ClampedArray | null = null;
      if (!useWebGL) {
        contrastLUT = new Uint8ClampedArray(256);
        const factor = contrast;
        for (let i = 0; i < 256; i++) {
          contrastLUT[i] = Math.max(0, Math.min(255, (i - 128) * factor + 128));
        }
      }

      // 性能优化：预分配帧数据数组
      const frameBuffers: Uint8ClampedArray[] = new Array(totalOutputFrames);
      let actualFrameCount = 0;

      // CPU 回退：使用 LUT 快速应用对比度
      const applyContrastCPU = (data: Uint8ClampedArray) => {
        if (!contrastLUT) return;
        const len = data.length;
        for (let i = 0; i < len; i += 16) {
          data[i] = contrastLUT[data[i]];
          data[i + 1] = contrastLUT[data[i + 1]];
          data[i + 2] = contrastLUT[data[i + 2]];
          
          data[i + 4] = contrastLUT[data[i + 4]];
          data[i + 5] = contrastLUT[data[i + 5]];
          data[i + 6] = contrastLUT[data[i + 6]];
          
          data[i + 8] = contrastLUT[data[i + 8]];
          data[i + 9] = contrastLUT[data[i + 9]];
          data[i + 10] = contrastLUT[data[i + 10]];
          
          data[i + 12] = contrastLUT[data[i + 12]];
          data[i + 13] = contrastLUT[data[i + 13]];
          data[i + 14] = contrastLUT[data[i + 14]];
        }
      };

      console.log(`[WebAV] 使用 ${useWebGL ? 'WebGL 硬件加速' : 'CPU'} 处理对比度`);

      // 批量提取帧，减少进度更新频率
      const progressUpdateInterval = Math.max(1, Math.floor(totalOutputFrames / 20));
      
      for (let i = 0; i < totalOutputFrames; i++) {
        const sourceTimeUs = Math.round(i * frameIntervalUs * speed);
        
        if (sourceTimeUs >= originalDurationUs) break;

        const { state, video } = await sourceClip.tick(sourceTimeUs);
        
        if (state === "done") break;
        
        if (video != null && state === "success") {
          let processedPixels: Uint8ClampedArray | null = null;

          if (useWebGL) {
            // WebGL 硬件加速处理
            processedPixels = glRenderer.processFrame(video, contrast);
            video.close();
          }
          
          if (!processedPixels) {
            // CPU 回退处理
            ctx.drawImage(video, 0, 0, video.codedWidth, video.codedHeight, 0, 0, width, height);
            if (video.close) video.close();
            
            const imageData = ctx.getImageData(0, 0, width, height);
            applyContrastCPU(imageData.data);
            processedPixels = new Uint8ClampedArray(imageData.data);
          }
          
          frameBuffers[actualFrameCount] = processedPixels;
          actualFrameCount++;
        }

        // 减少进度更新频率
        if (i % progressUpdateInterval === 0) {
          const progress = 15 + (i / totalOutputFrames) * 40;
          this.updateProgress(Math.min(55, progress));
          await new Promise(resolve => setTimeout(resolve, 0));
        }
      }

      // 清理 WebGL 资源
      glRenderer.destroy();

      console.log("[WebAV] 帧处理完成，共", actualFrameCount, "帧");
      this.updateProgress(60);

      // 销毁源 clip
      sourceClip.destroy();

      // 创建新的 clip 用于输出
      const outputClip = new MP4Clip(new ReadableStream({
        start(controller) {
          controller.enqueue(videoData.slice());
          controller.close();
        },
      }));
      await outputClip.ready;

      // 预创建 ImageData 对象复用
      const reusableImageData = ctx.createImageData(width, height);

      // 使用 tickInterceptor 替换帧
      outputClip.tickInterceptor = async (time, tickRet) => {
        const targetIndex = Math.min(
          Math.floor(time / frameIntervalUs),
          actualFrameCount - 1
        );
        
        if (targetIndex >= 0 && targetIndex < actualFrameCount && tickRet.video) {
          // 复用 ImageData，只更新数据
          reusableImageData.data.set(frameBuffers[targetIndex]);
          ctx.putImageData(reusableImageData, 0, 0);
          
          const newFrame = new VideoFrame(canvas, {
            timestamp: time,
            duration: frameIntervalUs,
          });
          
          tickRet.video.close();
          tickRet.video = newFrame;
        }
        
        return tickRet;
      };

      this.updateProgress(65);

      // 使用 OffscreenSprite 包装
      const sprite = new OffscreenSprite(outputClip);
      sprite.time = { offset: 0, duration: newDurationUs };

      const combinator = new Combinator({ width, height });

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

      // 合并数据（预分配大小）
      const resultBuffer = new Uint8Array(totalBytes);
      let offset = 0;
      for (const chunk of chunks) {
        resultBuffer.set(chunk, offset);
        offset += chunk.length;
      }

      this.updateProgress(100);
      console.log("[WebAV] 滤镜处理完成，输出大小:", totalBytes, "输出帧数:", actualFrameCount);

      // 清理资源
      outputClip.destroy();
      // 显式清理帧缓冲
      for (let i = 0; i < actualFrameCount; i++) {
        frameBuffers[i] = null as any;
      }

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
