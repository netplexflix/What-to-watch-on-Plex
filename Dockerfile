# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source files
COPY . .

# Build the frontend
RUN npm run build

# Build the backend
WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci
RUN npm run build

# Production stage
FROM node:20-alpine AS production

WORKDIR /app

# Install dumb-init for proper signal handling and su-exec for stepping down to non-root
RUN apk add --no-cache dumb-init su-exec

# Remove the default node user/group that ships with the node:alpine image (uses 1000:1000)
# Then create our own nodejs user/group with default PUID/PGID (will be adjusted at runtime)
RUN deluser --remove-home node 2>/dev/null || true && \
    delgroup node 2>/dev/null || true && \
    addgroup -g 1000 -S nodejs && \
    adduser -S -u 1000 -G nodejs -h /app -s /sbin/nologin nodejs

# Copy built frontend
COPY --from=builder /app/dist ./dist

# Copy backend
COPY --from=builder /app/server/dist ./server/dist
COPY --from=builder /app/server/package*.json ./server/

# Install production dependencies for backend
WORKDIR /app/server
RUN npm ci --only=production

WORKDIR /app

# Copy entrypoint script and fix line endings (handles Windows CRLF -> LF)
COPY entrypoint.sh /entrypoint.sh
RUN sed -i 's/\r$//' /entrypoint.sh && chmod +x /entrypoint.sh

# Create data directory with subdirectories
RUN mkdir -p /app/data/uploads && chown -R nodejs:nodejs /app/data

# Set environment variables
ENV DATA_PATH=/app/data
ENV PUID=1000
ENV PGID=1000

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

# Entrypoint runs as root to adjust UID/GID, then drops to nodejs user
ENTRYPOINT ["/entrypoint.sh"]
CMD ["node", "server/dist/index.js"]