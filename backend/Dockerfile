FROM node:20-alpine

# Create app directory
WORKDIR /app

# Copy package files if you have them (won’t break even if you don’t)
COPY package*.json ./

# Install dependencies (will do nothing if no package.json)
RUN npm install || true

# Copy everything else
COPY . .

# Default command (safe, does nothing harmful if no script exists)
CMD ["node", "index.js"]
