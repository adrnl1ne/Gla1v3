# frontend/Dockerfile — FIXED FOR VITE DEV SERVER (real-time dashboard)
FROM node:20-alpine AS base

WORKDIR /app

# Copy package files first for caching
COPY package*.json ./

# Install dependencies (react, vite – fixes empty node_modules)
RUN npm install

# Copy the rest of the app (now /app has all content: src/App.jsx, etc.)
COPY . .

# Expose Vite port for Gla1v3 dashboard (matches compose labels)
EXPOSE 5173

# Run as non-root for security (Gla1v3 best practice)
RUN addgroup -g 1001 -S gla1v3 && adduser -u 1001 -S gla1v3 -G gla1v3
USER gla1v3

# Dev mode for real-time updates (Vite hot-reload)
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]