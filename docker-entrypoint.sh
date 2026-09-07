#!/bin/sh
set -eu

./node_modules/.bin/prisma migrate deploy
exec "$@"
