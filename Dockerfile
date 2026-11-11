FROM apify/actor-node:22
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm ci --omit=dev --omit=optional && npm cache clean --force
COPY . ./
CMD ["npm", "start"]
