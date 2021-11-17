FROM node:16-alpine

WORKDIR /application

RUN yarn global add pm2; \
    yarn cache clean

ARG RUNTIME_USER=readability

RUN adduser -D ${RUNTIME_USER}

RUN mkdir -p /home/${RUNTIME_USER}; \
    chown ${RUNTIME_USER}:${RUNTIME_USER} /home/${RUNTIME_USER}; \
    chown ${RUNTIME_USER}:${RUNTIME_USER} /application

USER ${RUNTIME_USER}

COPY package.json .
COPY yarn.lock    .

RUN yarn install --prod; \
    yarn cache clean

COPY pm2.json .
COPY src      src
COPY release  .

CMD [ "pm2-runtime", "start", "pm2.json" ]
