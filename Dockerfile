FROM node:14-alpine

# fix gyp during npm i
#RUN apk update && apk add python3 make g++

WORKDIR /opt/orbs

COPY package*.json ./
COPY .version ./version
COPY abi ./abi

RUN apk add --no-cache git
RUN npm install
COPY dist ./dist

ENV NODE_ENV        production
ENV ALWAYS_LEADER   1

CMD [ "npm", "start" ]
