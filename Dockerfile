FROM keymetrics/pm2:10-alpine

WORKDIR /application

RUN apk add git --no-cache

COPY package.json .
COPY yarn.lock    .

RUN yarn install --prod ; \
    yarn cache clean

COPY pm2.json .
COPY src      src

CMD [ "pm2-runtime", "start", "pm2.json" ]
