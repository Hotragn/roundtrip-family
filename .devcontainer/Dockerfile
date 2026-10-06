# The base image ships a Yarn apt source whose signing key no longer verifies, so the sshd
# feature's `apt-get update` failed and Codespaces fell back to its Alpine recovery container,
# where PyTorch can't install (docs/blocked.md). Drop that source before the features run.
FROM mcr.microsoft.com/devcontainers/python:1-3.12-bookworm
RUN grep -rl "dl.yarnpkg.com" /etc/apt/sources.list.d/ 2>/dev/null | xargs -r rm -f \
  && apt-get update \
  && rm -rf /var/lib/apt/lists/*
