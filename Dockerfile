# 仅装载本地已构建好的 standalone 产物，不在容器内构建
FROM node:24-alpine

WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0

COPY standalone/ ./
COPY static/ ./.next/static/
COPY public/ ./public/

# 移除本地构建带入的 Windows 原生二进制与含凭证的 .env（运行时由 env_file 注入）
RUN rm -rf node_modules/@img node_modules/sharp .env

EXPOSE 3000
CMD ["node", "server.js"]
