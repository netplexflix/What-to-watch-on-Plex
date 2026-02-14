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

# Install dumb-init for proper signal handling and su-exec for privilege dropping
RUN apk add --no-cache dumb-init su-exec

# Remove default 'node' user (UID 1000) to avoid ambiguity with PUID=1000
RUN deluser --remove-home node 2>/dev/null || true && \
    delgroup node 2>/dev/null || true

# Copy built frontend
COPY --from=builder /app/dist ./dist

# Copy backend
COPY --from=builder /app/server/dist ./server/dist
COPY --from=builder /app/server/package*.json ./server/

# Install production dependencies for backend
WORKDIR /app/server
RUN npm ci --only=production

WORKDIR /app

# Copy entrypoint script
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# Create data directory with subdirectories (entrypoint handles ownership)
RUN mkdir -p /app/data/uploads

# Set environment variables
ENV DATA_PATH=/app/data
ENV PUID=1000
ENV PGID=1000
ENV UMASK=002

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

# Start the server
ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["node", "server/dist/index.js"]