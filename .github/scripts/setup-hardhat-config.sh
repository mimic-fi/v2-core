#!/bin/sh
MAINNET_URL="$1"
POLYGON_URL="$2"

set -o errexit

mkdir -p $HOME/.hardhat

echo "
{
  \"networks\": {
    \"mainnet\": { \"url\": \"${MAINNET_URL}\" },
    \"polygon\": { \"url\": \"${POLYGON_URL}\" }
  }
}
" > $HOME/.hardhat/networks.mimic.json
