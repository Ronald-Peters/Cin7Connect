# Use Node.js 20 Alpine as base image
FROM node:20-alpine AS base

# Install dependencies only when needed
FROM base AS deps
WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm ci --only=production

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci

# Copy source code
COPY . .
# Ensure build script has correct permissions
RUN chmod +x build.sh 2>/dev/null || true

# Build application (Cloud Build compatible)
RUN npm run build:client
RUN mkdir -p dist/public && cp -r client/client/dist/* dist/public/ 2>/dev/null || cp -r client/dist/* dist/public/ 2>/dev/null || true
RUN npm run build:server
RUN if [ -d "attached_assets" ]; then cp -r attached_assets dist/ || true; fi
RUN if [ -f "dist/public/index.html" ]; then cp dist/public/index.html dist/public/404.html || true; fi

# Production image, copy all files and run the app
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy built application
COPY --from=builder /app/dist ./dist
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

USER nextjs

EXPOSE 8080

CMD ["npm", "start"]