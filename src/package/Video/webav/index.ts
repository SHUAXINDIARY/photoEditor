import { MP4Clip, Combinator, OffscreenSprite } from "@webav/av-cliper";
import type { VideoFilterOptions } from "../types";
import { DEFAULT_FILTER_VALUES } from "../types";

/**
 * 视频滤镜参数（用于 GPU 处理）
 */
interface FilterParams {
  contrast: number;
  saturation: number;
  temperature: number;
  shadows: number;
  highlights: number;
}

/**
 * GPU 渲染器接口
 */
interface IGPURenderer {
  init(): Promise<boolean>;
  processFrame(videoFrame: VideoFrame, params: FilterParams): Uint8ClampedArray | null;
  destroy(): void;
  isAvailable(): boolean;
}

/**
 * WebGL 硬件加速渲染器
 * 使用 GPU 并行处理像素，支持多种滤镜效果
 */
class WebGLFilterRenderer implements IGPURenderer {
  private canvas: OffscreenCanvas;
  private gl: WebGL2RenderingContext | WebGLRenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private texture: WebGLTexture | null = null;
  private framebuffer: WebGLFramebuffer | null = null;
  private outputTexture: WebGLTexture | null = null;
  private positionBuffer: WebGLBuffer | null = null;
  private texCoordBuffer: WebGLBuffer | null = null;
  private isInitialized: boolean = false;
  private width: number = 0;
  private height: number = 0;

  // Uniform 位置
  private contrastLocation: WebGLUniformLocation | null = null;
  private saturationLocation: WebGLUniformLocation | null = null;
  private temperatureLocation: WebGLUniformLocation | null = null;
  private shadowsLocation: WebGLUniformLocation | null = null;
  private highlightsLocation: WebGLUniformLocation | null = null;

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

