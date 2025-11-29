## 项目简介

这是一个基于 **Vue 3 + TypeScript + Rspack + Konva** 实现的前端图片编辑器。  
支持加载本地图片，进行对比度 / 色温 / 饱和度 / 模糊 / 效果增强等基础调节，并提供画笔遮罩绘制与导出功能。

应用针对高分辨率（如 4K）屏幕做了渲染与交互性能优化，在保证画质的前提下尽可能保持滑块拖拽流畅。

## 功能概览

- **图片加载与展示**
  - 从本地文件选择图片（`<input type="file" accept="image/*">`）
  - 图片自动等比例缩放适配画布，不放大只缩小
  - 支持在画布中拖拽移动、使用 Transformer 控制点缩放

- **基础调节（滤镜面板）**
  - **对比度**：范围 \[-100, 100]，使用自定义 Konva 滤镜 `Contrast`
  - **色温**：范围 \[-100, 100]，使用自定义 Konva 滤镜 `Temperature`
  - **饱和度**：范围 \[-100, 100]，基于 `Konva.Filters.HSL`
  - **模糊**：范围 \[0, 100]，映射到 `BlurRadius` \[0, 20]
  - **滤镜增强**：范围 \[0, 100]，映射到 `Enhance` \[0, 2]
  - 所有参数都支持滑块拖拽实时预览

- **画笔遮罩功能**
  - **画笔模式开关**：进入/退出绘制模式
  - **画笔粗细调节**：范围 \[1, 50]
  - **清除画笔痕迹**：清空当前所有绘制线条
  - **导出画笔图层**：以原图尺寸导出一张「黑底白线」的遮罩 PNG，用于后续抠图/特效处理

- **状态持久化**
  - 自动将当前图片地址（Base64）、滤镜参数、图片位置与缩放信息写入 `localStorage`
  - 页面刷新后自动恢复上次编辑现场
  - 提供「清除缓存」按钮，一键恢复初始状态

- **UX & 交互**
  - 现代化 UI 布局：左侧调整面板 + 中央画布 + 右侧画笔面板
  - 响应式布局：根据窗口大小调整画布宽高
  - 细节提示：未上传图片时展示操作提示说明

## 技术栈与关键依赖

- **前端框架**：Vue 3（`<script setup lang="ts">` 组合式 API）
- **语言**：TypeScript
- **构建工具**：Rspack
- **UI 渲染与图片处理**：Konva
  - `Konva.Stage` / `Konva.Layer` / `Konva.Image` / `Konva.Transformer`
  - `Konva.Line` 用于画笔轨迹
  - 自定义滤镜注册到 `Konva.Filters`
- **工具函数**：自定义 `throttle` / `debounce`（位于 `src/utils/utils.ts`）
- **本地存储**：`localStorage`（图片 Base64 + 调节参数 + 位置/缩放）

## 前端架构设计

### 目录结构（核心部分）

```text
src/
  App.vue                # 页面主入口，负责布局、状态管理、与 ImageEditor 交互
  main.ts                # Vue 启动入口
  utils/
    ImageEditor.ts       # Konva 封装的图片编辑器核心类
    KonvaFilter/
      index.ts           # 注册所有自定义滤镜
      contrast.ts        # 自定义对比度滤镜
      temperature.ts     # 自定义色温滤镜
      tint.ts            # 预留/示例色调滤镜
    utils.ts             # throttle、debounce 等工具
```

整体是一个「**容器组件 + 编辑器类库**」的结构：

- **`App.vue`**：只关心 UI、状态和与用户的交互
- **`ImageEditor` 类**：负责所有与 Konva 相关的逻辑（画布、图层、滤镜、画笔、导出等）

### 组件与类的职责划分

- **`App.vue`**
  - 持有响应式状态：`contrast`、`temperature`、`saturation`、`enhance`、`blur` 等
  - 负责文件上传、调用 `imageEditor.loadImage`
  - 滑块变更时，通过 `throttledUpdateFilter` 调用 `ImageEditor` 的对应方法
  - 负责状态的持久化加载/保存（`loadStateFromStorage` / `saveStateToStorage`）
  - 控制画笔模式开关、画笔粗细、清空及导出遮罩

- **`ImageEditor`**
  - 初始化 `Stage` / `Layer` / `Transformer` / 画笔 `Layer`
  - 管理当前图片节点 `Konva.Image`，处理拖拽、缩放、选中/取消选中
  - 对外暴露：
    - `loadImage(url: string)`
    - `setContrast / setTemperature / setSaturation / setEnhance / setBlur`
    - `resetFilters`, `clearImage`, `exportImage`
    - 画笔相关 `enableBrush / disableBrush / setBrushSize / clearBrush / exportBrushLayer`
    - 状态相关 `getImageState / setImageState / onImageStateChange`

### 数据流与状态持久化

- **数据流方向**
  - UI 滑块 → 更新 Vue 状态（`ref`）→ 节流后的回调 → `ImageEditor` 调用 → Konva 应用滤镜
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

### 渲染与性能优化

- **缓存与滤镜应用**
  - 图片加载后调用 `konvaImage.cache()` 开启缓存，后续滤镜都在缓存上计算
  - 每次修改滤镜参数后：
    - 更新 `Konva.Image` 上的自定义属性（`contrast`、`temperature` 等）
    - 调整 Konva 自带滤镜参数（`saturation`、`blurRadius`、`enhance` 等）
    - 调用 `clearCache()` + `cache()` 重新生成滤镜结果
  - `requestAnimationFrame` 包裹实际滤镜应用，避免频繁重绘卡 UI 线程

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
```

- **加载图片并适配画布**
  - 通过 `HTMLImageElement` 加载
  - 计算缩放比例：`scale = min(stageWidth / imgWidth, stageHeight / imgHeight, 1)`
  - 居中显示：根据缩放后的宽高计算 `x / y`

- **滤镜应用管线**
  - 构造 `filters` 数组：根据当前参数是否为 0 决定是否加入自定义/内置滤镜
  - 自定义滤镜参数通过挂在 `Konva.Image` 的 getter/setter 访问
  - 内置滤镜（`HSL`, `Blur`, `Enhance`）直接调用对应 API

- **画笔导出为原图尺寸遮罩**
  - 利用记录的 `imageScale` / `imageOffsetX` / `imageOffsetY`，将 Stage 坐标反算回原图坐标
  - 在离屏 `canvas` 上逐条重绘 `Konva.Line`，输出一张与原图尺寸一致的黑底白线图片

### 自定义滤镜

- **`Contrast`（对比度增强）**
  - 基于标准对比度公式：`(value - 128) * factor + 128`
  - 引入非线性映射，使高对比度时效果更明显，同时对负对比度做柔和处理
  - 通过 `Konva.Factory.addGetterSetter(Konva.Image, 'contrast', ...)` 注册属性

- **`Temperature`（色温）**
  - 将用户输入 \[-100, 100] 映射到色温区间 \[3000K, 8000K]
  - 基于色温转 RGB 的近似公式计算“目标白点”
  - 计算白平衡增益，让该白点校正为 (1,1,1)
  - 分别对 R/G/B 通道乘以不同增益，再做适当幂次压缩，获得更自然的色温变化

## 本地开发与构建

### 安装依赖

```bash
pnpm install
```

### 启动开发服务器

```bash
pnpm run dev
```

默认访问地址：`http://localhost:8080`

### 生产构建

```bash
pnpm run build
```

### 本地预览生产构建

```bash
pnpm run preview
```
