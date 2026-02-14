#!/bin/sh
set -e

# ---------------------------------------------------------------
# Backward-compat guard: if the container was started with
# --user flag (not running as root), skip user creation and
# run the app directly.
# ---------------------------------------------------------------
if [ "$(id -u)" -ne 0 ]; then
    echo "-------------------------------------"
    echo " Running as UID=$(id -u) GID=$(id -g)"
    echo " TIP: Remove --user flag and use"
    echo "   PUID/PGID env vars instead."
    echo "-------------------------------------"
    exec dumb-init -- "$@"
fi

# ---------------------------------------------------------------
# Read environment variables with defaults
# ---------------------------------------------------------------
PUID=${PUID:-1000}
PGID=${PGID:-1000}
UMASK=${UMASK:-002}

# Validate PUID/PGID are numeric
case "${PUID}" in
    ''|*[!0-9]*) echo "ERROR: PUID must be numeric, got '${PUID}'"; exit 1 ;;
esac
case "${PGID}" in
    ''|*[!0-9]*) echo "ERROR: PGID must be numeric, got '${PGID}'"; exit 1 ;;
esac

# Warn if running as root
if [ "${PUID}" -eq 0 ]; then
    echo "WARNING: Running as root (PUID=0) is not recommended."
fi

echo "-------------------------------------"
echo " PUID: ${PUID}"
echo " PGID: ${PGID}"
echo " UMASK: ${UMASK}"
echo "-------------------------------------"

# ---------------------------------------------------------------
# Set umask
# ---------------------------------------------------------------
umask "${UMASK}"

# ---------------------------------------------------------------
# Create group if it doesn't already exist
# ---------------------------------------------------------------
if getent group "${PGID}" > /dev/null 2>&1; then
    GROUP_NAME=$(getent group "${PGID}" | cut -d: -f1)
else
    GROUP_NAME="wtwp"
    addgroup -g "${PGID}" "${GROUP_NAME}"
fi

# ---------------------------------------------------------------
# Create user if it doesn't already exist
# ---------------------------------------------------------------
if getent passwd "${PUID}" > /dev/null 2>&1; then
    USER_NAME=$(getent passwd "${PUID}" | cut -d: -f1)
else
    USER_NAME="wtwp"
    adduser -D -u "${PUID}" -G "${GROUP_NAME}" -h /app "${USER_NAME}"
fi

# ---------------------------------------------------------------
# Fix data directory ownership (only if needed)
# ---------------------------------------------------------------
if [ -d /app/data ]; then
    CURRENT_OWNER=$(stat -c '%u:%g' /app/data)
    if [ "${CURRENT_OWNER}" != "${PUID}:${PGID}" ]; then
        echo "Fixing /app/data ownership to ${PUID}:${PGID}..."
        chown -R "${PUID}:${PGID}" /app/data
    fi
fi

# ---------------------------------------------------------------
# Ensure HOME is writable for the target user
# ---------------------------------------------------------------
export HOME=/app

# ---------------------------------------------------------------
# Drop privileges and exec the CMD
# ---------------------------------------------------------------
exec dumb-init -- su-exec "${PUID}:${PGID}" "$@"
