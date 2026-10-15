#!/usr/bin/env bash
set -euo pipefail
cd /workspace/AI-JJZZ
export npm_config_cache=/workspace/.npm-cache
export XDG_CACHE_HOME=/workspace/.cache
export XDG_CONFIG_HOME=/workspace/.config
export NODE_USE_ENV_PROXY=1
npm ci
command -v ffmpeg >/dev/null
if ! command -v Xvfb >/dev/null && [ ! -x /workspace/.desktop-test/extracted/usr/bin/Xvfb ]; then
  mkdir -p /workspace/.desktop-test/lists/partial /workspace/.desktop-test/extracted
  printf '%s\n' 'deb [signed-by=/usr/share/keyrings/debian-archive-keyring.gpg] https://deb.debian.org/debian trixie main' > /workspace/.desktop-test/sources.list
  cd /workspace/.desktop-test
  apt-get -o Dir::Etc::parts=- -o Dir::Etc::sourceparts=- -o Dir::Etc::sourcelist=/workspace/.desktop-test/sources.list -o Dir::State::lists=/workspace/.desktop-test/lists update
  apt-get -o Dir::Etc::parts=- -o Dir::Etc::sourceparts=- -o Dir::Etc::sourcelist=/workspace/.desktop-test/sources.list -o Dir::State::lists=/workspace/.desktop-test/lists download xvfb
  for package in xvfb_*.deb; do dpkg-deb -x "$package" extracted; done
fi
cd /workspace/AI-JJZZ
npm run verify
