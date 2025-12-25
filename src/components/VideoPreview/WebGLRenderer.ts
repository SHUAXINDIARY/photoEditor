/**
 * WebGL 视频预览渲染器
 * 使用 GPU 加速进行实时视频滤镜预览
 * 滤镜算法与导出时保持一致
 */

export interface FilterParams {
  contrast: number;
  saturation: number;
  temperature: number;
  shadows: number;
  highlights: number;
}

export const DEFAULT_FILTER_PARAMS: FilterParams = {
  contrast: 1.0,
  saturation: 1.0,
  temperature: 0,
  shadows: 1.0,
  highlights: 1.0,
};

/**
 * 统一的 WebGL 滤镜着色器
 * 此着色器与 WebAV 和 FFmpeg 导出效果保持一致
 */
const VERTEX_SHADER = `
  attribute vec2 a_position;
  attribute vec2 a_texCoord;
  varying vec2 v_texCoord;
  void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
    v_texCoord = a_texCoord;
  }
`;

/**
 * 片段着色器 - 统一的滤镜算法
 * 与 FFmpeg 和 WebAV 导出效果一致
 */
const FRAGMENT_SHADER = `
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

export class WebGLVideoRenderer {
  private canvas: HTMLCanvasElement;
  private gl: WebGLRenderingContext | WebGL2RenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private texture: WebGLTexture | null = null;
  private positionBuffer: WebGLBuffer | null = null;
  private texCoordBuffer: WebGLBuffer | null = null;
  private isInitialized = false;

  // Uniform 位置
  private contrastLocation: WebGLUniformLocation | null = null;
  private saturationLocation: WebGLUniformLocation | null = null;
  private temperatureLocation: WebGLUniformLocation | null = null;
  private shadowsLocation: WebGLUniformLocation | null = null;
  private highlightsLocation: WebGLUniformLocation | null = null;

  // 当前滤镜参数
  private currentParams: FilterParams = { ...DEFAULT_FILTER_PARAMS };

  // 视频源
  private videoElement: HTMLVideoElement | null = null;
  private animationFrameId: number | null = null;
  private isPlaying = false;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
  }

  /**
   * 初始化 WebGL 上下文
   */
  async init(): Promise<boolean> {
    if (this.isInitialized) return true;

    // 尝试获取 WebGL2，否则回退到 WebGL1
    this.gl = this.canvas.getContext("webgl2", { 
      alpha: false,
      antialias: false,
      preserveDrawingBuffer: true,
    }) as WebGL2RenderingContext | null;
    
    if (!this.gl) {
      this.gl = this.canvas.getContext("webgl", {
        alpha: false,
        antialias: false,
        preserveDrawingBuffer: true,
      }) as WebGLRenderingContext | null;
    }

    if (!this.gl) {
      console.error("[WebGLRenderer] WebGL 不可用");
      return false;
    }

    const gl = this.gl;

    // 编译着色器
    const vertexShader = this.compileShader(gl.VERTEX_SHADER, VERTEX_SHADER);
    const fragmentShader = this.compileShader(gl.FRAGMENT_SHADER, FRAGMENT_SHADER);

    if (!vertexShader || !fragmentShader) {
      console.error("[WebGLRenderer] 着色器编译失败");
      return false;
    }

    // 创建程序
    this.program = gl.createProgram();
    if (!this.program) return false;

    gl.attachShader(this.program, vertexShader);
    gl.attachShader(this.program, fragmentShader);
    gl.linkProgram(this.program);

    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
      console.error("[WebGLRenderer] 程序链接失败:", gl.getProgramInfoLog(this.program));
      return false;
    }

    gl.useProgram(this.program);

    // 设置顶点数据（全屏四边形）
    const positions = new Float32Array([
      -1, -1,  1, -1,  -1, 1,
      -1, 1,   1, -1,   1, 1,
    ]);
    // 纹理坐标（Y轴翻转以匹配视频）
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

    // 创建纹理
    this.texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    this.isInitialized = true;
    console.log("[WebGLRenderer] 初始化成功");
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
      console.error("[WebGLRenderer] 着色器编译错误:", this.gl.getShaderInfoLog(shader));
      this.gl.deleteShader(shader);
      return null;
    }

    return shader;
  }

  /**
   * 设置视频源
   */
  setVideoSource(video: HTMLVideoElement): void {
    this.videoElement = video;
    
    // 监听视频事件
    video.addEventListener("play", () => {
      this.isPlaying = true;
      this.startRenderLoop();
    });
    
    video.addEventListener("pause", () => {
      this.isPlaying = false;
    });
    
    video.addEventListener("ended", () => {
      this.isPlaying = false;
    });

    video.addEventListener("seeked", () => {
      this.renderFrame();
    });

    video.addEventListener("loadeddata", () => {
      this.updateCanvasSize();
      this.renderFrame();
    });
  }

  /**
   * 更新画布尺寸
   */
  updateCanvasSize(): void {
    if (!this.videoElement || !this.gl) return;
    
    const video = this.videoElement;
    if (video.videoWidth && video.videoHeight) {
      this.canvas.width = video.videoWidth;
      this.canvas.height = video.videoHeight;
      this.gl.viewport(0, 0, video.videoWidth, video.videoHeight);
    }
  }

  /**
   * 更新滤镜参数
   */
  setFilterParams(params: Partial<FilterParams>): void {
    this.currentParams = { ...this.currentParams, ...params };
    // 如果视频暂停，立即渲染一帧
    if (!this.isPlaying && this.videoElement) {
      this.renderFrame();
    }
  }

  /**
   * 开始渲染循环
   */
  private startRenderLoop(): void {
    if (this.animationFrameId !== null) return;

    const render = () => {
      if (this.isPlaying && this.videoElement && !this.videoElement.paused) {
        this.renderFrame();
        this.animationFrameId = requestAnimationFrame(render);
      } else {
        this.animationFrameId = null;
      }
    };

    this.animationFrameId = requestAnimationFrame(render);
  }

  /**
   * 渲染一帧
   */
  renderFrame(): void {
    if (!this.gl || !this.program || !this.texture || !this.videoElement) return;
    if (this.videoElement.readyState < 2) return; // HAVE_CURRENT_DATA

    const gl = this.gl;

    // 上传视频帧到纹理
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.videoElement);

    // 设置滤镜参数
    gl.uniform1f(this.contrastLocation, this.currentParams.contrast);
    gl.uniform1f(this.saturationLocation, this.currentParams.saturation);
    gl.uniform1f(this.temperatureLocation, this.currentParams.temperature);
    gl.uniform1f(this.shadowsLocation, this.currentParams.shadows);
    gl.uniform1f(this.highlightsLocation, this.currentParams.highlights);

    // 渲染
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  /**
   * 强制渲染（用于滤镜参数变化时）
   */
  forceRender(): void {
    this.renderFrame();
  }

  /**
   * 销毁渲染器
   */
  destroy(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    if (this.gl) {
      if (this.texture) this.gl.deleteTexture(this.texture);
      if (this.positionBuffer) this.gl.deleteBuffer(this.positionBuffer);
      if (this.texCoordBuffer) this.gl.deleteBuffer(this.texCoordBuffer);
      if (this.program) this.gl.deleteProgram(this.program);
    }

    this.isInitialized = false;
    this.videoElement = null;
  }

  /**
   * 检查是否已初始化
   */
  isReady(): boolean {
    return this.isInitialized;
  }
}

