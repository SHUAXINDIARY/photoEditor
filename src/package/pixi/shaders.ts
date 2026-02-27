/**
 * PixiJS 自定义滤镜 GLSL 着色器
 * @description 所有图片调整效果的 fragment shader 源码，
 * 合并为单个 shader 避免多 pass 开销
 */

/**
 * 统一调整滤镜的 fragment shader
 * @description 在单个 GPU pass 中完成：对比度、色温、饱和度、增强、阴影、高光调整
 * 模糊使用 PixiJS 内置 BlurFilter（高斯模糊需要多 pass）
 */
export const adjustmentFragmentShader = `
  in vec2 vTextureCoord;
  out vec4 finalColor;

  uniform sampler2D uTexture;
  uniform float uContrast;     // -100 ~ 100
  uniform float uTemperature;  // -100 ~ 100
  uniform float uSaturation;   // -100 ~ 100
  uniform float uEnhance;      // 0 ~ 100
  uniform float uShadow;       // -100 ~ 100
  uniform float uHighlight;    // -100 ~ 100

  // 感知亮度
  float luminance(vec3 color) {
    return dot(color, vec3(0.299, 0.587, 0.114));
  }

  // 兼容性 tanh 实现（避免部分设备/驱动对内建 tanh 支持不完整）
  float safeTanh(float x) {
    float e2x = exp(2.0 * x);
    return (e2x - 1.0) / (e2x + 1.0);
  }

  // 对比度调整（与 Konva LUT 算法匹配）
  vec3 applyContrast(vec3 color, float value) {
    if (abs(value) < 0.5) return color;
    float normalizedValue = value / 100.0;
    float factor;
    if (normalizedValue >= 0.0) {
      factor = 1.0 + pow(normalizedValue, 0.7) * 2.0;
    } else {
      float absVal = -normalizedValue;
      factor = 0.3 + (1.0 - 0.3) * (1.0 - pow(absVal, 0.5));
    }
    return clamp((color - 0.5) * factor + 0.5, 0.0, 1.0);
  }

  // 色温转 RGB（简化版 Planckian locus）
  vec3 temperatureToRGB(float kelvin) {
    kelvin = clamp(kelvin, 1000.0, 15000.0);
    float temp = kelvin / 100.0;
    float r, g, b;

    // Red
    if (temp <= 66.0) {
      r = 1.0;
    } else {
      r = 329.698727446 * pow(temp - 60.0, -0.1332047592) / 255.0;
    }

    // Green
    if (temp <= 66.0) {
      g = (99.4708025861 * log(temp) - 161.1195681661) / 255.0;
    } else {
      g = 288.1221695283 * pow(temp - 60.0, -0.0755148492) / 255.0;
    }

    // Blue
    if (temp >= 66.0) {
      b = 1.0;
    } else if (temp <= 19.0) {
      b = 0.0;
    } else {
      b = (138.5177312231 * log(temp - 10.0) - 305.0447927307) / 255.0;
    }

    return clamp(vec3(r, g, b), 0.0, 1.0);
  }

  // 色温调整（白平衡增益，与 Konva Temperature 算法匹配）
  vec3 applyTemperature(vec3 color, float value) {
    if (abs(value) < 0.5) return color;
    float tempValue = value / 100.0;
    float curveValue = safeTanh(tempValue * 1.2);
    float targetKelvin = 5500.0 - curveValue * 2500.0;

    vec3 white = temperatureToRGB(targetKelvin);
    vec3 gains = vec3(1.0 / white.r, 1.0 / white.g, 1.0 / white.b);
    // 以绿色通道为基准
    gains /= gains.g;
    // 限制到 60%
    gains = pow(gains, vec3(0.6));

    return clamp(color * gains, 0.0, 1.0);
  }

  // 饱和度调整
  vec3 applySaturation(vec3 color, float value) {
    if (abs(value) < 0.5) return color;
    float satFactor = value / 100.0; // -1 ~ 1
    float lum = luminance(color);
    return clamp(mix(vec3(lum), color, 1.0 + satFactor), 0.0, 1.0);
  }

  // 增强（局部对比度增强，与 Konva Enhance 类似）
  vec3 applyEnhance(vec3 color, float value) {
    if (value < 0.5) return color;
    float enhanceVal = value / 50.0; // 0 ~ 2
    float lum = luminance(color);
    // 增强偏离中灰的部分
    vec3 enhanced = color + (color - vec3(lum)) * enhanceVal * 0.5;
    return clamp(enhanced, 0.0, 1.0);
  }

  // 阴影调整（与 Konva Shadow 算法匹配）
  vec3 applyShadow(vec3 color, float value) {
    if (abs(value) < 0.5) return color;
    float factor = value / 100.0;
    float lum = luminance(color);
    float shadowWeight = max(0.0, 1.0 - lum / 0.502); // 128/255 ≈ 0.502
    float adjustment = factor * shadowWeight * (80.0 / 255.0);
    return clamp(color + adjustment, 0.0, 1.0);
  }

  // 高光调整（与 Konva Highlight 算法匹配）
  vec3 applyHighlight(vec3 color, float value) {
    if (abs(value) < 0.5) return color;
    float factor = value / 100.0;
    float lum = luminance(color);
    float highlightWeight = max(0.0, (lum - 0.502) / 0.498); // (128~255)/255
    float adjustment;
    if (factor > 0.0) {
      adjustment = factor * highlightWeight * (60.0 / 255.0);
    } else {
      adjustment = factor * highlightWeight * (80.0 / 255.0);
    }
    return clamp(color + adjustment, 0.0, 1.0);
  }

  void main() {
    vec4 texColor = texture(uTexture, vTextureCoord);
    vec3 color = texColor.rgb;

    color = applyContrast(color, uContrast);
    color = applyTemperature(color, uTemperature);
    color = applySaturation(color, uSaturation);
    color = applyEnhance(color, uEnhance);
    color = applyShadow(color, uShadow);
    color = applyHighlight(color, uHighlight);

    finalColor = vec4(color, texColor.a);
  }
`;

/**
 * 通用顶点着色器
 * @description PixiJS v8 滤镜默认使用的顶点着色器
 */
export const defaultVertexShader = `
  precision highp float;

  in vec2 aPosition;
  out vec2 vTextureCoord;

  uniform vec4 uInputSize;
  uniform vec4 uOutputFrame;
  uniform vec4 uOutputTexture;

  vec4 filterVertexPosition(void) {
    vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
    position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
    position.y = position.y * (2.0*uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
    return vec4(position, 0.0, 1.0);
  }

  vec2 filterTextureCoord(void) {
    return aPosition * (uOutputFrame.zw * uInputSize.zw);
  }

  void main(void) {
    gl_Position = filterVertexPosition();
    vTextureCoord = filterTextureCoord();
  }
`;
