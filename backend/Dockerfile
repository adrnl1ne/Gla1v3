FROM node:20-alpine

# Install dependencies: curl for debugging, Go for agent compilation
RUN apk add --no-cache curl go

WORKDIR /app

# Copy package files first for caching
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy the rest of the backend app
COPY . .

# Expose backend API and C2 ports
EXPOSE 3000 3001


# Start the backend server
CMD ["node", "index.js"]