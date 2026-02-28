import { VERTEX_SHADER, FRAGMENT_SHADER, type FilterParams } from "../shaders";

// 重新导出 FilterParams 类型，保持兼容性
export type { FilterParams };

/**
 * GPU 渲染器接口
 */
export interface IGPURenderer {
  init(): Promise<boolean>;
  processFrame(videoFrame: VideoFrame, params: FilterParams): Uint8ClampedArray | null;
  destroy(): void;
  isAvailable(): boolean;
}

/**
 * WebGL 硬件加速渲染器
 * 使用 GPU 并行处理像素，支持多种滤镜效果
 * 着色器代码从 shaders.ts 导入，与预览组件共享
 */
export class WebGLFilterRenderer implements IGPURenderer {
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

    // 编译着色器（使用共享的着色器代码）
    const vertexShader = this.compileShader(gl.VERTEX_SHADER, VERTEX_SHADER);
    const fragmentShader = this.compileShader(gl.FRAGMENT_SHADER, FRAGMENT_SHADER);

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
      -1, -1, 1, -1, -1, 1,
      -1, 1, 1, -1, 1, 1,
    ]);
    const texCoords = new Float32Array([
      0, 1, 1, 1, 0, 0,
      0, 0, 1, 1, 1, 0,
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

