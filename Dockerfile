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

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Copy built frontend
COPY --from=builder /app/dist ./dist

# Copy backend
COPY --from=builder /app/server/dist ./server/dist
COPY --from=builder /app/server/package*.json ./server/

# Install production dependencies for backend
WORKDIR /app/server
RUN npm ci --only=production

WORKDIR /app

# Create data directory with subdirectories
RUN mkdir -p /app/data/uploads && chown -R nodejs:nodejs /app/data

# Set environment variable for data path
ENV DATA_PATH=/app/data

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

# Start the server
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "server/dist/index.js"]