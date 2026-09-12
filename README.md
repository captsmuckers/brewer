# Brewer

**A multi-server desktop client for [Sharkord](https://github.com/Sharkord/sharkord).**

Brewer puts all your Sharkord servers behind one Discord-style rail: each server
runs in its own view, keeps its session, and reports unread counts back to the
launcher — so you can stay in a voice channel on one server while reading
another.

Built on Electron. Ships for Linux and Windows.

---

## Install

Each of these downloads the current release and installs it in one go. They
resolve the latest version themselves, so they keep working after an update.

**Arch, CachyOS, EndeavourOS**

```bash
curl -L -o /tmp/brewer.pacman "$(curl -fsSL https://api.github.com/repos/captsmuckers/brewer/releases/latest | grep -oP '"browser_download_url":\s*"\K[^"]*\.pacman')" && sudo pacman -U /tmp/brewer.pacman
```

**Debian, Ubuntu, Mint**

```bash
curl -L -o /tmp/brewer.deb "$(curl -fsSL https://api.github.com/repos/captsmuckers/brewer/releases/latest | grep -oP '"browser_download_url":\s*"\K[^"]*\.deb')" && sudo apt install /tmp/brewer.deb
```

**Any Linux, no install**

```bash
curl -L -o ~/Brewer.AppImage "$(curl -fsSL https://api.github.com/repos/captsmuckers/brewer/releases/latest | grep -oP '"browser_download_url":\s*"\K[^"]*\.AppImage')" && chmod +x ~/Brewer.AppImage && ~/Brewer.AppImage
```

**Windows** — download the `.exe` from
[Releases](https://github.com/captsmuckers/brewer/releases/latest) and run it.
It is not code-signed, so Windows will say *"Windows protected your PC"*; click
**More info → Run anyway**.

> The package has to be downloaded before it is installed. Handing pacman a URL
> directly (`pacman -U https://…`) fails with a signature error, because
> pacman's `RemoteFileSigLevel` defaults to `Required` while `LocalFileSigLevel`
> defaults to `Optional`. Nothing is wrong with the package.

### Building it yourself

```bash
npm install
npm start
```

Packaging:

```bash
npm run dist:linux   # AppImage, deb, pacman
npm run dist:win     # NSIS installer
```

`dist:win` cross-builds the Windows installer and needs `wine` on the build
machine — electron-builder runs it to generate the NSIS uninstaller. This
affects nobody installing Brewer, only whoever builds it on Linux. Two gotchas:
electron-builder allows that step 120 seconds and reports only
`wine process failed ... Exit code: null` if it overruns, which a cold Wine
prefix will; run `wine --version` once first. And decline Wine's offer to
install `wine-mono` — NSIS has no use for .NET and the dialog blocks the build.

## Adding a server

Click **+** and paste either the server address (`sharkord.example.com`) or a
full invite link (`https://sharkord.example.com/?invite=CODE`). Brewer asks the
server who it is over Sharkord's public `/info` endpoint and previews the name,
logo and version before you commit.

Invite links are followed exactly once. After you've joined, Brewer loads the
server normally instead of replaying the invite on every launch.

## Shortcuts

| | |
|---|---|
| `Ctrl` `N` | Add a server |
| `Ctrl` `1`–`9` | Jump to a server |
| `Ctrl` `Tab` / `Ctrl` `Shift` `Tab` | Next / previous server |
| `Ctrl` `R` / `Ctrl` `Shift` `R` | Reload / hard reload the current server |
| `Ctrl` `+` / `-` / `0` | Zoom the current server (remembered per server) |
| `Ctrl` `,` | Settings |
| `Ctrl` `Shift` `I` | DevTools for the current server |

Right-click a server icon to reload, rename, copy its address, open it in your
browser, or remove it.

## Screen sharing

On X11 and Windows, Brewer shows its own picker with live previews of your
screens and windows, split into tabs, plus a **Share system audio** toggle.

On **Wayland**, your desktop provides the share dialog itself through
xdg-desktop-portal, and Brewer steps out of the way rather than showing a second
picker on top of it. This is not optional: on Wayland, enumerating capture
sources *is* what opens the portal, so an app that also draws its own picker ends
up asking twice and capturing a session it can no longer address.

**System audio is Windows-only.** Electron can only mix desktop audio into a
capture stream via loopback on Windows, so the toggle is disabled elsewhere and
says so. On Linux the usual workaround is to redirect Brewer's input while
you're sharing:

1. Start sharing, and unmute yourself in the voice channel.
2. Open `pavucontrol` → **Recording**.
3. Change Brewer's input device from your microphone to **Monitor of
   \<your output device\>**.

Desktop audio then reaches the channel over the microphone track. The trade-off
is that your actual mic is not transmitted while that's in effect.

## Notes on behaviour

**Voice keeps running in the background.** Switching servers hides a view, it
doesn't unload it, so an active voice connection survives the switch. This is
deliberate — it's what lets you listen to one server while reading another. Be
aware that Brewer will happily hold you in two voice channels at once; nothing
warns you, and Sharkord gives the shell no way to see voice state from outside
the page.

**Signing in with OIDC works.** Sharkord signs in by redirecting the whole page
to your identity provider and back. Brewer allows that, and shows a slim bar
while a view is on another origin with a **Back to server** button in case a
redirect strands you.

**Links open in your real browser.** Anything that would open a new window —
links posted in chat, the docs links in Sharkord's UI — goes to your default
browser rather than an extra Electron window.

## Where your data lives

Server list, settings and window geometry are stored in one file:

| | |
|---|---|
| Linux | `~/.config/Brewer/brewer.json` |
| Windows | `%APPDATA%\Brewer\brewer.json` |

Sessions and logins are handled by Chromium in the same directory. Brewer never
sees or stores your Sharkord credentials.

Upgrading from 0.2.x moves your old `localStorage` server list into that file
automatically on first launch.

## What changed in 0.3.0

Brewer 0.2.x was written against Sharkord as it stood in February 2026. Sharkord
has moved a long way since, and several things had quietly broken:

- **Desktop notifications now work.** 0.2.x only granted `media` and
  `display-capture`, so every `Notification` Sharkord raised was denied.
- **Screen sharing can carry system audio** (Windows). Sharkord asks for a
  stereo 48 kHz track; 0.2.x never supplied one, which is the "no audio" caveat
  from the old README.
- **Fullscreen works**, including the fullscreen button Sharkord added to video
  and screen-share tiles.
- **Real server names and logos**, read from `/info`, replacing a DOM scrape
  that only ever matched the generic logo on the pre-login screen and returned
  nothing once you were signed in.
- **Unread badges** on the rail and on the launcher, from the count Sharkord
  publishes in the document title.
- **Two servers can request screen capture at once** without one of them hanging
  forever on a clobbered callback.
- Window size and position are remembered; there's a tray mode, drag-to-reorder,
  per-server zoom and rename, a proper right-click menu, and a real Edit menu so
  copy and paste work inside message boxes.
- Device access is scoped to servers you've actually added, instead of any page
  a view happens to land on.
- Linux builds (AppImage, deb, pacman) alongside the Windows installer.
