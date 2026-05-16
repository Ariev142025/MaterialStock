# Build stage
FROM node:18-alpine as builder

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

# Production stage
FROM node:18-alpine

WORKDIR /app

RUN apk add --no-cache dumb-init

COPY package*.json ./

RUN npm install --only=production && npm cache clean --force

COPY --from=builder /app .

EXPOSE 3001

ENTRYPOINT ["/usr/bin/dumb-init", "--"]

CMD ["node", "src/index.js"]
