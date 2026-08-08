FROM node:24-alpine

WORKDIR /app

ENV NODE_ENV=production
ENV TZ=Asia/Shanghai

# 中文字体 + 文字渲染依赖 + 时区数据
RUN apk add --no-cache tzdata fontconfig pango font-noto-cjk

COPY package.json ./
RUN npm install --omit=dev

COPY src ./src
COPY public ./public

RUN mkdir -p /app/data

VOLUME ["/app/data"]
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "src/server.js"]
