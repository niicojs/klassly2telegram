FROM ubuntu:focal

ARG DEBIAN_FRONTEND=noninteractive
ARG TZ=Europe/Paris

RUN apt-get update && \
    # Install node16
    apt-get install -y curl wget gpg && \
    curl -sL https://deb.nodesource.com/setup_16.x | bash - && \
    apt-get install -y nodejs && \
    # Feature-parity with node.js base images.
    apt-get install -y --no-install-recommends git openssh-client && \
    npm install -g pnpm && \
    # clean apt cache
    rm -rf /var/lib/apt/lists/* && \
    # Create the pwuser
    adduser pwuser && \ 
    npx playwright install-deps chromium

COPY . ./app
WORKDIR /app

RUN pnpm i 

CMD node index.js --home /data
