import { MP4Clip, Combinator, OffscreenSprite } from "@webav/av-cliper";

/**
 * GPU 渲染器接口
 */
interface IGPURenderer {
  init(): Promise<boolean>;
  processFrame(videoFrame: VideoFrame, contrast: number): Uint8ClampedArray | null;
  destroy(): void;
  isAvailable(): boolean;
}

/**
 * WebGL 硬件加速渲染器
 * 使用 GPU 并行处理像素，大幅提升对比度等滤镜的处理速度
 */
class WebGLContrastRenderer implements IGPURenderer {
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
  async init(): Promise<boolean> {
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

      // 读取视频文件
      const videoBuffer = await inputFile.arrayBuffer();
      const videoData = new Uint8Array(videoBuffer);
      
      // 创建 MP4Clip
      const clip = new MP4Clip(new ReadableStream({
        start(controller) {
          controller.enqueue(videoData.slice());
          controller.close();
        },
      }));
      await clip.ready;
      this.updateProgress(10);

      const meta = clip.meta;
      const { width, height, duration: originalDurationUs } = meta;
      const newDurationUs = originalDurationUs / speed;

      console.log("[WebAV] 视频信息:", {
        width,
        height,
        originalDurationSec: originalDurationUs / 1e6,
        newDurationSec: newDurationUs / 1e6,
        speed,
        contrast,
      });

      this.updateProgress(15);

      // 尝试使用 WebGL 硬件加速
      let gpuRenderer: IGPURenderer | null = null;
      let useGPU = false;
      let gpuType = "CPU";

      const webglRenderer = new WebGLContrastRenderer(width, height);
      if (await webglRenderer.init()) {
        gpuRenderer = webglRenderer;
        useGPU = true;
        gpuType = "WebGL";
      } else {
        webglRenderer.destroy();
      }
      
      // 创建 2D Canvas 用于 CPU 回退和 VideoFrame 创建
      const canvas = new OffscreenCanvas(width, height);
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) {
        throw new Error("无法创建 Canvas 上下文");
      }

      // CPU 回退：预计算对比度 LUT
      const contrastLUT = new Uint8ClampedArray(256);
      for (let i = 0; i < 256; i++) {
        contrastLUT[i] = Math.max(0, Math.min(255, (i - 128) * contrast + 128));
      }

      // 性能优化：预分配 ImageData 对象，避免每帧重复创建
      const reusableImageData = ctx.createImageData(width, height);
      const pixelData = reusableImageData.data;
      const pixelCount = width * height * 4;

      // CPU 对比度处理函数（使用 LUT + 循环展开优化）
      const applyContrastCPU = () => {
        // 每次处理 16 个像素（64 字节），减少循环开销
        let i = 0;
        const len16 = pixelCount - 63;
        
        // 主循环：每次处理 16 像素
        for (; i < len16; i += 64) {
          pixelData[i] = contrastLUT[pixelData[i]];
          pixelData[i + 1] = contrastLUT[pixelData[i + 1]];
          pixelData[i + 2] = contrastLUT[pixelData[i + 2]];
          pixelData[i + 4] = contrastLUT[pixelData[i + 4]];
          pixelData[i + 5] = contrastLUT[pixelData[i + 5]];
          pixelData[i + 6] = contrastLUT[pixelData[i + 6]];
          pixelData[i + 8] = contrastLUT[pixelData[i + 8]];
          pixelData[i + 9] = contrastLUT[pixelData[i + 9]];
          pixelData[i + 10] = contrastLUT[pixelData[i + 10]];
          pixelData[i + 12] = contrastLUT[pixelData[i + 12]];
          pixelData[i + 13] = contrastLUT[pixelData[i + 13]];
          pixelData[i + 14] = contrastLUT[pixelData[i + 14]];
          pixelData[i + 16] = contrastLUT[pixelData[i + 16]];
          pixelData[i + 17] = contrastLUT[pixelData[i + 17]];
          pixelData[i + 18] = contrastLUT[pixelData[i + 18]];
          pixelData[i + 20] = contrastLUT[pixelData[i + 20]];
          pixelData[i + 21] = contrastLUT[pixelData[i + 21]];
          pixelData[i + 22] = contrastLUT[pixelData[i + 22]];
          pixelData[i + 24] = contrastLUT[pixelData[i + 24]];
          pixelData[i + 25] = contrastLUT[pixelData[i + 25]];
          pixelData[i + 26] = contrastLUT[pixelData[i + 26]];
          pixelData[i + 28] = contrastLUT[pixelData[i + 28]];
          pixelData[i + 29] = contrastLUT[pixelData[i + 29]];
          pixelData[i + 30] = contrastLUT[pixelData[i + 30]];
          pixelData[i + 32] = contrastLUT[pixelData[i + 32]];
          pixelData[i + 33] = contrastLUT[pixelData[i + 33]];
          pixelData[i + 34] = contrastLUT[pixelData[i + 34]];
          pixelData[i + 36] = contrastLUT[pixelData[i + 36]];
          pixelData[i + 37] = contrastLUT[pixelData[i + 37]];
          pixelData[i + 38] = contrastLUT[pixelData[i + 38]];
          pixelData[i + 40] = contrastLUT[pixelData[i + 40]];
          pixelData[i + 41] = contrastLUT[pixelData[i + 41]];
          pixelData[i + 42] = contrastLUT[pixelData[i + 42]];
          pixelData[i + 44] = contrastLUT[pixelData[i + 44]];
          pixelData[i + 45] = contrastLUT[pixelData[i + 45]];
          pixelData[i + 46] = contrastLUT[pixelData[i + 46]];
          pixelData[i + 48] = contrastLUT[pixelData[i + 48]];
          pixelData[i + 49] = contrastLUT[pixelData[i + 49]];
          pixelData[i + 50] = contrastLUT[pixelData[i + 50]];
          pixelData[i + 52] = contrastLUT[pixelData[i + 52]];
          pixelData[i + 53] = contrastLUT[pixelData[i + 53]];
          pixelData[i + 54] = contrastLUT[pixelData[i + 54]];
          pixelData[i + 56] = contrastLUT[pixelData[i + 56]];
          pixelData[i + 57] = contrastLUT[pixelData[i + 57]];
          pixelData[i + 58] = contrastLUT[pixelData[i + 58]];
          pixelData[i + 60] = contrastLUT[pixelData[i + 60]];
          pixelData[i + 61] = contrastLUT[pixelData[i + 61]];
          pixelData[i + 62] = contrastLUT[pixelData[i + 62]];
        }
        
        // 处理剩余像素
        for (; i < pixelCount; i += 4) {
          pixelData[i] = contrastLUT[pixelData[i]];
          pixelData[i + 1] = contrastLUT[pixelData[i + 1]];
          pixelData[i + 2] = contrastLUT[pixelData[i + 2]];
        }
      };

