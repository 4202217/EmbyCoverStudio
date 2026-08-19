# Emby 封面工坊

一个专门为 Emby 媒体库/合集自动生成封面的工具。它从媒体库与合集内的影片中挑选海报，合成新封面（海报 + 库名标题 + 数量副标题），并通过 Emby API 自动写回。支持单图海报与海报墙两种样式、Webhook 入库自动更新、cron 定时同步与手动批量更新，Docker 一键部署，内置中文字体。

> 代码仓库：<https://github.com/4202217/EmbyCoverStudio>
> Docker 镜像：<https://hub.docker.com/r/kevindo2/emby-cover-studio>

## 功能特性

- 🔌 通过 API 密钥连接 Emby，自动发现所有媒体库与合集（含总合集 BoxSets）
- 🖼️ **单图海报**：按「最新入库 / 最新发行 / 随机 / 手动选择」挑选一部影片海报 + 库名标题 + 数量副标题
- ✨ **大标题**：整幅海报模糊背景 + 居中大标题
- 🧱 **海报墙**：媒体库可选竖向瀑布流海报墙，2:3 原比例、倾斜铺满右侧，海报不足时自动回退（0 张用大标题、1 张用单图）
- 🎛️ 每个媒体库/合集可单独配置（封面管理单选配置，保存后生效；手动选择保存后自动锁定）
- 🎨 三套全局封面配置（媒体库·单图海报 / 媒体库·海报墙 / 合集·单图海报），可调背景模式、颜色、字号等，带实时预览
- 🔒 **锁定机制**：锁定的目标不再更新也不参与监控，可随时取消锁定
- ⚡ Webhook 精准更新：影片入库/更新时仅重新生成受影响的媒体库与合集；定位失败自动全量兜底
- ⏰ cron 定时同步（默认每 6 小时），指纹对比只对发生变化的封面重新生成
- 📊 任务记录：序号、名称、类型、时间、触发方式、结果（含失败原因），支持按列排序筛选
- 🏠 概览：生成张数、监控数量、最近同步、定时任务、需要关注、最近生成（悬停显示来源影片）
- 🔔 自动更新面板：上次触发、上次结果、下次定时、最近错误，支持等待接收 Emby 真实测试通知
- 🆕 内置新版本检测：发现新版本时侧边栏提示，并直接展示新版 changelog
- 🔒 可选访问令牌，保护管理界面
- 📦 镜像已发布到 Docker Hub（amd64 / arm64），GitHub 推送 main 后自动构建推送

## 快速开始（Docker）

推荐直接使用已发布到 Docker Hub 的镜像：

```bash
mkdir -p emby-cover-studio/data
cd emby-cover-studio
# 保存下面的 docker-compose.yml 后执行
docker compose up -d
```

`docker-compose.yml`：

```yaml
services:
  emby-cover-studio:
    image: kevindo2/emby-cover-studio:latest
    container_name: emby-cover-studio
    ports:
      - "9308:3000"
    volumes:
      - ./data:/app/data
    environment:
      - TZ=Asia/Shanghai
      - PORT=3000
    restart: unless-stopped
```

启动后打开 `http://服务器IP:9308`（端口可自行修改）。数据保存在挂载目录的 `data/` 下（设置、目标配置、任务记录与生成的封面）。

### 更新镜像

界面左下角版本号会自动检测 GitHub 上是否有新版本；发现新版本时点击版本号可查看新版 changelog。

在 NAS 部署目录下执行（需先将 `scripts/update-embystudio.sh` 放到 compose 同目录）：

```bash
sh update-embystudio.sh
```

或手动：

```bash
docker compose pull
docker compose up -d
```

### 从源码构建（可选）

```bash
docker compose up -d --build
```

镜像为 Next.js standalone 多阶段构建，健康检查使用 `/api/healthz`，数据目录固定为 `/app/data`。

## 首次使用

1. 在 Emby 创建 API 密钥：**控制台 → 高级 → API 密钥 → 新建 API 密钥**（需要管理员权限）。
2. 打开封面工坊界面 →「设置」→「Emby 连接」，填写服务器地址（如 `http://192.168.1.100:8096`，无需带 `/emby`）和 API 密钥，点击「测试连接」。
3. 进入「封面管理」，对需要生成封面的媒体库/合集点「更新」，或使用「同步媒体库封面」批量处理。
4. 生成成功后，封面自动上传为 Emby 中对应媒体库/合集的封面图。

## 封面管理

「封面管理」列出 Emby 的全部媒体库与合集，支持搜索、类型/状态/配置/封面四维筛选、多选批量操作（锁定、取消锁定、恢复默认配置、更新封面）与同步媒体库封面。

### 单选配置

点击某个媒体库/合集进入单选状态，可配置：

- **封面样式**：媒体库可选「单图海报」或「海报墙」，合集固定单图海报
- **选图依据**：最新入库 / 最新发行 / 随机 / 手动选择（仅单图样式支持手动选择）

修改配置后立即生成本地预览（不推送 Emby），点「保存」才更新并上传；手动选择保存后自动锁定。

### 默认与锁定

