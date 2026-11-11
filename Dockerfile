FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY main.js ./
RUN mkdir /cache && chown node:node /cache
USER node
VOLUME /cache
EXPOSE 3000
CMD ["node", "main.js", "--host", "0.0.0.0", "--port", "3000", "--cache", "/cache"]