      console.log(`[WebAV] 使用 ${gpuType} 处理对比度`);

      // 帧计数用于进度更新
      let frameCount = 0;
      const estimatedFrames = Math.ceil(originalDurationUs / (1_000_000 / 30));
      // 性能优化：预计算进度更新间隔，减少取模运算
      const progressInterval = Math.max(10, Math.floor(estimatedFrames / 20));
      let nextProgressUpdate = progressInterval;
      // 性能优化：预计算速度倒数，避免每帧重复除法
      const speedInverse = 1 / speed;

      // 使用 WebAV 的 tickInterceptor 直接处理每一帧
      clip.tickInterceptor = async (_, tickRet) => {
        if (tickRet.video) {
          const video = tickRet.video;
          const originalTimestamp = video.timestamp;
          const originalDuration = video.duration;

          // 优先使用 GPU 处理（WebGL）
          if (useGPU && gpuRenderer) {
            const processedPixels = gpuRenderer.processFrame(video, contrast);
            if (processedPixels) {
              // GPU 处理成功，直接复制到预分配的 ImageData
              pixelData.set(processedPixels);
              ctx.putImageData(reusableImageData, 0, 0);
            } else {
              // GPU 失败，回退到 CPU
              ctx.drawImage(video, 0, 0);
              // 直接读取到预分配的 ImageData
              const tempData = ctx.getImageData(0, 0, width, height);
              pixelData.set(tempData.data);
              applyContrastCPU();
              ctx.putImageData(reusableImageData, 0, 0);
            }
          } else {
            // CPU 处理
            ctx.drawImage(video, 0, 0);
            const tempData = ctx.getImageData(0, 0, width, height);
            pixelData.set(tempData.data);
            applyContrastCPU();
            ctx.putImageData(reusableImageData, 0, 0);
          }

          // 创建新的 VideoFrame（使用预计算的速度倒数）
          const newFrame = new VideoFrame(canvas, {
            timestamp: originalTimestamp * speedInverse,
            duration: originalDuration ? originalDuration * speedInverse : undefined,
          });

          video.close();
          tickRet.video = newFrame;

          // 更新进度（使用预计算的间隔，避免取模）
          frameCount++;
          if (frameCount >= nextProgressUpdate) {
            nextProgressUpdate += progressInterval;
            const progress = 15 + Math.min(50, (frameCount / estimatedFrames) * 50);
            this.updateProgress(progress);
          }
        }
        return tickRet;
      };

      this.updateProgress(20);

      // 创建 OffscreenSprite 并设置时长
      const sprite = new OffscreenSprite(clip);
      sprite.time = { offset: 0, duration: newDurationUs };

      // 创建 Combinator 合成视频
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

      // 合并数据
      const resultBuffer = new Uint8Array(totalBytes);
      let offset = 0;
      for (const chunk of chunks) {
        resultBuffer.set(chunk, offset);
        offset += chunk.length;
      }

      // 清理资源
      gpuRenderer?.destroy();
      clip.destroy();

      this.updateProgress(100);
      console.log(`[WebAV] 滤镜处理完成 (${gpuType})，输出大小:`, totalBytes);

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
