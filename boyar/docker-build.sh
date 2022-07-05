#!/bin/bash

npm run build
#docker build -t orbsnetworkstaging/keepers:$(cat .version) ./boyar
docker buildx build --platform linux/x86-64 --no-cache -t orbsnetworkstaging/keepers:$(cat .version) --push ./boyar