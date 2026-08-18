---
name: Emby 封面工坊
description: 暗色影院风格的自托管 Emby 封面生成控制台
colors:
  primary: "hsl(194 100% 43%)"
  primary-foreground: "hsl(0 0% 100%)"
  gold: "hsl(42 96% 56%)"
  background: "hsl(222 30% 9%)"
  surface: "hsl(219 33% 13%)"
  surface-raised: "hsl(219 26% 22%)"
  foreground: "hsl(216 40% 94%)"
  muted-foreground: "hsl(215 25% 65%)"
  border: "hsl(218 28% 24%)"
  destructive: "hsl(6 78% 57%)"
  success: "#34d399"
  warning: "#fbbf24"
typography:
  display:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Noto Sans SC', sans-serif"
    fontSize: "clamp(1.875rem, 4vw, 2.25rem)"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "-0.02em"
  title:
    fontFamily: "inherit"
    fontSize: "0.875rem"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "-0.01em"
  body:
    fontFamily: "inherit"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "inherit"
    fontSize: "0.75rem"
    fontWeight: 500
  mono:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, 'JetBrains Mono', 'Fira Code', monospace"
    fontSize: "0.75rem"
    fontWeight: 500
rounded:
  sm: "6px"
  md: "8px"
  lg: "10px"
  xl: "12px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "12px 16px"
    height: "36px"
  button-outline:
    backgroundColor: "transparent"
    textColor: "{colors.foreground}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "12px 16px"
    height: "36px"
  button-destructive:
    backgroundColor: "{colors.destructive}"
    textColor: "{colors.primary-foreground}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "12px 16px"
    height: "36px"
  input:
    backgroundColor: "transparent"
    textColor: "{colors.foreground}"
    rounded: "{rounded.md}"
    height: "36px"
    padding: "4px 12px"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.lg}"
    padding: "24px"
  badge:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.full}"
    padding: "2px 8px"
  switch:
    backgroundColor: "{colors.surface-raised}"
    rounded: "{rounded.full}"
    height: "20px"
    width: "36px"
---

# Design System: Emby 封面工坊

## Overview

**Creative North Star: "The Cinema Wall"**

Emby 封面工坊是一个暗色、影院感的操作控制台：深夜放映厅式的深蓝黑底、屏幕荧光般的主操作色、放映机暖金点缀，以及一整面由真实海报构成的作品墙。界面首先让“正在发生什么”一目了然（连接状态、同步进度、异常计数、最近生成），然后才展开操作（筛选、配置、批量更新）。密度是适中的控制台密度：指标用等宽数字说话，表格保持紧凑，封面永远让位于真实海报而非占位装饰。

动效遵循放映机而非舞台剧的节奏：克制的缓入、hover 时轻抬起的深度、封面微缩放，全部尊重 `prefers-reduced-motion`。视觉上拒绝“廉价标签”（Attention、Poster Wall 这类英文小标）、拒绝装饰性彩色光斑、拒绝为“技术感”而堆叠的等宽字——等宽只用于数据、时间戳与测量。

**Key Characteristics:**
- 深夜放映厅底色 + 单一青色交互能量 + 金色品牌时刻
- 封面墙以真实海报为视觉主角，光晕取自每张海报的主色
- 等宽数字承载指标与时间，中文字体承载内容
- 表面静止时扁平，状态变化（hover / 选中 / 弹窗）时才升起阴影
- 动效克制、指数缓出、尊重减少动态偏好

## Colors

深夜中的两种“光”——交互青与放映机金——构成全部情感表达，其余颜色只为状态与层级服务。

### Primary
- **屏幕青**（`hsl(194 100% 43%)`）：交互能量色。用于主按钮、激活导航、进度条、焦点环、链接与选中态；在 10% 透明度下作为激活底色（如 `bg-primary/10`）。它在深色底上读作屏幕辉光，是整页唯一可被点击的颜色。

### Secondary
- **放映机金**（`hsl(42 96% 56%)`）：品牌时刻色。只出现在仪表盘 hero 的品牌线与金色发丝线（hairline）上；稀有是它的意义。不用于按钮、链接或数据。

### Tertiary
- **语义状态色**：成功 `#34d399`、警示 `#fbbf24`、危险 `hsl(6 78% 57%)`，以及触发方式徽章的紫/青/粉等色。只携带状态语义，永远以 10%–15% 透明底 + 300–400 级文字出现，不做整块实心填充。

