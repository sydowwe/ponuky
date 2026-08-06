FROM node:20-alpine

WORKDIR /app

# Najprv len manifesty kvôli cache vrstiev
COPY package.json ./
RUN npm install --omit=dev

# Zvyšok aplikácie
COPY server.js ./
COPY public ./public

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "server.js"]
