FROM node:24-alpine AS deps

WORKDIR /application

COPY package.json package-lock.json ./

RUN npm ci --omit=dev

FROM node:24-alpine

WORKDIR /application

ARG RUNTIME_USER=readability

RUN apk add --no-cache tini

RUN adduser -D ${RUNTIME_USER} \
    && mkdir -p /home/${RUNTIME_USER} /application \
    && chown -R ${RUNTIME_USER}:${RUNTIME_USER} /home/${RUNTIME_USER} /application

COPY --from=deps /application/node_modules ./node_modules
COPY src src
COPY package.json .

USER ${RUNTIME_USER}

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "src/server.js"]
