FROM node:22-alpine
ARG URBANFLOW_COMMIT_SHA
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY server.js ./
COPY public ./public
ENV URBANFLOW_COMMIT_SHA=${URBANFLOW_COMMIT_SHA}
LABEL org.opencontainers.image.revision=${URBANFLOW_COMMIT_SHA}
EXPOSE 3000
USER node
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 CMD node -e "const {version}=require('./package.json');fetch('http://127.0.0.1:3000/health').then(r=>{if(!r.ok)process.exit(1);return r.json()}).then(h=>process.exit(h.status==='ok'&&h.version===version?0:1)).catch(()=>process.exit(1))"
CMD ["npm", "start"]
