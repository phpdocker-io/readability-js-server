FROM node:24-alpine AS deps

WORKDIR /application

ENV PNPM_HOME="/pnpm"
ENV PATH="${PNPM_HOME}:${PATH}"
ENV PNPM_CONFIG_MINIMUM_RELEASE_AGE=0

RUN corepack enable \
    && corepack prepare pnpm@11.7.0 --activate

COPY package.json pnpm-lock.yaml ./

RUN pnpm install --frozen-lockfile --prod

FROM node:24-alpine

WORKDIR /application

ARG RUNTIME_USER=readability

RUN apk add --no-cache tini

RUN adduser -D ${RUNTIME_USER} \
    && mkdir -p /home/${RUNTIME_USER} /application \
    && chown -R ${RUNTIME_USER}:${RUNTIME_USER} /home/${RUNTIME_USER} /application

COPY --from=deps /application/node_modules ./node_modules
COPY src src
COPY release .

USER ${RUNTIME_USER}

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "src/server.js"]
