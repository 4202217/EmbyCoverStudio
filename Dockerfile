# 构建阶段：安装依赖并产出 Next.js standalone 产物
FROM node:24-alpine AS builder
WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# 运行阶段
FROM node:24-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV TZ=Asia/Shanghai
ENV NEXT_TELEMETRY_DISABLED=1
ENV DATA_DIR=/app/data

# 中文字体 + 文字渲染依赖 + 时区数据
RUN apk add --no-cache tzdata fontconfig pango font-noto-cjk

# standalone 产物（后端代码与运行依赖均已打包，含 package.json / node_modules / server.js）
COPY --from=builder /app/.next/standalone ./
# 前端静态资源（standalone 默认不含，需手动复制）
COPY --from=builder /app/.next/static ./.next/static
# public 静态资源（favicon 等）
COPY --from=builder /app/public ./public
# 更新记录（/api/changelog 读取）
COPY --from=builder /app/CHANGELOG.md ./

RUN mkdir -p /app/data

VOLUME ["/app/data"]
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
