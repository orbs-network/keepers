#FROM node:14-alpine
FROM --platform=linux/x86-64 node:16-alpine

# fix gyp during npm i
RUN apk update && apk add python3 make g++

WORKDIR /opt/orbs

COPY package*.json ./
COPY config.json ./
COPY .version ./version
COPY abi ./abi

RUN apk add --no-cache daemontools --repository http://dl-cdn.alpinelinux.org/alpine/edge/testing
RUN apk add --no-cache git
RUN npm install
COPY dist ./dist

ENV NODE_ENV        production
#ENV NODE_ENV        debug_leader

CMD [ "npm", "start" ]