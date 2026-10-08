ARG NODE_IMAGE=node:24-bookworm-slim
FROM ${NODE_IMAGE}
USER root
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3088
EXPOSE 3088
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3088)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.mjs"]
