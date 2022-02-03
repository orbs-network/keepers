FROM node:14-alpine

# fix gyp during npm i
RUN apk update && apk add python3 make g++
#RUN apk add --no-cache python3 g++ make


ENV NODE_ENV production

WORKDIR /opt/orbs

COPY package*.json ./
COPY .version ./version
COPY abi ./abi

RUN apk add --no-cache git
RUN npm install


COPY dist ./dist

CMD [ "npm", "start" ]
