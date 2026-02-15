# ---- Build Stage ----
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files and install dependencies
COPY package.json package-lock.json* ./
RUN npm install --frozen-lockfile || npm install

# Copy prisma schema and generate client
COPY prisma ./prisma
RUN npx prisma generate

# Copy source code and build
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---- Runtime Stage ----
FROM node:20-alpine AS runtime

WORKDIR /app

# Install only production dependencies
COPY package.json package-lock.json* ./
RUN npm install --production --frozen-lockfile || npm install --production

# Copy prisma schema and generate client for runtime
COPY prisma ./prisma
RUN npx prisma generate

# Copy compiled output from builder
COPY --from=builder /app/dist ./dist

# Expose the server port
EXPOSE 3001

# Run database migrations then start the server
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
