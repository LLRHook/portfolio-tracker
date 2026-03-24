FROM node:22

WORKDIR /app

COPY package.json ./
RUN npm install

COPY . .

RUN mkdir -p /app/data

CMD ["node", "--watch", "server.js"]
