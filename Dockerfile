FROM node:24-alpine

WORKDIR /application

ENV PNPM_HOME="/pnpm"
ENV PATH="${PNPM_HOME}:${PATH}"

RUN corepack enable \
    && corepack prepare pnpm@11.7.0 --activate

ARG RUNTIME_USER=readability

RUN adduser -D ${RUNTIME_USER}

RUN mkdir -p /home/${RUNTIME_USER} \
    && chown ${RUNTIME_USER}:${RUNTIME_USER} /home/${RUNTIME_USER} \
    && chown ${RUNTIME_USER}:${RUNTIME_USER} /application

USER ${RUNTIME_USER}

COPY package.json .
COPY pnpm-lock.yaml .

RUN pnpm install --frozen-lockfile

COPY pm2.json .
COPY src      src
COPY release  .

CMD [ "node", "src/server.js" ]
