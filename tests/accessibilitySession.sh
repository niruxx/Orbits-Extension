#!/bin/sh
# Invoked only inside shellSmoke.sh's private dbus-run-session.
set -eu
unset AT_SPI_BUS_ADDRESS
/usr/lib/at-spi-bus-launcher --launch-immediately &
a11y_bus_pid=$!
registry_pid=''
cleanup() {
    if [ -n "$registry_pid" ]; then kill "$registry_pid" 2>/dev/null || true; fi
    kill "$a11y_bus_pid" 2>/dev/null || true
}
trap cleanup EXIT HUP INT TERM
sleep 1
/usr/lib/at-spi2-registryd &
registry_pid=$!
"$@"
