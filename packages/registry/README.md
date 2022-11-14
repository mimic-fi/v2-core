<h1 align="center">
  <a href="https://mimic.fi"><img src="https://www.mimic.fi/logo.png" alt="Mimic Finance" width="200"></a> 
</h1>

<h4 align="center">A DeFi automation platform</h4>

<p align="center">
  <a href="https://badge.fury.io/js/@mimic-fi%2Fv2-registry">
    <img src="https://badge.fury.io/js/@mimic-fi%2Fv2-registry.svg" alt="NPM">
  </a>
  <a href="https://github.com/mimic-fi/v2-core/actions/workflows/ci.yml">
    <img src="https://github.com/mimic-fi/v2-core/actions/workflows/ci.yml/badge.svg" alt="CI">
  </a>
  <a href="https://discord.mimic.fi">
    <img alt="Discord" src="https://img.shields.io/discord/989984112397922325">
  </a>
  <a href="./LICENSE">
    <img src="https://img.shields.io/badge/license-GLP_3.0-green">
  </a>
</p>

<p align="center">
  <a href="#content">Content</a> •
  <a href="#setup">Setup</a> •
  <a href="#security">Security</a> •
  <a href="#license">License</a>
</p>

---

## Content 

This package contains contracts used for the Mimic Registry.
The Mimic Registry acts as a curated list of implementations provided by Mimic. This is how each smart vault can make
sure changes to their dependencies are actually safe. Additionally, it provides an on-chain mechanism to re-use 
implementations through proxies to make sure users don't need to pay much in order to deploy new instances.

## Setup

To set up this project you'll need [git](https://git-scm.com) and [yarn](https://classic.yarnpkg.com) installed. 
From your command line:

```bash
# Clone this repository
$ git clone https://github.com/mimic-fi/v2-core

# Go into the repository's package
$ cd v2-core/packages/registry

# Install dependencies
$ yarn

# Run tests to make sure everything is set up correctly
$ yarn test
```

## Security

To read more about our auditing and related security processes please refer to the [security section](https://docs.mimic.fi/miscellaneous/security) of our docs site.

However, if you found any potential issue in any of our smart contracts or in any piece of code you consider critical
for the safety of the protocol, please contact us through <a href="mailto:security@mimic.fi">security@mimic.fi</a>.

## License

GPL 3.0

---

> Website [mimic.fi](https://mimic.fi) &nbsp;&middot;&nbsp;
> GitHub [@mimic-fi](https://github.com/mimic-fi) &nbsp;&middot;&nbsp;
> Twitter [@mimicfi](https://twitter.com/mimicfi) &nbsp;&middot;&nbsp;
> Discord [mimic](https://discord.mimic.fi)
