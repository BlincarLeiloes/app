# Para hospedar em qualquer lugar que rode Docker (Railway, Fly.io, VPS, PC de casa...).
# Os dados ficam em /data — monte um volume nessa pasta para não perder nada.
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production \
    SQLITE_PATH=/data/app.db \
    PORT=3000
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY server ./server
COPY public ./public
VOLUME /data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
CMD ["node", "--disable-warning=ExperimentalWarning", "server/index.js"]
