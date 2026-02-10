#!/bin/sh
set -e

# Default PUID/PGID to 1000 if not set
PUID=${PUID:-1000}
PGID=${PGID:-1000}

echo "───────────────────────────────────────"
echo "  What to Watch? Container Starting"
echo "───────────────────────────────────────"
echo "  PUID: ${PUID}"
echo "  PGID: ${PGID}"
echo "  DATA_PATH: ${DATA_PATH:-/app/data}"
echo "───────────────────────────────────────"

# Get current UID/GID of the nodejs user/group
CURRENT_UID=$(id -u nodejs 2>/dev/null || echo "")
CURRENT_GID=$(getent group nodejs | cut -d: -f3 2>/dev/null || echo "")

# Modify group GID if it differs
if [ -n "$CURRENT_GID" ] && [ "$CURRENT_GID" != "$PGID" ]; then
    echo "Changing nodejs group GID from ${CURRENT_GID} to ${PGID}"
    # Check if a group with the target GID already exists
    EXISTING_GROUP=$(getent group "$PGID" | cut -d: -f1 2>/dev/null || echo "")
    if [ -n "$EXISTING_GROUP" ] && [ "$EXISTING_GROUP" != "nodejs" ]; then
        echo "GID ${PGID} already in use by group '${EXISTING_GROUP}', modifying it first"
        delgroup "$EXISTING_GROUP" 2>/dev/null || true
    fi
    delgroup nodejs 2>/dev/null || true
    addgroup -g "$PGID" -S nodejs
fi

# Modify user UID if it differs
if [ -n "$CURRENT_UID" ] && [ "$CURRENT_UID" != "$PUID" ]; then
    echo "Changing nodejs user UID from ${CURRENT_UID} to ${PUID}"
    # Check if a user with the target UID already exists
    EXISTING_USER=$(getent passwd "$PUID" | cut -d: -f1 2>/dev/null || echo "")
    if [ -n "$EXISTING_USER" ] && [ "$EXISTING_USER" != "nodejs" ]; then
        echo "UID ${PUID} already in use by user '${EXISTING_USER}', removing it first"
        deluser "$EXISTING_USER" 2>/dev/null || true
    fi
    # Recreate user with new UID
    deluser nodejs 2>/dev/null || true
    adduser -S -u "$PUID" -G nodejs -h /app -s /sbin/nologin nodejs
fi

CURRENT_UID=$(id -u nodejs 2>/dev/null || echo "")
CURRENT_GID=$(id -g nodejs 2>/dev/null || echo "")

if [ "$CURRENT_UID" != "$PUID" ] || [ "$CURRENT_GID" != "$PGID" ]; then
    echo "Recreating nodejs user with UID=${PUID} GID=${PGID}"
    deluser nodejs 2>/dev/null || true
    delgroup nodejs 2>/dev/null || true
    addgroup -g "$PGID" -S nodejs
    adduser -S -u "$PUID" -G nodejs -h /app -s /sbin/nologin nodejs
fi

# Ensure data directory exists with correct ownership
DATA_DIR="${DATA_PATH:-/app/data}"
mkdir -p "${DATA_DIR}/uploads"

# Fix ownership of the data directory
chown -R nodejs:nodejs "${DATA_DIR}"

# Fix ownership of the app directory (needed for node to read files)
chown -R nodejs:nodejs /app

echo "Running as UID=$(id -u nodejs) GID=$(id -g nodejs)"
echo "───────────────────────────────────────"

# Execute the CMD as the nodejs user using dumb-init for signal handling
exec dumb-init -- su-exec nodejs "$@"