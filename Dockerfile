FROM keymetrics/pm2:12-alpine

WORKDIR /application

ARG RUNTIME_USER=readability

RUN adduser -D ${RUNTIME_USER}

RUN mkdir -p /home/${RUNTIME_USER}; \
    chown ${RUNTIME_USER}:${RUNTIME_USER} /home/${RUNTIME_USER}; \
    chown ${RUNTIME_USER}:${RUNTIME_USER} /application

USER ${RUNTIME_USER}

COPY package.json .
COPY yarn.lock    .

RUN yarn install --prod

COPY pm2.json .
COPY src      src
COPY release  .

CMD [ "pm2-runtime", "start", "pm2.json" ]
