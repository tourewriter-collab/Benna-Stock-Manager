# Quick Update Guide

This is a quick reference for publishing updates to your Benna Stock Manager application.

---

## First-Time Setup

1. **Update package.json** with your GitHub username:
   ```json
   "repository": {
     "url": "https://github.com/tourewriter-collab/Benna-Stock-Manager.git"
   }
   ```

2. **Create GitHub repository** (public)

3. **Generate GitHub token** at https://github.com/settings/tokens
   - Select `repo` scope
   - Save token to environment variable:
     ```bash
     # Windows
     setx GH_TOKEN "your_token_here"
     
     # Mac/Linux
     export GH_TOKEN="your_token_here"
     ```

4. **Push code to GitHub**:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/tourewriter-collab/Benna-Stock-Manager.git
   git push -u origin main
   ```

---

## Publishing an Update

### 1. Update Version
Edit `package.json`:
```json
{
  "version": "1.0.1"  // Increment this
}
```

### 2. Commit Changes
```bash
git add .
git commit -m "Version 1.0.1 - Bug fixes and improvements"
git push
```

### 3. Build and Publish
```bash
# Build web app
npm run build

# Build and publish desktop app
npx electron-builder --publish always
```

That's it! The update will be published to GitHub Releases automatically.

---

## How Users Get Updates

**Automatic (Default):**
- App checks for updates on startup
- App checks for updates every hour
- User gets notification when update is available
- User clicks "Download" → "Install and Restart"

**Manual:**
- User opens Settings page
- Clicks "Check for Updates"
- Follows prompts to download and install

---

## Versioning

Use semantic versioning:
- `1.0.0` → `1.0.1` = Bug fixes
- `1.0.0` → `1.1.0` = New features
- `1.0.0` → `2.0.0` = Breaking changes

---

## Testing Updates

Before releasing to users:

1. **Build locally**: `npm run electron:build`
2. **Install the app** from `release/` folder
3. **Increment version** in package.json
4. **Build again**: `npm run electron:build`
5. **Publish**: `npx electron-builder --publish always`
6. **Open installed app** and check for updates in Settings
7. **Verify update downloads and installs** correctly

---

## Troubleshooting

**Updates not detected?**
- Check version is incremented
- Verify release is published (not draft)
- Ensure repository is public

**Build fails?**
- Run `npm install` to update dependencies
- Check `GH_TOKEN` is set
- Verify internet connection

**Users can't download?**
- Check GitHub is accessible
- Verify release assets uploaded
- Ensure installer file is present

---

## Quick Commands

```bash
# Check current version
npm version

# Build web app
npm run build

# Build desktop app (Windows)
npm run electron:build:win

# Build and publish to GitHub
npx electron-builder --publish always

# View logs
# Windows: %APPDATA%\benna-stock-manager\logs
# Mac: ~/Library/Logs/benna-stock-manager
# Linux: ~/.config/benna-stock-manager/logs
```

---

For detailed instructions, see `GITHUB_AUTO_UPDATE_SETUP.md`
