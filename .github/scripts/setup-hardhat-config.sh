#!/bin/sh
MAINNET_URL="$1"
POLYGON_URL="$2"
OPTIMISM_URL="$3"
ARBITRUM_URL="$4"
GNOSIS_URL="$5"

set -o errexit

mkdir -p $HOME/.hardhat

echo "
{
  \"networks\": {
    \"mainnet\": { \"url\": \"${MAINNET_URL}\" },
    \"polygon\": { \"url\": \"${POLYGON_URL}\" },
    \"optimism\": { \"url\": \"${OPTIMISM_URL}\" },
    \"arbitrum\": { \"url\": \"${ARBITRUM_URL}\" },
    \"gnosis\": { \"url\": \"${GNOSIS_URL}\" }
  }
}
" > $HOME/.hardhat/networks.mimic.json
