FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install || true

COPY . .

EXPOSE 3000 3001

CMD ["node", "index.js"]