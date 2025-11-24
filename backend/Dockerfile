FROM node:20-alpine AS base

WORKDIR /app

COPY package*.json ./

# Install dependencies
RUN npm ci --omit=dev

RUN ls -l /app/node_modules


# Copy the rest of the app
COPY . .

EXPOSE 3000 3001

# Run as non-root user for security (Gla1v3 best practice)
RUN addgroup -g 1001 -S gla1v3 && adduser -u 1001 -S gla1v3 -G gla1v3
USER gla1v3

CMD ["node", "index.js"]
