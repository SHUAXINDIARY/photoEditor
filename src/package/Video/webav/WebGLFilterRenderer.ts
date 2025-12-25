/**
 * 视频滤镜参数（用于 GPU 处理）
 */
export interface FilterParams {
  contrast: number;
  saturation: number;
  temperature: number;
  shadows: number;
  highlights: number;
}

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

