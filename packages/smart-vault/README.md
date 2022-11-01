<h1 align="center">
  <a href="https://mimic.fi"><img src="https://www.mimic.fi/logo.png" alt="Mimic Finance" width="200"></a> 
</h1>

<h4 align="center">A DeFi automation platform</h4>

<p align="center">
  <a href="https://badge.fury.io/js/@mimic-fi%2Fv2-smart-vault">
    <img src="https://badge.fury.io/js/@mimic-fi%2Fv2-smart-vault.svg" alt="NPM">
  </a>
  <a href="https://github.com/mimic-fi/v2-core/actions/workflows/ci.yml">
    <img src="https://github.com/mimic-fi/v2-core/actions/workflows/ci.yml/badge.svg" alt="CI">
  </a>
  <a href="https://discord.mimic.fi">
    <img src="https://img.shields.io/discourse/status?server=https%3A%2F%2Fmeta.discourse.org" alt="Discord">
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

This package contains contracts used for the Mimic Smart Vault. Smart Vaults provide a set of primitives to allow 
users to mix them and perform custom operations. Moreover, users can set custom permissions to enable different 
action patterns to manage their funds. 

## Setup

To set up this project you'll need [git](https://git-scm.com) and [yarn](https://classic.yarnpkg.com) installed. 
From your command line:

```bash
# Clone this repository
$ git clone https://github.com/mimic-fi/v2-core

# Go into the repository's package
$ cd v2-core/packages/smart-vault

# Install dependencies
$ yarn

# Run tests to make sure everything is set up correctly
$ yarn test
```

## Security

<blockquote style="background: rgba(197,127,66,0.34); border: #ffffff6b; text: #f5fffa">
  <h5 style="color: rgba(225,111,12,0.82)">⚠️ Auditing</h5>
  <p>The status of our contracts are considered as experimental and should be used at your own risk.</p>
</blockquote>

Even though all our smart contracts have been reviewed and supervised with security researchers, currently we are going
through a formal audit process with one of the top firms in the industry. We will disclose the results and takeovers as 
soon as we finish the process.

Hopefully soon we will be able to communicate a bug bounty program for the hacker community. However, if you found any 
potential issue in any of our smart contracts or in any piece of code you consider critical for the safety of the 
protocol, please contact us through <a href="mailto:security@mimic.fi">security@mimic.fi</a>.

## License

GPL 3.0

---

> Website [mimic.fi](https://mimic.fi) &nbsp;&middot;&nbsp;
> GitHub [@mimic-fi](https://github.com/mimic-fi) &nbsp;&middot;&nbsp;
> Twitter [@mimicfi](https://twitter.com/mimicfi) &nbsp;&middot;&nbsp;
> Discord [mimic](https://discord.mimic.fi)