- 未单独配置的媒体库固定使用「单图海报」样式（选图依据跟随全局配置）
- 单独配置过的目标显示「手动配置」徽章，可随时「恢复默认配置」
- **锁定**：锁定的目标不更新、不参与监控；取消锁定后恢复

## 封面配置（全局默认）

「设置 → 封面配置」提供三套互相独立的全局配置：**媒体库·单图海报 / 媒体库·海报墙 / 合集·单图海报**，右侧带实时预览（可选占位图或真实媒体库/合集数据）。

- **选图依据**：最新入库 / 最新发行 / 随机（单图海报样式）
- **背景模式**：渐变色（自定义顶部/底部颜色）/ 海报渐变模糊（从展示海报取色模糊）
- **字号**：标题字号 / 副标题字号（按输出宽度等比缩放）
- **颜色**：强调色、标题颜色、副标题颜色
- **显示数量副标题**：如「共 18 部影片」/「共 5 合集」

尺寸为固定比例：媒体库 16:9，合集 2:3。保存后可选择「保存并重新生成当前配置封面」，只重新生成当前类型+样式的未锁定目标。

## 配置 Webhook（入库自动更新）

1. 在 Emby 安装官方 **Webhooks** 插件（控制台 → 插件 → 目录 → Webhooks）。
2. URL 填写封面工坊「设置 → 自动更新」中显示的 Webhook 地址（带 token）。
3. 事件建议勾选：**项目已添加（Item Added）**、**项目已更新（Item Updated）**、**媒体库新建（Library New）**（删除类事件无需勾选，不会触发更新）。
4. 保存后，影片入库/更新时自动定位受影响的媒体库与合集，仅更新相关封面（默认防抖 20 秒，可调）；定位失败自动全量兜底。

「设置 → 自动更新」中的「等待接收测试通知」：点击后在 Emby Webhooks 插件里点该 webhook 的「测试通知」，页面会确认是否真正收到（60 秒超时），用于验证整条链路。

> 未安装 Webhooks 插件时，定时同步（默认每 6 小时）仍然兜底更新封面。

## 定时更新

cron 表达式默认 `0 */6 * * *`（每 6 小时），支持标准 5 段格式：

```
分 时 日 月 周
```

示例：`0 3 * * *` 每天凌晨 3 点；`*/30 * * * *` 每 30 分钟；`0 */12 * * *` 每 12 小时。

定时同步采用指纹对比：只有影片封面/顺序发生变化（或模板设置变更）时才重新生成，避免无意义重复上传。

## 常见问题

### 中文标题显示为方块/乱码

容器已内置 Noto Sans CJK 中文字体；本地运行请确认系统装有中文字体。概览页若显示字体缺失提示，按提示在「设置」中填写字体文件路径。

### 封面已生成但没写回 Emby

日志会显示「上传失败」及原因，多为 API 密钥权限不足或该 Emby 版本不支持直接上传。封面保留在挂载目录 `data/covers/`，可到 Emby 手动设置。

### 如何知道镜像有新版本

界面左下角版本号会自动检测（通过 jsDelivr CDN 读取 GitHub 最新版本），有新版时显示「有新版本」徽章，点击可查看新版 changelog。手动更新用 `sh update-embystudio.sh` 或 `docker compose pull && docker compose up -d`。

### 支持 Jellyfin 吗

API 与 Emby 基本兼容，理论上可用；如需稳定支持建议以 Emby 为准。

## 安全提示

默认不启用访问令牌，任何能访问服务端口的人都可以操作。建议在「设置 → 访问令牌」中开启，或部署在可信内网/反代之后。

## 备份

「设置 → 配置与数据备份」支持导出/导入 JSON 备份（设置、媒体库/合集配置、任务记录）。封面图片不包含在备份内，导入后重新生成即可。

## 开发与测试

```bash
npm install
npm run dev        # 开发模式（Next.js）
npm run mock       # 启动模拟 Emby 服务器（端口 8199）
npm test           # 端到端集成测试（模拟 Emby 全流程）
npm run build      # 生产构建（standalone）
```

生产运行（standalone）：

```bash
npm run build
cp -R .next/static .next/standalone/.next/static
PORT=3100 DATA_DIR=./data node .next/standalone/server.js
```

## 目录结构

```
app/                 # Next.js 前端页面（概览/封面管理/设置/运行记录）
components/          # 可复用 UI 组件（shadcn 风格 + 通用表格/弹窗/toast）
lib/                 # 工具与 API 封装（含访问令牌）
server/              # Next 与后端的桥接层（API 分发、后台任务、备份）
src/                 # 核心后端（原样复用）
  emby/client.js     # Emby API 客户端
  covers/            # 封面合成（sharp）、字体、样式预设
  services/sync.js   # 同步/生成/上传核心逻辑
  services/webhook.js# Webhook 防抖调度与精准定位
  store.js           # JSON 持久化（设置/目标状态/任务记录/日志）
  scheduler.js       # cron 解析与定时任务
scripts/
  mock-emby.js       # 模拟 Emby 服务器
  test-integration.js# 端到端测试
  update-embystudio.sh # NAS 一键更新镜像脚本
data/                # 运行数据（docker 挂载卷）
  db.json            # 设置、目标配置、任务记录与日志
  covers/            # 生成的封面
  cache/             # 影片封面缓存
```
