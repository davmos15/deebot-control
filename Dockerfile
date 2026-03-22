FROM node:18-slim

# Install native dependencies for the 'canvas' npm module
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libcairo2-dev \
    libjpeg62-turbo-dev \
    libpango1.0-dev \
    libgif-dev \
    librsvg2-dev \
    pkg-config \
    python3 \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm install --production

COPY . .

EXPOSE 3001

CMD ["node", "server.js"]
