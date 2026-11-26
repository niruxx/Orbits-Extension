<div align="center">
  <p>✦ ────────── 🪐 ────────── ✦</p>
  <h1>Orbit Shell</h1>
  <p>A customizable dock, taskbar, and app launcher for GNOME Shell.</p>
  <p>
    <a href="#install">🚀 Install</a> ·
    <a href="#first-steps">🧭 First steps</a> ·
    <a href="#style-your-top-bar">✨ Top bar</a> ·
    <a href="#documentation">📚 Docs</a>
  </p>
</div>

---

<a name="install"></a>
## 🚀 Install Orbit Shell

Orbit declares support for **GNOME Shell 48–51** and has been verified in a GNOME Shell **51.1** session. The source installer needs `glib-compile-schemas`. See the [installation guide](docs/installation.md) and [acceptance report](docs/acceptance.md) for details.

1. 📥 **Get the source.** Skip this step if you already have the repository open in your terminal.

   ```sh
   git clone https://github.com/niruxx/Orbits-Extension.git
   cd Orbits-Extension
   ```

2. 📦 **Install for your account.** Run this from the repository root. Use the same command to update Orbit and keep your saved preferences.

   ```sh
   sh scripts/install.sh
   ```

3. 🔄 **Reload your session and enable Orbit.** On Wayland, log out and back in after installing or updating. Then enable the extension if needed.

   ```sh
   gnome-extensions enable orbit-dock@niruxx.github.io
   ```

<details>
<summary>📁 Install from an extension ZIP</summary>

If you already have the Orbit Shell extension ZIP, run the command below with the path to your downloaded file. Then follow step 3 above.

```sh
gnome-extensions install --force /path/to/orbit-dock@niruxx.github.io.shell-extension.zip
```

</details>

<a name="first-steps"></a>
## 🧭 Find your way around

Open **Extensions → Orbit Shell → Settings**, or run:

```sh
gnome-extensions prefs orbit-dock@niruxx.github.io
```

| To do this | Start here |
| --- | --- |
| 🛰️ **Pick a layout** | Open **Layouts**, choose a built-in preset such as **GNOME** or **Arc Desktop**, and review the preview before applying it. |
| 📌 **Pin your everyday apps** | Drag an app from the GNOME app grid onto the dock. Drag pinned icons along the dock to reorder them. |
| 🔎 **Launch an app** | Open Orbit's app menu with the applications button and type to search. Use **Launcher** to change the menu style or configure how **Super** opens it. |
| 🖥️ **Set up multiple monitors** | Open **Taskbar** to configure placement and controls for each monitor. |
| 🫧 **Adjust glass effects** | Open **Effects** to tune blur and brightness for the dock, panel, and launcher. |

<a name="style-your-top-bar"></a>
## ✨ Style your top bar

In **Top Bar**, choose **Translucent** for a fixed opacity or **Dynamic** to make the bar solid when a window touches it or maximizes.

- 🎨 Choose a custom color and tweak the opacity to match your desktop.
- 🫧 Enable a floating, rounded surface and add frosted glass for a softer look.
- 🕰️ Move the clock, hide Activities, or change the panel edge.
- 🪟 Under **Window Buttons**, enable **Minimize**, **Maximize / Restore**, or **Close**, then place the group on the left, center, or right.

See the [top bar guide](docs/top-bar.md) for focused-window behavior, notifications, and Quick Settings.

<a name="documentation"></a>
## 📚 Documentation

Browse the [documentation index](docs/README.md) or jump to a guide.

- **Desktop** · [Dock](docs/dock.md) · [Taskbar](docs/taskbar.md) · [Launcher](docs/launcher.md) · [Desktop icons](docs/desktop-icons.md) · [Tray](docs/tray.md)
- **Customization** · [Appearance and effects](docs/appearance.md) · [Top bar](docs/top-bar.md) · [Layouts and presets](docs/layouts.md) · [Backups](docs/backups.md)
- **Help and development** · [Troubleshooting](docs/troubleshooting.md) · [Development](docs/development.md) · [Testing](docs/testing.md) · [Acceptance report](docs/acceptance.md) · [Roadmap](docs/roadmap.md)
