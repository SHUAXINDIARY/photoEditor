## 项目简介

> [UI参考](https://www.figma.com/design/iA61lfnhW5C4xfg16MU5f6/Video-editing-dashboard--Community-?node-id=86001-16196&t=Om8MAQyMln7CSPIE-0)

这是一个基于 **Vue 3 + TypeScript + Rspack/Vite** 实现的前端媒体编辑器，包含**图片编辑器**和**视频编辑器**两个核心模块。

- **图片编辑器**：使用 **Konva** 实现，支持加载本地图片，进行对比度 / 色温 / 饱和度 / 模糊 / 效果增强等基础调节，并提供画笔遮罩绘制与导出功能。
- **视频编辑器**：支持 **FFmpeg.wasm** 和 **WebAV（WebCodecs）** 两种处理模式，支持视频倍速调整、对比度、饱和度、色温、阴影、高光等多种效果调节，效果可叠加使用，并提供 **WebGL 实时预览**和视频导出功能。

## 功能概览

### 图片编辑器

- **图片加载与展示**
  - 从本地文件选择图片（`<input type="file" accept="image/*">`）
  - 图片自动等比例缩放适配画布，不放大只缩小
  - 支持在画布中拖拽移动、使用 Transformer 控制点缩放

- **基础调节（滤镜面板）**
  - **对比度**：范围 \[-100, 100]，使用自定义 Konva 滤镜 `Contrast`（LUT 查找表优化）
  - **色温**：范围 \[-100, 100]，使用自定义 Konva 滤镜 `Temperature`
  - **饱和度**：范围 \[-100, 100]，基于 `Konva.Filters.HSL`
  - **模糊**：范围 \[0, 100]，映射到 `BlurRadius` \[0, 20]
  - **滤镜增强**：范围 \[0, 100]，映射到 `Enhance` \[0, 2]
  - 所有参数都支持滑块拖拽实时预览
  - **双击 label 重置单项效果**：快速恢复单个参数到默认值

- **画笔遮罩功能**
  - **画笔模式开关**：进入/退出绘制模式
  - **画笔粗细调节**：范围 \[1, 50]
  - **清除画笔痕迹**：清空当前所有绘制线条
  - **导出画笔图层**：以原图尺寸导出一张「黑底白线」的遮罩 PNG，用于后续抠图/特效处理
  - **画笔模式下自动禁用滤镜调整**：避免画笔绘制与滤镜调整冲突

- **图片导出**
  - **导出编辑后图片**：一键导出包含所有滤镜效果和画笔图层的完整图片（原始尺寸）
  - 支持 PNG 格式，质量可配置

- **状态持久化**
  - 自动将当前图片地址（Base64）、滤镜参数、图片位置与缩放信息写入 `localStorage`
  - 页面刷新后自动恢复上次编辑现场
  - 提供「清除缓存」按钮，一键恢复初始状态
  - **智能配额管理**：检测到 localStorage 配额超出时自动禁用写入，避免频繁报错

- **UX & 交互**
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
  - 左侧效果调整面板：倍速、对比度、饱和度、色温、阴影、高光控制
  - 右侧视频区域：WebGL 视频预览 + 视频信息 + 时间轴
  - 配置驱动的效果面板，易于扩展新效果
  - 处理中状态禁用相关操作，避免冲突
  - 响应式布局，适配不同屏幕尺寸
  - 现代化渐变背景，清晰的视觉层次

## 技术栈与关键依赖

- **前端框架**：Vue 3（`<script setup lang="ts">` 组合式 API）
- **语言**：TypeScript
- **构建工具**：Rspack
- **路由管理**：Vue Router 4
- **UI 渲染与图片处理**：Konva
  - `Konva.Stage` / `Konva.Layer` / `Konva.Image` / `Konva.Transformer`
  - `Konva.Line` 用于画笔轨迹
  - 自定义滤镜注册到 `Konva.Filters`
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
- **本地存储**：`localStorage`（图片 Base64 + 调节参数 + 位置/缩放）

## 前端架构设计

### 目录结构（核心部分）

```text
src/
  App.vue                    # 应用主入口，导航栏和路由视图
  main.ts                    # Vue 启动入口
  router/
    index.ts                 # Vue Router 路由配置
  page/
    PhotoEditor/
      index.vue              # 图片编辑器页面组件
    VideoEditor/
      index.vue              # 视频编辑器页面组件
  package/
    Video/
      Video.ts               # 视频编辑器核心类（抽象层，支持 FFmpeg 和 WebAV）
      types.ts               # 视频滤镜类型定义和默认值
      shaders.ts             # 统一的 WebGL 着色器代码（预览和导出共用）
      ffmpeg/
        index.ts             # FFmpeg 实现（FFmpegWrapper）
      webav/
        index.ts             # WebAV 实现（WebAVWrapper）
        WebGLFilterRenderer.ts  # WebGL 滤镜渲染器（导出用）
  components/
    TimeLine/
      TimeLine.vue           # 视频时间轴组件（支持缩略图、倍速联动）
    EffectsPanel/
      index.vue              # 效果调节面板组件（配置驱动）
    VideoPreview/
      index.vue              # WebGL 视频预览组件
      WebGLRenderer.ts       # WebGL 滤镜渲染器
  assets/
    zoom-in.svg              # 放大图标
    zoom-out.svg             # 缩小图标
  utils/
    ImageEditor.ts           # Konva 封装的图片编辑器核心类（基础画布能力）
    ImageFilterManager.ts    # 图片滤镜管理模块（与画布能力解耦）
    KonvaFilter/
      index.ts               # 注册所有自定义滤镜
      contrast.ts            # 自定义对比度滤镜（LUT 查找表优化）
      temperature.ts         # 自定义色温滤镜
      tint.ts                # 预留/示例色调滤镜
    utils.ts                 # throttle、debounce 等工具
```

整体采用「**模块化分层架构**」：

- **`App.vue`**：应用主入口，提供导航栏和路由视图容器
- **`PhotoEditor/index.vue`**：图片编辑器页面，负责 UI、状态管理和与 ImageEditor 交互
- **`VideoEditor/index.vue`**：视频编辑器页面，负责 UI、状态管理和与 VideoEditor 交互
- **`ImageEditor` 类**：负责基础画布能力（Stage/Layer 管理、图片加载、画笔绘制、导出等）
- **`ImageFilterManager` 类**：独立管理所有滤镜效果（对比度、色温、饱和度、模糊、增强），与画布能力解耦
- **`VideoEditor` 类**：视频编辑器抽象层，支持 FFmpeg 和 WebAV 两种底层实现，提供统一的视频处理接口（倍速、对比度、饱和度、色温、阴影、高光等）
- **`EffectsPanel` 组件**：配置驱动的效果调节面板，支持动态添加新效果
- **`VideoPreview` 组件**：基于 WebGL 的视频预览组件，确保预览与导出效果一致

### 组件与类的职责划分

#### 图片编辑器模块

- **`PhotoEditor/index.vue`**
  - 持有响应式状态：`contrast`、`temperature`、`saturation`、`enhance`、`blur` 等
  - 负责文件上传、调用 `imageEditor.loadImage`
  - 滑块变更时，通过 `throttledUpdateFilter` 调用 `ImageEditor` 的对应方法
  - 负责状态的持久化加载/保存（`loadStateFromStorage` / `saveStateToStorage`）
  - 控制画笔模式开关、画笔粗细、清空及导出遮罩
  - 实现双击 label 重置单项效果
  - 画笔模式下禁用滤镜调整 UI 和逻辑

- **`ImageEditor`**
  - 初始化 `Stage` / `Layer` / `Transformer` / 画笔 `Layer`
  - 管理当前图片节点 `Konva.Image`，处理拖拽、缩放、选中/取消选中
  - 持有 `ImageFilterManager` 实例，将滤镜相关调用代理到滤镜管理器
  - 对外暴露：
    - `loadImage(url: string)`
    - `setContrast / setTemperature / setSaturation / setEnhance / setBlur`（代理到 `filterManager`）
    - `resetFilters`, `clearImage`, `exportImage`
    - `exportEditedImage`：导出包含滤镜和画笔的完整图片
    - 画笔相关 `enableBrush / disableBrush / setBrushSize / clearBrush / exportBrushLayer`
    - 状态相关 `getImageState / setImageState / onImageStateChange`

- **`ImageFilterManager`**
  - 独立管理所有滤镜参数状态
  - 使用 `requestAnimationFrame` 优化滤镜应用时机
  - 使用 `batchDraw()` 合并多次重绘，提升拖拽流畅度
  - 只在图片加载时建立缓存，后续不再重复 `clearCache()/cache()`，避免高像素图片卡顿

#### 视频编辑器模块

- **`VideoEditor/index.vue`**
  - 持有响应式状态：`speed`、`contrast`、`saturation`、`temperature`、`shadows`、`highlights`、`processingMode` 等
  - 管理处理模式选择（FFmpeg 或 WebAV）
  - 管理底层处理引擎的加载状态和进度显示
  - 负责视频文件上传和预览
  - **WebGL 实时预览机制**：
    - 使用 `VideoPreview` 组件进行 WebGL 渲染
    - 所有滤镜效果通过 WebGL 着色器实时应用
    - 倍速：通过 `video.playbackRate` 实时修改
  - 导出时调用 `VideoEditor.applyFilters` 进行实际视频处理
  - 处理进度显示和错误处理
  - 提供视频导出和重置功能
  - 视频信息面板实时显示当前效果参数

- **`VideoEditor` 类**（抽象层）
  - 支持动态切换处理模式（FFmpeg 或 WebAV）
  - 封装底层处理引擎（`FFmpegWrapper` 或 `WebAVWrapper`），提供统一接口
  - 管理加载状态和进度
  - 提供视频处理能力：
    - `applyFilters(inputFile, options, onProgress)`：同时应用多个效果（倍速、对比度、饱和度、色温、阴影、高光）
  - 支持进度回调，实时更新处理进度
  - 自动管理资源，处理完成后清理

- **`EffectsPanel` 组件**（`components/EffectsPanel/index.vue`）
  - **配置驱动架构**：通过 `EffectConfig` 数组定义所有效果
  - 每个效果配置包含：`key`、`icon`、`label`、`min`、`max`、`step`、`defaultValue`、`formatValue`
  - 动态渲染滑块控件，支持快速添加新效果
  - 提供重置和导出按钮

- **`VideoPreview` 组件**（`components/VideoPreview/index.vue`）
  - 使用 `WebGLFilterRenderer` 进行实时滤镜渲染
  - 隐藏原生 `<video>` 元素，在 `<canvas>` 上显示处理后的画面
  - 监听视频播放状态，使用 `requestAnimationFrame` 持续渲染
  - 滤镜参数变化时自动更新渲染

- **`FFmpegWrapper` 类**（`package/Video/ffmpeg/index.ts`）
  - 封装 FFmpeg.wasm 实例，管理加载状态
  - 实现 `VideoWrapper` 接口，提供 FFmpeg 底层处理能力
  - 使用 FFmpeg `eq` 滤镜实现对比度、饱和度、阴影、高光、色温调整
  - 色温通过 `gamma_r` 和 `gamma_b` 参数实现
  - **假进度效果**：FFmpeg 处理时模拟平滑进度动画
  - 支持进度回调和错误处理

- **`WebAVWrapper` 类**（`package/Video/webav/index.ts`）
  - 基于 WebCodecs API 和 `@webav/av-cliper` 库
  - 实现 `VideoWrapper` 接口，提供 WebAV 底层处理能力
  - 使用 `MP4Clip`、`Combinator`、`OffscreenSprite` 实现视频处理
  - 通过手动 seek 和帧替换实现真正的倍速效果
  - **WebGL 滤镜处理**：使用与预览相同的 WebGL 着色器，确保导出效果一致
  - 支持进度回调和错误处理

- **`WebGLVideoRenderer` 类**（`components/VideoPreview/WebGLRenderer.ts`）
  - 用于实时视频预览的 WebGL 渲染器
  - 从 `shaders.ts` 导入统一的着色器代码
  - 支持 `HTMLVideoElement` 输入，实时渲染到 Canvas

- **`WebGLFilterRenderer` 类**（`package/Video/webav/WebGLFilterRenderer.ts`）
  - 用于视频导出的 WebGL 渲染器
  - 从 `shaders.ts` 导入统一的着色器代码
  - 支持 `VideoFrame` 输入，返回处理后的像素数据
  - 与预览使用相同的着色器，确保效果一致

- **统一着色器**（`package/Video/shaders.ts`）
  - 定义 `FilterParams` 接口和 `DEFAULT_FILTER_PARAMS` 常量
  - 包含 `VERTEX_SHADER` 和 `FRAGMENT_SHADER` 代码
  - 预览组件和导出模块共享同一份着色器代码
  - 修改一处即可同步更新预览和导出效果

- **`TimeLine` 组件**（`components/TimeLine/TimeLine.vue`）
  - 接收 `videoUrl`、`videoElement`、`videoFile`、`speed` 等 props
  - **缩略图加载**：使用 `MP4Clip.thumbnails()` 从视频文件提取缩略图
  - **时间轴倍速联动**：
    - `originalDuration`：存储视频原始时长
    - `duration`：计算属性，`= originalDuration / speed`
    - `displayCurrentTime`：时间轴显示时间，`= videoCurrentTime / speed`
  - **播放头拖拽**：正确处理倍速模式下的时间映射
    - 时间轴时间 → 视频实际时间：`videoTime = displayTime * speed`
  - 播放控制、时间刻度尺、缩放控制

### 数据流与状态持久化

- **数据流方向**
  - UI 滑块 → 更新 Vue 状态（`ref`）→ 节流后的回调 → `ImageEditor` → `ImageFilterManager` → Konva 应用滤镜
  - 图片拖拽 / 缩放结束 → `ImageEditor.onImageStateChange` 回调 → `App.vue` 调用 `saveStateToStorage`

- **持久化结构（localStorage 中的 JSON）**

```json
{
  "imageUrl": "data:image/png;base64,...",
  "contrast": 0,
  "temperature": 0,
  "saturation": 0,
  "enhance": 0,
  "blur": 0,
  "imageState": {
    "x": 100,
    "y": 50,
    "scaleX": 0.8,
    "scaleY": 0.8
  },
  "timestamp": 1710000000000
}
```

- **配额管理**
  - 检测序列化后数据大小，超过 2MB 时自动禁用写入
  - 捕获 `QuotaExceededError` 后设置 `storageDisabled` 标记，避免频繁报错

### 渲染与性能优化

- **缓存策略优化**
  - 图片加载后调用 `konvaImage.cache()` 开启缓存，后续滤镜都在缓存上计算
  - **关键优化**：只在图片加载时建立缓存，后续滤镜调整不再重复 `clearCache()/cache()`
  - 避免高分辨率图片频繁重建缓存导致的严重卡顿

- **滤镜应用优化**
  - 每次修改滤镜参数后：
    - 更新 `Konva.Image` 上的自定义属性（`contrast`、`temperature` 等）
    - 调整 Konva 自带滤镜参数（`saturation`、`blurRadius`、`enhance` 等）
    - 使用 `layer.batchDraw()` 合并重绘，而非立即 `draw()`
  - `requestAnimationFrame` 包裹实际滤镜应用，避免频繁重绘卡 UI 线程

- **自定义滤镜性能优化**
  - **对比度滤镜使用 LUT（查找表）**：
    - 预计算 256 个像素值的映射结果（0~255 → 新值）
    - 遍历像素时直接查表，避免每个像素重复计算 `Math.pow`、`Math.min`、`Math.max`
    - 对比度为 0 时直接跳过处理
    - 缓存最近一次 LUT，避免相同参数重复生成

- **交互节流**
  - 所有滑块的更新通过 `throttledUpdateFilter` 包装，默认间隔 `50ms`
  - 状态保存使用 `debouncedSaveState`（500ms），避免每一次微小拖动都写入 `localStorage`

## 核心实现说明

### `ImageEditor` 关键逻辑（简要）

- **初始化画布**

```ts
this.stage = new Konva.Stage({ container, width, height });
this.layer = new Konva.Layer();
this.brushLayer = new Konva.Layer();
this.transformer = new Konva.Transformer({ rotateEnabled: rotateEnabled ?? false });
this.filterManager = new ImageFilterManager();
```

- **加载图片并适配画布**
  - 通过 `HTMLImageElement` 加载
  - 计算缩放比例：`scale = min(stageWidth / imgWidth, stageHeight / imgHeight, 1)`
  - 居中显示：根据缩放后的宽高计算 `x / y`
  - 建立缓存：`konvaImage.cache()`
  - 通知滤镜管理器：`this.filterManager.setImageContext(this.imageNode, this.layer)`

- **导出编辑后图片**
  - 创建临时 Stage，尺寸为原始图片尺寸
  - 复制当前图片节点并应用所有滤镜效果
  - 将应用滤镜后的图片绘制到临时 canvas
  - 如果有画笔图层，将画笔绘制叠加到图片上
  - 导出为 PNG 格式（可配置质量）

- **画笔导出为原图尺寸遮罩**
  - 利用记录的 `imageScale` / `imageOffsetX` / `imageOffsetY`，将 Stage 坐标反算回原图坐标
  - 在离屏 `canvas` 上逐条重绘 `Konva.Line`，输出一张与原图尺寸一致的黑底白线图片

### `ImageFilterManager` 关键逻辑

- **滤镜应用管线**
  - 构造 `filters` 数组：根据当前参数是否为 0 决定是否加入自定义/内置滤镜
  - 自定义滤镜参数通过挂在 `Konva.Image` 的 getter/setter 访问
  - 内置滤镜（`HSL`, `Blur`, `Enhance`）直接调用对应 API
  - 使用 `requestAnimationFrame` 调度，避免频繁更新
  - 使用 `batchDraw()` 而非 `draw()`，合并多次重绘

- **性能优化要点**
  - 不在每次参数变化时重建缓存（避免高像素图片卡顿）
  - 只在图片加载时建立一次缓存
  - 滤镜参数变化时只更新滤镜列表和参数值，Konva 会自动在现有缓存上重算

### 自定义滤镜

- **`Contrast`（对比度增强）**
  - 基于标准对比度公式：`(value - 128) * factor + 128`
  - 引入非线性映射，使高对比度时效果更明显，同时对负对比度做柔和处理
  - **性能优化**：使用 LUT（查找表）预计算 256 个像素值的映射结果
  - 通过 `Konva.Factory.addGetterSetter(Konva.Image, 'contrast', ...)` 注册属性

- **`Temperature`（色温）**
  - 将用户输入 \[-100, 100] 映射到色温区间 \[3000K, 8000K]
  - 基于色温转 RGB 的近似公式计算"目标白点"
  - 计算白平衡增益，让该白点校正为 (1,1,1)
  - 分别对 R/G/B 通道乘以不同增益，再做适当幂次压缩，获得更自然的色温变化

## 本地开发与构建

> **注意**：
> - FFmpeg.wasm 由于默认开启多线程加载，Rspack 中不支持通过 URL 初始化 worker，所以使用 vite 启动才能正常跑
> - WebAV 模式需要浏览器支持 WebCodecs API（Chrome 94+、Edge 94+），在支持的浏览器中无需预加载，性能更优

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
  - 调用 `init()` 方法加载底层引擎（FFmpeg 需要加载核心文件，WebAV 只需检查浏览器支持）
  - 支持进度回调和错误处理

- **视频处理流程**
  - 统一通过 `applyFilters` 方法处理视频
  - 自动将调用转发到底层 `VideoWrapper` 实现
  - 支持进度回调和错误处理

### `FFmpegWrapper` 类关键逻辑

- **FFmpeg 初始化**
  - 使用 `@ffmpeg/core-mt` 多线程版本，提升处理性能
  - 从 CDN 加载核心文件（core.js、core.wasm、core.worker.js）
  - 设置进度监听器，支持实时进度回调
  - 加载失败时提供重试机制

- **视频处理流程**
  - 将输入文件写入 FFmpeg 虚拟文件系统
  - 构建 FFmpeg 命令参数
  - 执行 FFmpeg 处理（支持进度回调）
  - 读取输出文件并转换为 Blob
  - 自动清理临时文件

- **效果叠加实现**
  - `applyFilters` 方法支持同时应用多个效果
  - 使用 FFmpeg `eq` 滤镜整合所有颜色调整：
    - `contrast`：对比度
    - `saturation`：饱和度
    - `gamma`：阴影（通过 gamma 曲线调整暗部）
    - `brightness`：高光（通过亮度调整亮部）
    - `gamma_r` / `gamma_b`：色温（通过红蓝通道 gamma 调整）
  - 倍速使用 `setpts` 滤镜
  - 滤镜链格式：`eq=contrast=...:saturation=...:gamma=...:brightness=...:gamma_r=...:gamma_b=...,setpts=倍速*PTS,format=yuv420p`

- **假进度效果**
  - FFmpeg.wasm 的 `progress` 事件可能不频繁触发
  - 实现平滑的假进度动画：
    - 0-30%：快速增长（每 200ms +2%）
    - 30-60%：中速增长（每 200ms +1%）
    - 60-85%：慢速增长（每 200ms +0.5%）
    - 85-100%：等待真实完成
  - 如果收到真实进度，使用真实进度和假进度中较大的值

### `WebAVWrapper` 类关键逻辑

- **WebAV 初始化**
  - 检查浏览器 WebCodecs API 支持（`VideoEncoder`、`VideoDecoder`）
  - 无需预加载，初始化速度快
  - 使用 `@webav/av-cliper` 库进行视频处理

- **倍速实现**
  - 通过 `MP4Clip.tick()` 手动 seek 到源视频的指定时间点
  - 对于输出的每一帧，计算对应的源视频时间：`sourceTime = outputTime * speed`
  - 提取所有需要的帧并保存为 `ImageData`
  - 使用 `tickInterceptor` 将原始帧替换为预处理好的帧
  - 通过 `Combinator` 编码输出视频

- **滤镜实现**
  - 使用 **WebGL 硬件加速**（`WebGLFilterRenderer` 类）
  - WebGL 不可用时回退到 CPU 处理
  - 在 `tickInterceptor` 中对每一帧应用所有滤镜
  - 滤镜处理顺序（与 WebGL 着色器一致）：
    1. 阴影（gamma 曲线）
    2. 高光（亮度调整）
    3. 对比度
    4. 饱和度
    5. 色温（红蓝通道调整）

- **性能优化**
  - 批量处理帧，定期让出控制权（`setTimeout(resolve, 0)`）
  - 使用 `OffscreenCanvas` 进行离屏渲染
  - 支持硬件加速（取决于浏览器和硬件）
  - 自动清理资源，避免内存泄漏

### 统一着色器架构（`shaders.ts`）

为确保预览效果与导出效果完全一致，着色器代码被抽离到独立文件 `src/package/Video/shaders.ts`：

- **共享内容**
  - `FilterParams` 接口：定义滤镜参数类型
  - `DEFAULT_FILTER_PARAMS`：默认滤镜参数值
  - `VERTEX_SHADER`：顶点着色器代码
  - `FRAGMENT_SHADER`：片段着色器代码

- **使用方式**
  - `VideoPreview/WebGLRenderer.ts`：预览组件导入并使用
  - `webav/WebGLFilterRenderer.ts`：导出模块导入并使用

- **滤镜算法（GLSL 实现）**

```glsl
// 1. 对比度调整
rgb = (rgb - 0.5) * u_contrast + 0.5;

// 2. 饱和度调整
float gray = dot(rgb, vec3(0.299, 0.587, 0.114));
rgb = mix(vec3(gray), rgb, u_saturation);

// 3. 阴影调整（gamma 曲线）
if (u_shadows != 1.0) {
  float gamma = 1.0 / pow(u_shadows, 0.6);
  rgb = pow(rgb, vec3(gamma));
}

// 4. 高光调整（亮度）
if (u_highlights != 1.0) {
  float brightness = (u_highlights - 1.0) * 0.3;
  rgb = rgb + brightness;
}

// 5. 色温调整
if (u_temperature > 0.0) {
  rgb.r += u_temperature * 0.15;
  rgb.g += u_temperature * 0.05;
  rgb.b -= u_temperature * 0.15;
} else {
  float cool = abs(u_temperature);
  rgb.r -= cool * 0.1;
  rgb.g -= cool * 0.02;
  rgb.b += cool * 0.15;
}
```

- **CPU 回退**
  - 当 WebGL 不可用时，使用相同算法的 JavaScript 实现
  - 直接操作 `ImageData` 像素数据
  - 确保与 WebGL 渲染结果一致

### 实时预览机制

视频编辑器采用「**预览与导出分离**」的架构，实现无延迟的实时预览体验：

- **WebGL 统一预览**
  - 使用 `VideoPreview` 组件进行 WebGL 渲染
  - 隐藏原生 `<video>` 元素，在 `<canvas>` 上显示处理后的画面
  - 所有滤镜效果通过 WebGL 着色器实时应用
  - 与 WebAV 导出使用相同的着色器代码，确保效果一致

- **倍速预览**
  - 利用 HTML5 Video 原生的 `playbackRate` 属性
  - 通过 Vue `watch` 监听 `speed` 变化，实时更新 `video.playbackRate`
  - 无需视频处理，即时生效

- **滤镜预览**
  - 对比度、饱和度、色温、阴影、高光等效果
  - 通过 WebGL 着色器实时渲染
  - 使用 `requestAnimationFrame` 持续更新画面
  - 视频暂停时也能实时响应滤镜参数变化

- **时间轴联动**
  - 时间轴接收 `speed` prop，根据倍速计算显示时长
  - `duration = originalDuration / speed`
  - 播放头位置基于 `displayCurrentTime = videoCurrentTime / speed`
  - 拖拽时正确转换：`videoTime = displayTime * speed`

- **导出处理**
  - 点击「导出视频」时才调用 `VideoEditor.applyFilters()`
  - FFmpeg 模式：使用 `eq` 滤镜，参数经过调优以接近 WebGL 效果
  - WebAV 模式：使用与预览相同的 WebGL 着色器，效果完全一致
  - 显示处理进度，完成后自动下载

## 后续可扩展方向

### 图片编辑器
- **更多高级滤镜**：曲线调节、锐化、噪点、渐变映射等
- **图层系统**：支持多图层叠加、图层混合模式
- **撤销/重做**：基于操作记录或快照的历史管理

### 视频编辑器
- **更多视频效果**：模糊、锐化、色相调整等
- **视频裁剪**：时间范围选择、画面裁剪
- **视频合并**：多段视频拼接
- **音频处理**：音量调节、音频提取、背景音乐添加
- **视频格式转换**：支持更多输入/输出格式
- **LUT 滤镜**：支持导入 3D LUT 文件实现电影级调色

### 通用功能
- **服务端集成**：
  - 将编辑结果、画笔遮罩上传到后端，做进一步 AI 抠图/特效处理
  - 提供用户项目保存与分享功能
- **批量处理**：支持批量处理多张图片或多个视频
- **云存储集成**：支持从云存储加载和保存文件

当前版本完全前端运行，无服务端依赖，适合作为浏览器端媒体编辑功能的基础模块或 DEMO。

## 更新日志

### v1.2.0 (最新)
- **统一着色器架构**：将 WebGL 着色器代码抽离到 `shaders.ts`，预览和导出共享同一份代码
- **代码重构**：`WebGLFilterRenderer` 拆分为独立文件，提升代码可维护性
- **修复 TimeLine 组件**：解决切换模式后重新上传视频时的初始化顺序问题

### v1.1.0
- **新增视频效果**：饱和度、色温、阴影、高光调节
- **WebGL 实时预览**：使用 WebGL 着色器替代 CSS 滤镜，确保预览与导出效果一致
- **配置驱动效果面板**：`EffectsPanel` 组件支持通过配置快速添加新效果
- **视频信息面板**：实时显示当前调整的效果参数
- **FFmpeg 假进度效果**：优化处理过程中的进度显示体验
- **FFmpeg 滤镜优化**：使用 `eq` 滤镜整合所有颜色调整，提升兼容性

### v1.0.0
- 图片编辑器：对比度、色温、饱和度、模糊、增强调节
- 视频编辑器：倍速、对比度调节
- 双处理模式：FFmpeg.wasm 和 WebAV (WebCodecs)
- 时间轴组件：缩略图、倍速联动、播放头拖拽
