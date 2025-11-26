FROM node:20-alpine

# Install curl for debugging
RUN apk add --no-cache curl

WORKDIR /app

# Copy package files first for caching
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy the rest of the backend app
COPY . .

# Expose backend API and C2 ports
EXPOSE 3000 3001

# Run as non-root for security
RUN addgroup -g 1001 -S gla1v3 && adduser -u 1001 -S gla1v3 -G gla1v3
USER gla1v3

# Start the backend server
CMD ["node", "index.js"]