/**
 * 统一的 WebGL 滤镜着色器
 * 此文件包含预览和导出共用的着色器代码
 * 确保预览效果与导出效果完全一致
 */

/**
 * 视频滤镜参数
 */
export interface FilterParams {
  contrast: number;
  saturation: number;
  temperature: number;
  shadows: number;
  highlights: number;
}

/**
 * 默认滤镜参数
 */
export const DEFAULT_FILTER_PARAMS: FilterParams = {
  contrast: 1.0,
  saturation: 1.0,
  temperature: 0,
  shadows: 1.0,
  highlights: 1.0,
};

/**
 * 顶点着色器
 * 简单的纹理坐标传递
 */
export const VERTEX_SHADER = `
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
 * 与 FFmpeg eq 滤镜效果保持一致
 * 
 * 滤镜处理顺序：
 * 1. 对比度 (contrast)
 * 2. 饱和度 (saturation)
 * 3. 阴影 (shadows) - 使用 gamma 曲线
 * 4. 高光 (highlights) - 使用 brightness
 * 5. 色温 (temperature) - 调整红蓝通道
 */
export const FRAGMENT_SHADER = `
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
    
    // 5. 色温调整 (与 FFmpeg gamma_r/gamma_b 一致)
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

