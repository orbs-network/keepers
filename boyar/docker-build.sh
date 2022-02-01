#!/bin/bash

npm run build
docker build -t orbsnetworkstaging/keepers:$(cat .version) ./boyar