### Neutral
- **放映厅夜色**（`hsl(222 30% 9%)`）：全局背景，带轻微青色径向氛围。
- **卡片表面**（`hsl(219 33% 13%)`）：卡片、弹窗、侧边栏表面。
- **抬升表面**（`hsl(219 26% 22%)`）：hover 行、筛选菜单、徽章底色。
- **正文前景**（`hsl(216 40% 94%)`）：标题与正文。
- **弱化前景**（`hsl(215 25% 65%)`）：次级说明、时间戳；不用于需要强对比的操作文案。
- **描边**（`hsl(218 28% 24%)`）：卡片、输入框、分割线的统一 1px 描边。

### Named Rules
**The One Accent Rule.** 青色是唯一交互强调色，金色只属于品牌时刻，语义色只承载状态。任何页面不得为装饰引入第二个强调色相。

**The Tinted State Rule.** 状态色一律以淡色调（10%–15% 透明背景 + 亮色文字）呈现，绝不使用全饱和实心色块表达状态。

## Typography

**Display Font:** 系统中文字体栈（PingFang SC / Hiragino Sans GB / Microsoft YaHei / Noto Sans SC）
**Body Font:** 同一系统栈
**Label/Mono Font:** `ui-monospace, SFMono-Regular, Menlo, Consolas, 'JetBrains Mono', 'Fira Code', monospace`

**Character:** 中文界面以系统字体保证清晰，标题靠重量与字距（而非衬线或装饰字）建立权威；等宽字只在数据、时间戳、指标与品牌语中出现，形成“屏幕读数”与“人的语言”的分工。

### Hierarchy
- **Display**（700，`clamp(1.875rem, 4vw, 2.25rem)`，1.1，`-0.02em`）：页面级标题（概览、封面管理、设置、运行记录），全页最大字号，`text-balance` 避免悬词。
- **Title**（600，`0.875rem`，1，`-0.01em`）：卡片标题，小但重，靠留白与描边分层。
- **Body**（400，`0.875rem`，1.5）：正文与说明；次级说明用弱化前景色，描述性文字不超过约 52–65 字符行宽。
- **Label**（500，`0.75rem`）：表单标签、按钮文字；大写 + `0.18em` 字距仅用于极小（9–10px）的品牌/标签语境。
- **Mono**（500，`0.75rem`）：指标值、时间戳、进度、cron 表达式、版本号；全局 `tabular-nums` 保证数字对齐。

### Named Rules
**The Headline Carries Weight Rule.** 页面标题是页面上最大、最重的文字，任何章节不得与之竞争；章节标题不加英文小标（Attention、Poster Wall 等），标题自己承担语义。

**The Mono Discipline Rule.** 等宽字只用于数据、时间、测量与品牌语；正文、按钮、说明文案一律使用中文正文栈。

## Layout

桌面端为固定 224px 侧边栏 + 内容区：内容容器 `max-width: 1200px` 居中，页面内边距 `p-4 / sm:p-6 / lg:p-8`，章节之间垂直节奏 24px（`space-y-6`）。侧边栏在 `lg` 断点以下折叠为顶部粘性栏 + 横向胶囊导航。

指标区使用 2 / 3 / 5 列网格（移动端 2 列、平板 3 列、桌面 5 列）。封面墙是横向滚动条隐藏的 24px–36px 卡片行；表格容器最高 420px，表头粘性置顶。密度为“控制台级”：指标卡紧凑（标签 10px、值 20px），列表行 `py-2.5–3`，不用大留白牺牲扫描效率。

## Elevation & Depth

混合体系：静止表面是平的（只有 1px 描边），深度只出现在状态变化与真实内容上。封面光晕不是装饰，而是从海报主色实时提取的“光”。

### Shadow Vocabulary
- **Soft**（`0 1px 2px 0 rgb(0 0 0 / 0.25), 0 10px 28px -12px rgb(0 0 0 / 0.45)`）：卡片静止阴影。
- **Pop**（`0 16px 40px -12px rgb(0 0 0 / 0.55)`）：hover、选中、弹窗抬升。
- **按钮辉光**（`inset 0 1px 0 0 rgb(255 255 255 / 0.12), 0 4px 16px -6px hsl(var(--primary) / 0.65)`）：主按钮的受光面。
- **封面光晕**：从封面主色提取，33% 透明度描边 + 10–44px 径向阴影；主色亮度低于 0.32 时回退为青色。

### Named Rules
**The Flat-at-Rest Rule.** 静止时只有描边没有阴影；阴影是 hover、选中、弹窗等状态变化的信号，不得常驻。

**The Light-Source Rule.** 封面光晕必须取自该海报的支配色，禁止给封面任意叠加彩色辉光。

## Shapes

圆角是单一克制家族：按钮与输入框 8px（`rounded-md`），卡片 10–12px（`rounded-lg` / `rounded-xl`），胶囊仅用于徽章、状态点与移动端导航胶囊。所有容器统一 1px `hsl(var(--border))` 描边；交互时描边转向 `primary/50`，同时出现焦点环（2px `ring-primary/70`）。没有混合的角落语言：不存在圆角按钮配直角卡片或反之。