  // 片段着色器 - 统一滤镜算法（与预览组件和 FFmpeg 保持一致）
  private static readonly FRAGMENT_SHADER = `
    precision mediump float;
    uniform sampler2D u_texture;
    uniform float u_contrast;
    uniform float u_saturation;
    uniform float u_temperature;
    uniform float u_shadows;
    uniform float u_highlights;
    varying vec2 v_texCoord;
    
    void main() {
      vec4 color = texture2D(u_texture, v_texCoord);
      vec3 rgb = color.rgb;
      
      // 1. 对比度调整 (与 FFmpeg eq=contrast 一致)
      rgb = (rgb - 0.5) * u_contrast + 0.5;
      
      // 2. 饱和度调整 (与 FFmpeg eq=saturation 一致)
      float gray = dot(rgb, vec3(0.299, 0.587, 0.114));
      rgb = mix(vec3(gray), rgb, u_saturation);
      
      // 3. 阴影调整 - 使用 gamma 曲线 (与 FFmpeg eq=gamma 一致)
      // shadows > 1 提亮暗部, shadows < 1 压暗暗部
      if (u_shadows != 1.0) {
        float gamma = 1.0 / pow(u_shadows, 0.6);
        rgb = pow(rgb, vec3(gamma));
      }
      
      // 4. 高光调整 - 使用 brightness (与 FFmpeg eq=brightness 一致)
      if (u_highlights != 1.0) {
        float brightness = (u_highlights - 1.0) * 0.3;
        rgb = rgb + brightness;
      }
      
      // 5. 色温调整 (与 FFmpeg colorbalance 一致)
      if (u_temperature != 0.0) {
        if (u_temperature > 0.0) {
          // 暖色调：增加红/黄，减少蓝
          rgb.r = rgb.r + u_temperature * 0.15;
          rgb.g = rgb.g + u_temperature * 0.05;
          rgb.b = rgb.b - u_temperature * 0.15;
        } else {
          // 冷色调：减少红，增加蓝
          float cool = abs(u_temperature);
          rgb.r = rgb.r - cool * 0.1;
          rgb.g = rgb.g - cool * 0.02;
          rgb.b = rgb.b + cool * 0.15;
        }
      }
      
      gl_FragColor = vec4(clamp(rgb, 0.0, 1.0), color.a);
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
    const vertexShader = this.compileShader(gl.VERTEX_SHADER, WebGLFilterRenderer.VERTEX_SHADER);
    const fragmentShader = this.compileShader(gl.FRAGMENT_SHADER, WebGLFilterRenderer.FRAGMENT_SHADER);

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
    this.saturationLocation = gl.getUniformLocation(this.program, "u_saturation");
    this.temperatureLocation = gl.getUniformLocation(this.program, "u_temperature");
    this.shadowsLocation = gl.getUniformLocation(this.program, "u_shadows");
    this.highlightsLocation = gl.getUniformLocation(this.program, "u_highlights");

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
   * 使用 GPU 处理视频帧
   * @param videoFrame 输入的视频帧
   * @param params 滤镜参数
   * @returns 处理后的像素数据
   */
  processFrame(videoFrame: VideoFrame, params: FilterParams): Uint8ClampedArray | null {
    if (!this.gl || !this.program || !this.texture) {
      return null;
    }

    const gl = this.gl;

    // 上传视频帧到纹理
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, videoFrame);

    // 设置滤镜参数
    gl.uniform1f(this.contrastLocation, params.contrast);
    gl.uniform1f(this.saturationLocation, params.saturation);
    gl.uniform1f(this.temperatureLocation, params.temperature);
    gl.uniform1f(this.shadowsLocation, params.shadows);
    gl.uniform1f(this.highlightsLocation, params.highlights);

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
   * 检查是否需要应用图像滤镜
   */
  private needsImageFilters(options: VideoFilterOptions): boolean {
    const contrast = options.contrast ?? DEFAULT_FILTER_VALUES.contrast;
    const saturation = options.saturation ?? DEFAULT_FILTER_VALUES.saturation;
    const temperature = options.temperature ?? DEFAULT_FILTER_VALUES.temperature;
    const shadows = options.shadows ?? DEFAULT_FILTER_VALUES.shadows;
    const highlights = options.highlights ?? DEFAULT_FILTER_VALUES.highlights;

    return (
      contrast !== DEFAULT_FILTER_VALUES.contrast ||
      saturation !== DEFAULT_FILTER_VALUES.saturation ||
      temperature !== DEFAULT_FILTER_VALUES.temperature ||
      shadows !== DEFAULT_FILTER_VALUES.shadows ||
      highlights !== DEFAULT_FILTER_VALUES.highlights
    );
  }

  /**
   * 应用多个视频滤镜
   * 
   * 实现原理：
   * - 倍速：使用 clip.tick(outputTime * speed) 从源视频读取帧
   * - 图像滤镜：使用 WebGL GPU 加速处理每帧
   * 
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

    // 检查是否需要处理
    const needsImageProcessing = this.needsImageFilters(options);
    const needsSpeedProcessing = speed !== DEFAULT_FILTER_VALUES.speed;

    // 如果都是默认值，直接返回原文件
    if (!needsImageProcessing && !needsSpeedProcessing) {
      return new Blob([await inputFile.arrayBuffer()], { type: "video/mp4" });
    }

    // 如果只需要调整倍速，使用专门的倍速方法
    if (!needsImageProcessing) {
      return this.changeSpeed(inputFile, speed);
    }

    try {
      console.log("[WebAV] 开始应用滤镜");
      console.log("[WebAV] 效果参数:", { speed, contrast, saturation, temperature, shadows, highlights });
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
      });

      this.updateProgress(15);

      // 准备滤镜参数
      const filterParams: FilterParams = {
        contrast,
        saturation,
        temperature,
        shadows,
        highlights,
      };

      // 尝试使用 WebGL 硬件加速
      let gpuRenderer: IGPURenderer | null = null;
      let useGPU = false;
      let gpuType = "CPU";

      const webglRenderer = new WebGLFilterRenderer(width, height);
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

      // 性能优化：预分配 ImageData 对象，避免每帧重复创建
      const reusableImageData = ctx.createImageData(width, height);
      const pixelData = reusableImageData.data;
      const pixelCount = width * height * 4;

      // CPU 滤镜处理函数（与 WebGL 着色器算法一致）
      const applyFiltersCPU = () => {
        // 预计算 gamma 值
        const gamma = shadows !== 1.0 ? 1.0 / Math.pow(shadows, 0.6) : 1.0;

        for (let i = 0; i < pixelCount; i += 4) {
          let r = pixelData[i] / 255;
          let g = pixelData[i + 1] / 255;
          let b = pixelData[i + 2] / 255;

          // 1. 对比度 (与 WebGL 一致)
          r = (r - 0.5) * contrast + 0.5;
          g = (g - 0.5) * contrast + 0.5;
          b = (b - 0.5) * contrast + 0.5;

          // 2. 饱和度 (与 WebGL 一致)
          if (saturation !== 1.0) {
            const gray = 0.299 * r + 0.587 * g + 0.114 * b;
            r = gray + (r - gray) * saturation;
            g = gray + (g - gray) * saturation;
            b = gray + (b - gray) * saturation;
          }

          // 3. 阴影 - gamma 曲线 (与 WebGL 一致)
          if (shadows !== 1.0) {
            r = Math.pow(Math.max(0, r), gamma);
            g = Math.pow(Math.max(0, g), gamma);
            b = Math.pow(Math.max(0, b), gamma);
          }

          // 4. 高光 - brightness (与 WebGL 一致)
          if (highlights !== 1.0) {
            const brightness = (highlights - 1.0) * 0.3;
            r = r + brightness;
            g = g + brightness;
            b = b + brightness;
          }

          // 5. 色温 (与 WebGL 一致)
          if (temperature !== 0) {
            if (temperature > 0) {
              r = r + temperature * 0.15;
              g = g + temperature * 0.05;
              b = b - temperature * 0.15;
            } else {
              const cool = Math.abs(temperature);
              r = r - cool * 0.1;
              g = g - cool * 0.02;
              b = b + cool * 0.15;
            }
          }

          // 转回 0-255 并 clamp
          pixelData[i] = Math.max(0, Math.min(255, r * 255));
          pixelData[i + 1] = Math.max(0, Math.min(255, g * 255));
          pixelData[i + 2] = Math.max(0, Math.min(255, b * 255));
        }
      };

      console.log(`[WebAV] 使用 ${gpuType} 处理滤镜`);

      // 帧计数用于进度更新
      let frameCount = 0;
      const estimatedFrames = Math.ceil(originalDurationUs / (1_000_000 / 30));
      const progressInterval = Math.max(10, Math.floor(estimatedFrames / 20));
      let nextProgressUpdate = progressInterval;
      const speedInverse = 1 / speed;

      // 使用 WebAV 的 tickInterceptor 直接处理每一帧
      clip.tickInterceptor = async (_, tickRet) => {
        if (tickRet.video) {
          const video = tickRet.video;
          const originalTimestamp = video.timestamp;
          const originalDuration = video.duration;

          // 优先使用 GPU 处理
          if (useGPU && gpuRenderer) {
            const processedPixels = gpuRenderer.processFrame(video, filterParams);
            if (processedPixels) {
              pixelData.set(processedPixels);
              ctx.putImageData(reusableImageData, 0, 0);
            } else {
              // GPU 失败，回退到 CPU
              ctx.drawImage(video, 0, 0);
              const tempData = ctx.getImageData(0, 0, width, height);
              pixelData.set(tempData.data);
              applyFiltersCPU();
              ctx.putImageData(reusableImageData, 0, 0);
            }
          } else {
            // CPU 处理
            ctx.drawImage(video, 0, 0);
            const tempData = ctx.getImageData(0, 0, width, height);
            pixelData.set(tempData.data);
            applyFiltersCPU();
            ctx.putImageData(reusableImageData, 0, 0);
          }

          // 创建新的 VideoFrame
          const newFrame = new VideoFrame(canvas, {
            timestamp: originalTimestamp * speedInverse,
            duration: originalDuration ? originalDuration * speedInverse : undefined,
          });

          video.close();
          tickRet.video = newFrame;

          // 更新进度
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
