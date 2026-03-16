# ─────────────────────────────────────────────
# Stage 1: Build React client
# ─────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Install client dependencies
COPY client/package*.json ./client/
RUN cd client && npm ci

# Copy client source and build
COPY client/ ./client/
ARG VITE_BASE_PATH=/orders
ENV VITE_BASE_PATH=${VITE_BASE_PATH}
RUN cd client && npm run build

# ─────────────────────────────────────────────
# Stage 2: Run Express server
# ─────────────────────────────────────────────
FROM node:20-alpine

WORKDIR /app

# Build tools needed for better-sqlite3 native addon (fallback when prebuilt binary unavailable)
RUN apk add --no-cache python3 make g++

# Install production server dependencies only
COPY package*.json ./
RUN npm ci --omit=dev

# Remove build tools to keep image small
RUN apk del python3 make g++

# Copy server source
COPY server/ ./server/

# Copy compiled React app from builder stage
COPY --from=builder /app/client/dist ./client/dist

# Cloud Run listens on 8080 by default
ENV PORT=8080
EXPOSE 8080

CMD ["node", "server/index.js"]
