FROM local/keepers

RUN apk add --no-cache daemontools --repository http://dl-cdn.alpinelinux.org/alpine/edge/testing

COPY ./healthcheck ./
COPY ./healthcheck.js ./
COPY ./entrypoint.sh /opt/orbs/service

HEALTHCHECK CMD /opt/orbs/healthcheck
