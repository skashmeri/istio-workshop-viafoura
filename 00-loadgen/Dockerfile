FROM node:carbon-alpine
RUN mkdir -p /usr/src/app
WORKDIR /usr/src/app
COPY package* ./
RUN npm install
COPY . .
CMD ["node", "server.js"]