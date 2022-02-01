#!/bin/bash

npm run build
docker build -t orbsnetworkstaging/ethereum-writer:$(cat .version) ./boyar
