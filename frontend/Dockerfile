FROM node:20-alpine
WORKDIR /app

RUN mkdir -p build
RUN echo "<h1>Placeholder frontend</h1>" > build/index.html

RUN npm install -g serve

EXPOSE 3000
CMD ["serve", "-s", "build", "-l", "3000"]
