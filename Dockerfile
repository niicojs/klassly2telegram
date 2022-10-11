FROM ubuntu:focal

ARG DEBIAN_FRONTEND=noninteractive
ARG TZ=Europe/Paris

RUN apt-get update && \
    # Install node16
    apt-get install -y curl && \
    curl -sL https://deb.nodesource.com/setup_16.x | bash - && \
    apt-get install -y nodejs && \
    npm install -g pnpm && \
    adduser pwuser && \ 
    npx playwright install-deps chromium && \
    # cleaning
    rm -rf /var/lib/apt/lists/* && \
    rm -rf /var/lib/apt/lists.d/* && \
    apt-get autoremove && \
    apt-get clean && \
    apt-get autoclean

COPY . ./app
WORKDIR /app
RUN pnpm i 

CMD node index.js --home /data
