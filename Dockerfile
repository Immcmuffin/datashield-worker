FROM mcr.microsoft.com/playwright:v1.60.0-jammy

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY tsconfig.json ./
COPY src ./src

# Force fresh build: 1779564669
RUN rm -rf dist && npm run build && echo "Build complete: $(ls dist/)"

CMD ["npm", "start"]
