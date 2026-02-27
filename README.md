## 项目简介

> [UI参考](https://www.figma.com/design/iA61lfnhW5C4xfg16MU5f6/Video-editing-dashboard--Community-?node-id=86001-16196&t=Om8MAQyMln7CSPIE-0)

这是一个基于 **Vue 3 + TypeScript + Rspack/Vite** 实现的前端媒体编辑器，包含**图片编辑器**和**视频编辑器**两个核心模块。

- **图片编辑器**：支持 **Konva (CPU)** 和 **PixiJS (GPU)** 双引擎，可在首次进入时选择渲染引擎，支持加载本地图片，进行对比度 / 色温 / 饱和度 / 模糊 / 阴影 / 高光 / 效果增强等基础调节，并提供画笔遮罩绘制与导出功能。
- **视频编辑器**：支持 **FFmpeg.wasm** 和 **WebAV（WebCodecs）** 两种处理模式，支持视频倍速调整、对比度、饱和度、色温、阴影、高光等多种效果调节，效果可叠加使用，并提供 **WebGL 实时预览**和视频导出功能。

## 功能概览

### 图片编辑器

- **双渲染引擎架构**
  - **Konva (CPU)**：基于 Canvas 2D，兼容性好，适合所有浏览器
  - **PixiJS (GPU)**：基于 WebGL，GPU 加速渲染，性能更优
  - 首次进入时显示引擎选择界面，用户必须选择一种引擎才能进入编辑器
  - 进入编辑器后可在顶部切换引擎，切换时自动重置滤镜状态
  - 两种引擎实现统一的 `IImageEditor` 接口，业务层无需关心底层差异

- **图片加载与展示**
  - 从本地文件选择图片（`<input type="file" accept="image/*">`）
  - 图片自动等比例缩放适配画布，不放大只缩小
  - 支持在画布中拖拽移动、点击选中后使用控制点缩放
  - 点击空白处取消选中

- **基础调节（滤镜面板）**
  - **对比度**：范围 \[-100, 100]
    - Konva：自定义滤镜 `Contrast`（LUT 查找表优化）
    - PixiJS：GPU shader 实现
  - **色温**：范围 \[-100, 100]
    - Konva：自定义滤镜 `Temperature`（白平衡增益算法）
    - PixiJS：GPU shader 实现（Planckian locus 近似）
  - **饱和度**：范围 \[-100, 100]
    - Konva：基于 `Konva.Filters.HSL`
    - PixiJS：GPU shader 灰度混合
  - **模糊**：范围 \[0, 100]
    - Konva：映射到 `BlurRadius` \[0, 20]
    - PixiJS：使用内置 `BlurFilter`（高斯模糊）
  - **阴影**：范围 \[-100, 100]（调整图片暗部亮度）
    - Konva：自定义滤镜 `Shadow`
    - PixiJS：GPU shader 实现
  - **高光**：范围 \[-100, 100]（调整图片亮部亮度）
    - Konva：自定义滤镜 `Highlight`
    - PixiJS：GPU shader 实现
  - **滤镜增强**：范围 \[0, 100]
    - Konva：映射到 `Enhance` \[0, 2]
    - PixiJS：GPU shader 局部对比度增强
  - 所有参数都支持滑块拖拽实时预览
  - **双击 label 重置单项效果**：快速恢复单个参数到默认值

- **画笔遮罩功能**
  - **画笔模式开关**：进入/退出绘制模式
  - **画笔粗细调节**：范围 \[1, 50]
  - **清除画笔痕迹**：清空当前所有绘制线条
  - **导出画笔图层**：以原图尺寸导出一张「黑底白线」的遮罩 PNG，用于后续抠图/特效处理
  - **画笔模式下自动禁用滤镜调整**：避免画笔绘制与滤镜调整冲突
  - **画笔模式下自动隐藏变换控制器**

- **图片导出**
  - **导出编辑后图片**：一键导出包含所有滤镜效果和画笔图层的完整图片（原始尺寸）
  - 支持 PNG 格式，质量可配置

- **UX & 交互**
  - 首次进入显示引擎选择界面（与视频编辑器风格一致）
  - 现代化 UI 布局：左侧调整面板 + 中央画布 + 右侧画笔面板
  - 响应式布局：根据窗口大小调整画布宽高
  - 细节提示：未上传图片时展示操作提示说明
  - 按钮禁用状态视觉反馈：置灰样式清晰标识不可用状态

### 视频编辑器

- **视频加载与预览**
  - 从本地文件选择视频（支持 MP4、WebM、OGG 等格式）
  - 实时视频预览，支持播放控制
  - 时间轴组件，显示视频播放进度和缩略图

- **WebGL 实时效果预览**
  - **统一 WebGL 渲染**：使用 WebGL 着色器实时预览所有滤镜效果，确保预览与导出效果一致
  - **倍速实时预览**：拖动滑块时通过 `video.playbackRate` 即时预览倍速效果
  - **多滤镜实时预览**：对比度、饱和度、色温、阴影、高光等效果实时预览
  - **时间轴联动**：调整倍速时，时间轴长度自动同步变化（2x 倍速时时间轴缩短一半）
  - **无延迟体验**：预览效果即时生效，导出时才进行实际视频处理

- **视频处理功能**
  - **倍速调整**：范围 \[0.25x, 4x]，步长 0.25x
  - **对比度调整**：范围 \[0.5, 2.0]，步长 0.05
  - **饱和度调整**：范围 \[0, 3.0]，步长 0.05
  - **色温调整**：范围 \[-1.0, 1.0]，冷色调到暖色调
  - **阴影调整**：范围 \[0, 2.0]，控制暗部细节
  - **高光调整**：范围 \[0, 2.0]，控制亮部细节
  - **效果叠加**：所有效果可以同时应用，互不覆盖
  - **一键重置**：快速恢复所有效果到默认值

- **处理模式选择**
  - **FFmpeg 模式**：基于 WebAssembly 的 FFmpeg，功能完整，兼容性好
    - 首次加载显示进度条，支持加载失败重试
    - 使用 `@ffmpeg/ffmpeg` 和 `@ffmpeg/core-mt` 多线程版本，提升处理性能
    - 使用 `eq` 滤镜实现对比度、饱和度、阴影、高光、色温调整
    - **假进度效果**：FFmpeg 处理时显示平滑的进度动画，提升用户体验
  - **WebAV 模式**：基于 WebCodecs API，性能更优，无需预加载
    - 使用 `@webav/av-cliper` 库，基于浏览器原生 WebCodecs API
    - 支持硬件加速，处理速度更快
    - 使用 WebGL 着色器实现滤镜处理，与预览效果完全一致
    - 需要浏览器支持 WebCodecs API（Chrome 94+、Edge 94+）

- **导出功能**
  - 点击「导出视频」时才进行实际视频处理
  - 实时处理进度显示（0-100%），FFmpeg 模式支持假进度动画
  - 自动应用当前设置的所有滤镜效果
  - 处理完成后自动下载视频文件
  - 支持清除视频，重置所有设置

- **视频信息面板**
  - 显示视频文件名、尺寸、时长等基本信息
  - 实时显示当前调整的效果参数（倍速、对比度、饱和度、色温、阴影、高光）
  - 只显示非默认值的参数，界面简洁清晰

- **时间轴组件**
  - 视频缩略图预览（使用 `@webav/av-cliper` 的 `thumbnails` API）
  - 播放头拖拽定位，支持倍速模式下的正确时间映射
  - 时间刻度尺，支持缩放控制
  - 播放/暂停控制，当前时间和总时长显示

- **UX & 交互**
  - 首次进入显示处理模式选择界面
  - 左侧效果调整面板：倍速、对比度、饱和度、色温、阴影、高光控制
  - 右侧视频区域：WebGL 视频预览 + 视频信息 + 时间轴
  - 配置驱动的效果面板，易于扩展新效果
  - 处理中状态禁用相关操作，避免冲突
  - 响应式布局，适配不同屏幕尺寸
  - 现代化渐变背景，清晰的视觉层次

## 技术栈与关键依赖

- **前端框架**：Vue 3（`<script setup lang="ts">` 组合式 API）
- **语言**：TypeScript
- **构建工具**：Rspack / Vite
- **路由管理**：Vue Router 4
- **图片处理引擎**：
  - **Konva (CPU)**
    - `Konva.Stage` / `Konva.Layer` / `Konva.Image` / `Konva.Transformer`
    - `Konva.Line` 用于画笔轨迹
    - 自定义滤镜注册到 `Konva.Filters`
  - **PixiJS (GPU)**
    - `pixi.js` v8：WebGL 2 渲染引擎
    - 自定义 GLSL shader 实现滤镜
    - 自定义 `PixiTransformer` 实现变换控制器
- **视频处理**：
  - **FFmpeg.wasm**（可选）
    - `@ffmpeg/ffmpeg`：FFmpeg WebAssembly 封装
    - `@ffmpeg/core-mt`：多线程核心，提升处理性能
    - `@ffmpeg/util`：工具函数（fetchFile、toBlobURL 等）
  - **WebAV（WebCodecs）**（可选）
    - `@webav/av-cliper`：基于 WebCodecs 的视频、音频、图片合成库
    - 使用浏览器原生 `VideoEncoder`、`VideoDecoder` API
    - 支持硬件加速，性能更优
- **工具函数**：自定义 `throttle` / `debounce`（位于 `src/utils/utils.ts`）

## 前端架构设计

### 目录结构（核心部分）

```text
src/
  App.vue                        # 应用主入口，导航栏和路由视图
  main.ts                        # Vue 启动入口
  router/
    index.ts                     # Vue Router 路由配置
  page/
    PhotoEditor/
      index.vue                  # 图片编辑器页面组件
    VideoEditor/
      index.vue                  # 视频编辑器页面组件
  package/
    editor/                      # 图片编辑器通用 API 层
      index.ts                   # 导出统一接口
      types.ts                   # IImageEditor 接口和类型定义
      createImageEditor.ts       # 工厂函数，根据引擎创建实例
      KonvaImageEditorAdapter.ts # Konva 引擎适配器
      canvasLayout.ts            # 画布布局计算（引擎无关）
    Image/                       # Konva 图片处理实现
      ImageEditor.ts             # Konva 封装的图片编辑器核心类
      ImageFilterManager.ts      # Konva 滤镜管理模块
      KonvaFilter/               # Konva 自定义滤镜
        index.ts                 # 注册所有自定义滤镜
        contrast.ts              # 对比度滤镜（LUT 优化）
        temperature.ts           # 色温滤镜
        shadow.ts                # 阴影滤镜
        highlight.ts             # 高光滤镜
        tint.ts                  # 预留色调滤镜
    pixi/                        # PixiJS 图片处理实现
      index.ts                   # 导出 PixiJS 模块
      PixiImageEditor.ts         # PixiJS 图片编辑器实现
      PixiFilterManager.ts       # PixiJS GPU 滤镜管理器
      PixiBrushManager.ts        # PixiJS 画笔管理器
      PixiTransformer.ts         # PixiJS 变换控制器（缩放控制点）
      shaders.ts                 # GLSL 着色器源码
    Video/                       # 视频处理模块
      Video.ts                   # 视频编辑器抽象层
      types.ts                   # 视频滤镜类型定义
      shaders.ts                 # 视频 WebGL 着色器
      filters.ts                 # CPU 滤镜回退方案
      ffmpeg/
        index.ts                 # FFmpeg 实现（FFmpegWrapper）
      webav/
        index.ts                 # WebAV 实现（WebAVWrapper）
        WebGLFilterRenderer.ts   # WebGL 滤镜渲染器（导出用）
  components/
    TimeLine/
      TimeLine.vue               # 视频时间轴组件
    EffectsPanel/
      index.vue                  # 效果调节面板组件
    VideoPreview/
      index.vue                  # WebGL 视频预览组件
      WebGLRenderer.ts           # WebGL 滤镜渲染器（预览用）
    ErrorOverlay/
      index.vue                  # 加载失败错误页面组件
    Toast/
      index.vue                  # 轻提示组件
  utils/
    utils.ts                     # throttle、debounce 等工具
    toast.ts                     # Toast 工具函数
  assets/
    zoom-in.svg                  # 放大图标
    zoom-out.svg                 # 缩小图标
```

整体采用「**模块化分层架构**」：

- **`App.vue`**：应用主入口，提供导航栏和路由视图容器
- **`PhotoEditor/index.vue`**：图片编辑器页面，负责 UI、状态管理和引擎选择
- **`VideoEditor/index.vue`**：视频编辑器页面，负责 UI、状态管理和处理模式选择
- **`package/editor`**：图片编辑器通用 API 层，定义 `IImageEditor` 接口和工厂函数
- **`package/Image`**：Konva 引擎实现
- **`package/pixi`**：PixiJS 引擎实现
- **`VideoEditor` 类**：视频编辑器抽象层，支持 FFmpeg 和 WebAV 两种底层实现

### 图片编辑器双引擎架构

#### 统一接口设计（`IImageEditor`）

```typescript
interface IImageEditor {
  // 图片加载与管理
  loadImage(url: string): Promise<void>;
  clearImage(): void;
  updateSize(width: number, height: number): void;

  // 图片状态
  getImageState(): ImageState | null;
  setImageState(state: ImageState): void;
  onImageStateChange?: () => void;

  // 滤镜效果
  setContrast(value: number): void;
  setTemperature(value: number): void;
  setSaturation(value: number): void;
  setEnhance(value: number): void;
  setBlur(value: number): void;
  setShadow(value: number): void;
  setHighlight(value: number): void;
  resetFilters(): void;

  // 画笔功能
  enableBrush(color?: string, size?: number): void;
  disableBrush(): void;
  setBrushSize(size: number): void;
  clearBrush(): void;

  // 导出功能
  exportImage(mimeType?: string, quality?: number): string | null;
  exportEditedImage(mimeType?: string, quality?: number): Promise<string>;
  exportBrushLayer(): Promise<string>;

  // 资源清理
  destroy(): void;
}
```

#### 工厂函数（`createImageEditor`）

```typescript
async function createImageEditor(
  container: HTMLElement,
  options: CreateImageEditorOptions,
): Promise<IImageEditor> {
  const { engine = 'konva', ...config } = options;

  if (engine === 'pixi') {
    const { PixiImageEditor } = await import('../pixi/PixiImageEditor');
    return new PixiImageEditor(container, config);
  }

  const { KonvaImageEditorAdapter } = await import('./KonvaImageEditorAdapter');
  return new KonvaImageEditorAdapter(container, config);
}
```

#### Konva 引擎实现

- **`KonvaImageEditorAdapter`**：适配器类，包装 `ImageEditor` 实现 `IImageEditor` 接口
- **`ImageEditor`**：Konva 核心类，管理 Stage/Layer/Transformer/画笔
- **`ImageFilterManager`**：滤镜管理器，使用 `requestAnimationFrame` 优化应用时机

#### PixiJS 引擎实现

- **`PixiImageEditor`**：实现 `IImageEditor` 接口的 PixiJS 编辑器
- **`PixiFilterManager`**：GPU 滤镜管理器，使用 WebGL shader 实时处理
- **`PixiBrushManager`**：画笔管理器，使用 `Graphics` 绑定绘制
- **`PixiTransformer`**：变换控制器，实现类似 Konva.Transformer 的缩放控制点

### PixiJS 滤镜实现（GPU Shader）

所有非模糊滤镜合并为单个 GPU pass，在 `shaders.ts` 中定义：

```glsl
// 对比度调整（与 Konva LUT 算法匹配）
vec3 applyContrast(vec3 color, float value) {
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

// 色温调整（白平衡增益，Planckian locus 近似）
vec3 applyTemperature(vec3 color, float value) {
  float targetKelvin = 5500.0 - safeTanh(value / 100.0 * 1.2) * 2500.0;
  vec3 white = temperatureToRGB(targetKelvin);
  vec3 gains = pow(vec3(1.0) / white, vec3(0.6));
  return clamp(color * gains, 0.0, 1.0);
}

// 饱和度、增强、阴影、高光类似实现...
```

### 组件与类的职责划分

#### 图片编辑器模块

- **`PhotoEditor/index.vue`**
  - 管理引擎选择状态（`currentEngine`）
  - 持有响应式状态：`contrast`、`temperature`、`saturation` 等
  - 调用 `createImageEditor` 工厂函数创建编辑器实例
  - 滑块变更时，通过 `throttledUpdateFilter` 调用编辑器方法
  - 切换引擎时完全销毁旧实例，重置滤镜状态

- **`PixiImageEditor`**
  - 初始化 `Application` / `Container` / `Sprite`
  - 管理 `PixiTransformer`（变换控制器）
  - 持有 `PixiFilterManager` 和 `PixiBrushManager`
  - 实现所有 `IImageEditor` 接口方法

- **`PixiTransformer`**
  - 在选中的图片周围绘制 8 个控制点和边框
  - 支持拖拽控制点缩放图片（保持宽高比可配置）
  - 鼠标样式根据控制点位置自动切换
  - 点击空白处取消选中

#### 视频编辑器模块

- **`VideoEditor/index.vue`**
  - 管理处理模式选择（FFmpeg 或 WebAV）
  - 持有响应式状态：`speed`、`contrast`、`saturation` 等
  - 使用 `VideoPreview` 组件进行 WebGL 实时预览
  - 导出时调用 `VideoEditor.applyFilters` 进行实际处理

- **`VideoEditor` 类**（抽象层）
  - 封装 `FFmpegWrapper` 或 `WebAVWrapper`
  - 提供统一的 `applyFilters` 接口
  - 管理加载状态和进度

- **`EffectsPanel` 组件**
  - 配置驱动架构，通过 `EffectConfig` 数组定义效果
  - 动态渲染滑块控件，支持快速添加新效果

### 渲染与性能优化

#### Konva 引擎优化

- **缓存策略**：图片加载后调用 `cache()` 开启缓存，后续滤镜在缓存上计算
- **滤镜应用优化**：使用 `layer.batchDraw()` 合并重绘
- **LUT 查找表**：对比度滤镜预计算 256 个映射值，避免重复计算

#### PixiJS 引擎优化

- **单 Pass 渲染**：所有非模糊滤镜合并为单个 GPU shader
- **Uniform 更新**：只在参数变化时更新 shader uniform
- **按需渲染**：使用 `requestAnimationFrame` 调度，避免不必要的渲染

#### 交互优化

- **节流更新**：滑块更新通过 `throttle` 包装，默认间隔 50ms
- **引擎切换**：销毁旧实例前先清理所有资源，避免 WebGL 上下文竞态

## 本地开发与构建

> **注意**：
> - FFmpeg.wasm 由于默认开启多线程加载，Rspack 中不支持通过 URL 初始化 worker，所以使用 vite 启动才能正常跑
> - WebAV 模式需要浏览器支持 WebCodecs API（Chrome 94+、Edge 94+）
> - PixiJS 引擎需要浏览器支持 WebGL 2

### 安装依赖

```bash
pnpm install
```

### 启动开发服务器

```bash
# rspack
pnpm run dev

# vite
pnpm run dev:vite
```

默认访问地址：`http://localhost:8080`

### 生产构建

```bash
# rspack
pnpm run build

# vite
pnpm run build:vite
```

### 本地预览生产构建

```bash
pnpm run preview
```

## 视频编辑器核心实现说明

### `VideoEditor` 类关键逻辑（抽象层）

- **模式切换机制**
  - 支持动态切换处理模式（FFmpeg 或 WebAV）
  - 切换模式时自动销毁旧实例并创建新实例
  - 提供统一的接口，隐藏底层实现差异

- **初始化流程**
  - 根据选择的模式创建对应的 `VideoWrapper` 实例
  - 调用 `init()` 方法加载底层引擎
  - 支持进度回调和错误处理

### `FFmpegWrapper` 类关键逻辑

- **FFmpeg 初始化**
  - 使用 `@ffmpeg/core-mt` 多线程版本
  - 从 CDN 加载核心文件
  - 设置进度监听器

- **效果叠加实现**
  - 使用 FFmpeg `eq` 滤镜整合所有颜色调整
  - 滤镜链格式：`eq=contrast=...:saturation=...,setpts=...,format=yuv420p`

### `WebAVWrapper` 类关键逻辑

- **WebAV 初始化**
  - 检查浏览器 WebCodecs API 支持
  - 使用 `@webav/av-cliper` 库

- **滤镜实现**
  - 使用 WebGL 硬件加速（`WebGLFilterRenderer`）
  - 与预览使用相同的着色器，确保效果一致

### 统一着色器架构（`shaders.ts`）

- **共享内容**
  - `FilterParams` 接口和默认值
  - `VERTEX_SHADER` 和 `FRAGMENT_SHADER` 代码
  - 预览和导出模块共享同一份代码

## 后续可扩展方向

### 图片编辑器
- **更多高级滤镜**：曲线调节、锐化、噪点、渐变映射等
- **图层系统**：支持多图层叠加、图层混合模式
- **撤销/重做**：基于操作记录或快照的历史管理
- **更多引擎**：WebGPU 支持

### 视频编辑器
- **更多视频效果**：模糊、锐化、色相调整等
- **视频裁剪**：时间范围选择、画面裁剪
- **视频合并**：多段视频拼接
- **音频处理**：音量调节、音频提取、背景音乐添加
- **LUT 滤镜**：支持导入 3D LUT 文件

### 通用功能
- **服务端集成**：将编辑结果上传后端处理
- **批量处理**：支持批量处理多张图片或多个视频
- **云存储集成**：支持从云存储加载和保存文件

当前版本完全前端运行，无服务端依赖，适合作为浏览器端媒体编辑功能的基础模块或 DEMO。

## 更新日志

### v1.4.0 (最新)
- **图片编辑器双引擎架构**：支持 Konva (CPU) 和 PixiJS (GPU) 两种渲染引擎
- **统一 IImageEditor 接口**：业务层无需关心底层实现，可无缝切换引擎
- **PixiJS GPU 加速**：使用 WebGL shader 实现滤镜，性能更优
- **PixiTransformer**：为 PixiJS 实现类似 Konva.Transformer 的缩放控制点
- **引擎选择界面**：首次进入显示引擎选择界面，与视频编辑器风格一致
- **新增阴影/高光滤镜**：图片编辑器支持阴影和高光调节

### v1.3.0
- **CPU 滤镜工具函数**：将 CPU 滤镜处理逻辑抽离到 `filters.ts`
- **ErrorOverlay 组件**：将加载失败页面拆分为独立组件
- **代码优化**：减少重复代码，提升可维护性

### v1.2.0
- **统一着色器架构**：将 WebGL 着色器代码抽离到 `shaders.ts`
- **代码重构**：`WebGLFilterRenderer` 拆分为独立文件

### v1.1.0
- **新增视频效果**：饱和度、色温、阴影、高光调节
- **WebGL 实时预览**：使用 WebGL 着色器替代 CSS 滤镜
- **配置驱动效果面板**：支持通过配置快速添加新效果

### v1.0.0
- 图片编辑器：对比度、色温、饱和度、模糊、增强调节
- 视频编辑器：倍速、对比度调节
- 双处理模式：FFmpeg.wasm 和 WebAV (WebCodecs)
- 时间轴组件：缩略图、倍速联动、播放头拖拽