**The Shape Consistency Rule.** 容器与控件只在 6–12px 圆角家族内取值；全圆角只属于徽章、状态点与小开关。

## Components

### Buttons
- **Shape:** 8px（`rounded-md`），默认高 36px（`h-9`），小号 32px，大号 40px；文字单行不换行。
- **Primary:** 青色渐变（`from-primary to-primary/90`）+ 白字 + 顶部受光 + 青色辉光；hover 提亮，`:active` 缩至 0.97 模拟按压。
- **Hover / Focus:** 150ms `ease-out` 过渡；焦点环 2px `ring-primary/70`；禁用 50% 透明度且不可点。
- **Secondary / Ghost:** 描边按钮透明底 + 1px 描边，hover 上抬升表面；Ghost 仅 hover 背景，用于表格行内轻量操作。

### Chips
- **Style:** 全圆角胶囊，10–12px 半粗；默认徽章用抬升表面，语义徽章用 10%–15% 淡色底 + 亮色文字（成功/警示/危险）。
- **State:** 触发器徽章（手动/批量/定时/Webhook 等）用不同色相但同一淡色公式表达来源，不表达优先级。

### Cards / Containers
- **Corner Style:** 10px（`rounded-lg`），hero 与弹窗 12px（`rounded-xl`）。
- **Background:** 卡片表面 `hsl(219 33% 13%)`。
- **Shadow Strategy:** 静止 `soft`，hover / 选中 `pop`。
- **Border:** 1px `hsl(218 28% 24%)`。
- **Internal Padding:** 头部 24px，内容 24px 且顶部为 0。

### Inputs / Fields
- **Style:** 透明底 + 1px 描边 + 8px 圆角，高 36px；placeholder 用弱化前景。
- **Focus:** 2px 青色焦点环 + 描边转 `primary/50`；光标色为青色。
- **Error / Disabled:** 禁用 50% 透明度；错误由相邻提示文案表达，不单靠描边变色。

### Navigation
- **Style:** 侧边栏 224px，半透明卡片底 + 背景模糊；导航项 8px 圆角，活跃态为 `primary/10` 底 + 青色文字 + 3px 左侧竖条。
- **Mobile treatment:** `lg` 以下切换为顶部粘性栏 + 横向滚动的胶囊导航，活跃胶囊 `primary/10` 底 + 青色文字。

### Poster Cards（标志性组件）
- **Corner Style:** 10px；比例 16:9（媒体库）或 9:16（合集）。
- **Behavior:** 静止时 1px 描边 + 主色光晕；hover 时缩放 1.04、描边转 `primary/45`、阴影升 `pop`，来源影片标签从底部滑入（仅桌面 hover 设备）。
- **Loading:** 未加载完成时使用与最终形状一致的骨架脉冲，而非转圈。

### Stat Tiles（标志性组件）
- **Style:** 8px 圆角卡片，10px 大写等宽标签 + 青色图标 + 20px 粗体等宽数值 + 11px 弱化说明。
- **Behavior:** 首次加载时以 40ms 步进的渐入序列出现；尊重 `prefers-reduced-motion`。

### Modal
- **Style:** 12px 圆角、卡片表面、`pop` 阴影；遮罩为 70% 黑。
- **Behavior:** 打开即焦点陷阱 + Esc 关闭 + body 滚动锁定 + `role="dialog"` / `aria-modal`；最大高度 85vh 内部滚动。

## Do's and Don'ts

### Do:
- **Do** 用青色表达一切可交互的东西：主按钮、激活项、链接、焦点环、进度。
- **Do** 让封面光晕取自每张海报的支配色，这是封面墙的灵魂。
- **Do** 用等宽字承载指标、时间戳、cron 与版本号，保持 `tabular-nums`。
- **Do** 让章节间距保持 24px，用留白而不是更多卡片来分组。
- **Do** 给所有动效提供 `prefers-reduced-motion` 降级。
- **Do** 保持按钮文字与背景的 WCAG AA 对比，禁用态至少 50% 透明度可辨识。

### Don't:
- **Don't** 为装饰引入第二个强调色相；金色只属于 hero 品牌线。
- **Don't** 在章节标题上加大写英文小标（Attention / Poster Wall / System 之类），标题自己说话。
- **Don't** 在图片上叠加装饰性文字标签；海报来源信息只在 hover 时滑入。
- **Don't** 使用渐变文字、彩色边框发光或纯黑硬阴影。
- **Don't** 给弹窗做没有焦点陷阱与 Esc 的实现。
- **Don't** 把弱化前景（`muted-foreground`）降低透明度到 AA 对比以下，尤其 10px 级小字。
