## Install

One line, copy and paste. Each resolves the current release itself, so it keeps working after an update.

**Arch / CachyOS / EndeavourOS**

```bash
curl -L -o /tmp/brewer.pacman "$(curl -fsSL https://api.github.com/repos/captsmuckers/brewer/releases/latest | grep -oP '"browser_download_url":\s*"\K[^"]*\.pacman')" && sudo pacman -U /tmp/brewer.pacman
```

**Debian / Ubuntu / Mint**

```bash
curl -L -o /tmp/brewer.deb "$(curl -fsSL https://api.github.com/repos/captsmuckers/brewer/releases/latest | grep -oP '"browser_download_url":\s*"\K[^"]*\.deb')" && sudo apt install /tmp/brewer.deb
```

**Any Linux, no install**

```bash
curl -L -o ~/Brewer.AppImage "$(curl -fsSL https://api.github.com/repos/captsmuckers/brewer/releases/latest | grep -oP '"browser_download_url":\s*"\K[^"]*\.AppImage')" && chmod +x ~/Brewer.AppImage && ~/Brewer.AppImage
```

**Windows** — download the `.exe` below and run it. It is not code-signed, so Windows will say *"Windows protected your PC"*; click **More info → Run anyway**.

The file has to be downloaded before installing. Passing the URL straight to pacman (`pacman -U https://…`) fails with a signature error — that is pacman's `RemoteFileSigLevel` defaulting to `Required`, not a problem with the package.

---

Built on GitHub Actions — Linux on `ubuntu-latest`, Windows on `windows-latest`.
