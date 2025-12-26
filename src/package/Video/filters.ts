/**
 * CPU 滤镜处理工具函数
 * 算法与 WebGL 着色器保持一致，用于 GPU 不可用时的回退处理
 */

export interface CPUFilterParams {
  contrast: number;
  saturation: number;
  temperature: number;
  shadows: number;
  highlights: number;
}

/**
 * 应用 CPU 滤镜到像素数据
 * 直接修改传入的 pixelData 数组
 * 
 * @param pixelData - RGBA 像素数据 (Uint8ClampedArray)
 * @param params - 滤镜参数
 */
export function applyCPUFilters(
  pixelData: Uint8ClampedArray,
  params: CPUFilterParams
): void {
  const { contrast, saturation, temperature, shadows, highlights } = params;
  const pixelCount = pixelData.length;

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
}

/**
 * 创建一个绑定特定参数的滤镜处理函数
 * 用于需要多次调用相同参数的场景，避免重复传参
 * 
 * @param params - 滤镜参数
 * @returns 一个只需传入 pixelData 的处理函数
 */
export function createCPUFilterProcessor(params: CPUFilterParams): (pixelData: Uint8ClampedArray) => void {
  const { contrast, saturation, temperature, shadows, highlights } = params;
  const gamma = shadows !== 1.0 ? 1.0 / Math.pow(shadows, 0.6) : 1.0;

  return (pixelData: Uint8ClampedArray) => {
    const pixelCount = pixelData.length;

    for (let i = 0; i < pixelCount; i += 4) {
      let r = pixelData[i] / 255;
      let g = pixelData[i + 1] / 255;
      let b = pixelData[i + 2] / 255;

      // 1. 对比度
      r = (r - 0.5) * contrast + 0.5;
      g = (g - 0.5) * contrast + 0.5;
      b = (b - 0.5) * contrast + 0.5;

      // 2. 饱和度
      if (saturation !== 1.0) {
        const gray = 0.299 * r + 0.587 * g + 0.114 * b;
        r = gray + (r - gray) * saturation;
        g = gray + (g - gray) * saturation;
        b = gray + (b - gray) * saturation;
      }

      // 3. 阴影
      if (shadows !== 1.0) {
        r = Math.pow(Math.max(0, r), gamma);
        g = Math.pow(Math.max(0, g), gamma);
        b = Math.pow(Math.max(0, b), gamma);
      }

      // 4. 高光
      if (highlights !== 1.0) {
        const brightness = (highlights - 1.0) * 0.3;
        r = r + brightness;
        g = g + brightness;
        b = b + brightness;
      }

      // 5. 色温
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
}

