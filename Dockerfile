FROM node:22-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci --legacy-peer-deps

COPY tsconfig.json ./
COPY src ./src
COPY public ./public

RUN npm run build

FROM node:22-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev --legacy-peer-deps

COPY --from=build /app/dist ./dist
COPY --from=build /app/public ./public

RUN mkdir -p /app/logs /app/data

EXPOSE 3000

CMD ["node", "dist/index.js"]
