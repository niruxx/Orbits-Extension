"""Inspect the private Shell's actual AT-SPI tree; never drives the user session."""
import gi
import sys
import time

gi.require_version('Atspi', '2.0')
from gi.repository import Atspi

expected = sys.argv[1]
deadline = time.monotonic() + 8
last_names = []
while time.monotonic() < deadline:
    queue = [Atspi.get_desktop(0)]
    visited = 0
    last_names = []
    while queue and visited < 5000:
        node = queue.pop()
        visited += 1
        try:
            name = node.get_name()
            if name:
                last_names.append(name)
            if name == expected:
                role = node.get_role_name()
                states = node.get_state_set()
                if role not in ('push button', 'button'):
                    raise RuntimeError(f'Unexpected role for launcher result: {role}')
                if not states.contains(Atspi.StateType.FOCUSABLE):
                    raise RuntimeError('Launcher result is not exposed as focusable')
                print(f'PASS: AT-SPI exposes {name!r} as {role}, focusable')
                sys.exit(0)
            queue.extend(node.get_child_at_index(i) for i in range(node.get_child_count()))
        except gi.repository.GLib.Error:
            continue
    time.sleep(.2)
raise RuntimeError(f'Launcher accessible not found. Observed: {last_names[:40]}')
