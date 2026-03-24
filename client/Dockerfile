FROM node:22-slim

WORKDIR /app

COPY package.json ./
RUN npm install

COPY . .

CMD ["sh", "-c", "npx vite --host 0.0.0.0 --port ${CLIENT_PORT:-34891}"]
