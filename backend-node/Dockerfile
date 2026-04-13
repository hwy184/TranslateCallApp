FROM node:22-alpine AS base
WORKDIR /app

COPY package.json ./
RUN npm install

COPY tsconfig.json ./
COPY src ./src

EXPOSE 8080
CMD ["sh", "-c", "npm run migrate && npm run dev"]
