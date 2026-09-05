FROM node:24-bookworm-slim

# Dependencias de Linux del Chrome descargado por Puppeteer.
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates fonts-liberation libasound2 libatk-bridge2.0-0 \
    libatk1.0-0 libcairo2 libcups2 libdbus-1-3 libexpat1 libfontconfig1 \
    libgbm1 libglib2.0-0 libgtk-3-0 libnspr4 libnss3 libpango-1.0-0 \
    libpangocairo-1.0-0 libx11-6 libx11-xcb1 libxcb1 libxcomposite1 \
    libxcursor1 libxdamage1 libxext6 libxfixes3 libxi6 libxrandr2 \
    libxrender1 libxss1 libxtst6 xdg-utils \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV NODE_ENV=production \
    PUPPETEER_CACHE_DIR=/app/.cache/puppeteer

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Fallar en el build si Chrome no puede arrancar, sin conectar WhatsApp.
RUN node --input-type=module -e "import puppeteer from 'puppeteer'; const browser = await puppeteer.launch({args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']}); console.log(await browser.version()); await browser.close();"

COPY index.js bot-status.js keywords.js ./
CMD ["node", "index.js"]
