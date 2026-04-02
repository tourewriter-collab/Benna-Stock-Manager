# GitHub Auto-Update Setup Guide

This guide explains how to configure your Benna Stock Manager application to automatically check for and install updates from your GitHub repository.

---

## Overview

The application uses `electron-updater` to automatically:
- Check for new releases on GitHub
- Download updates in the background
- Notify users when updates are available
- Install updates with user confirmation

Updates are checked:
- On application startup
- Every hour while the app is running
- Manually via the Settings page

---

## Step 1: Create a GitHub Repository

1. **Create a new repository** on GitHub:
   - Go to https://github.com/new
   - Name it `benna-stock-manager`
   - Make it **public** (required for free auto-updates)
   - Do NOT initialize with README (you'll push existing code)

2. **Update package.json** with your GitHub username:
   ```json
   {
     "repository": {
       "type": "git",
       "url": "https://github.com/tourewriter-collab/Benna-Stock-Manager.git"
     }
   }
   ```
   Replace `YOUR_USERNAME` with your actual GitHub username.

---

## Step 2: Push Your Code to GitHub

```bash
# Initialize git (if not already done)
git init

# Add all files
git add .

# Commit
git commit -m "Initial commit"

# Add remote repository
git remote add origin https://github.com/tourewriter-collab/Benna-Stock-Manager.git

# Push to GitHub
git branch -M main
git push -u origin main
```

---

## Step 3: Generate GitHub Personal Access Token

The auto-updater needs a token to publish releases.

1. Go to GitHub Settings → Developer settings → Personal access tokens → Tokens (classic)
   - Or visit: https://github.com/settings/tokens

2. Click **Generate new token (classic)**

3. Give it a name: `Benna Stock Manager Release Token`

4. Select scopes:
   - ✅ `repo` (Full control of private repositories)

5. Click **Generate token**

6. **IMPORTANT**: Copy the token immediately (you won't see it again!)

---

## Step 4: Configure Environment Variable

Add the token to your environment:

**Windows:**
```cmd
setx GH_TOKEN "your_token_here"
```

**Mac/Linux:**
```bash
export GH_TOKEN="your_token_here"

# Add to ~/.bashrc or ~/.zshrc for persistence
echo 'export GH_TOKEN="your_token_here"' >> ~/.bashrc
```

**Alternative (for CI/CD):**
Add it to GitHub Secrets:
1. Go to your repository → Settings → Secrets and variables → Actions
2. Click **New repository secret**
3. Name: `GH_TOKEN`
4. Value: Your token
5. Click **Add secret**

---

## Step 5: Build and Publish Your First Release

### Build the Application

```bash
# Install dependencies
npm install

# Build the web app
npm run build

# Build the desktop app (choose your platform)
npm run electron:build:win    # Windows
npm run electron:build:mac    # macOS
npm run electron:build:linux  # Linux
```

### Publish to GitHub Releases

After building, the installer will be in the `release/` folder.

**Automatic Publishing:**
```bash
# This automatically creates a GitHub release and uploads the installer
npx electron-builder --publish always
```

**Manual Publishing:**
1. Go to your GitHub repository
2. Click **Releases** → **Create a new release**
3. Tag version: `v1.0.0`
4. Release title: `Benna Stock Manager v1.0.0`
5. Upload the installer from `release/` folder
6. Click **Publish release**

---

## Step 6: Version Management

### Updating the Version

Edit `package.json`:
```json
{
  "version": "1.0.1"
}
```

Follow semantic versioning:
- **1.0.0** → **1.0.1** (Bug fixes)
- **1.0.0** → **1.1.0** (New features)
- **1.0.0** → **2.0.0** (Breaking changes)

### Publishing Updates

1. Update version in `package.json`
2. Commit changes:
   ```bash
   git add package.json
   git commit -m "Version 1.0.1"
   git push
   ```
3. Build and publish:
   ```bash
   npm run build
   npx electron-builder --publish always
   ```

---

## How Auto-Update Works

### For Users

1. **Automatic Check**: App checks for updates on startup and hourly
2. **Notification**: User sees a dialog when an update is available
3. **Download**: User clicks "Download" to get the update
4. **Install**: After download, user clicks "Restart and Install"
5. **Update Applied**: App restarts with the new version

### Manual Check (Settings Page)

Users can manually check for updates:
1. Open the app
2. Go to **Settings**
3. Scroll to **Software Updates**
4. Click **Check for Updates**
5. Follow the prompts to download and install

---

## Update Flow Configuration

The auto-updater is configured in `electron/main.js`:

```javascript
// Check on startup
autoUpdater.checkForUpdatesAndNotify();

// Check every hour
setInterval(() => {
  autoUpdater.checkForUpdates();
}, 1000 * 60 * 60);
```

### Customization Options

**Change update frequency:**
```javascript
// Check every 30 minutes
setInterval(() => {
  autoUpdater.checkForUpdates();
}, 1000 * 60 * 30);
```

**Disable automatic downloads:**
```javascript
autoUpdater.autoDownload = false;  // User must click to download
```

**Auto-install on quit:**
```javascript
autoUpdater.autoInstallOnAppQuit = true;  // Install when user closes app
```

---

## Troubleshooting

### Updates Not Working in Development

Auto-updates only work in **production builds**. They are disabled when running `npm run dev`.

### "Update not available" but new version exists

**Possible causes:**
1. Version in `package.json` not incremented
2. GitHub release not published
3. Release marked as "pre-release" or "draft"
4. Repository is private (free auto-updates require public repos)

**Solution:**
- Verify version number is higher than installed version
- Check GitHub Releases page
- Ensure release is published and not a draft
- Make repository public or use a paid solution

### Download fails

**Check:**
1. Internet connection
2. GitHub is accessible
3. Release assets uploaded correctly
4. Installer file names match platform conventions

### Private Repository Updates

For private repositories, you need:
1. GitHub Enterprise account, OR
2. Use a custom update server, OR
3. Purchase electron-updater license

---

## Release Checklist

Before publishing an update:

- [ ] Version number incremented in `package.json`
- [ ] Code tested locally
- [ ] Changes documented in release notes
- [ ] Code committed and pushed to GitHub
- [ ] Build successful: `npm run build`
- [ ] Desktop app built: `npm run electron:build`
- [ ] Release published on GitHub
- [ ] Installer uploaded to release
- [ ] Test auto-update on existing installation

---

## Security Considerations

**Token Security:**
- Never commit `GH_TOKEN` to the repository
- Use environment variables or GitHub Secrets
- Rotate tokens periodically

**Code Signing (Recommended):**
For production apps, sign your installers:

**Windows:**
```json
{
  "win": {
    "certificateFile": "cert.pfx",
    "certificatePassword": "password"
  }
}
```

**macOS:**
```json
{
  "mac": {
    "identity": "Developer ID Application: Your Name (TEAM_ID)"
  }
}
```

---

## Advanced Configuration

### Custom Update Server

To use a custom server instead of GitHub:

```javascript
// electron/main.js
autoUpdater.setFeedURL({
  provider: 'generic',
  url: 'https://your-server.com/updates'
});
```

### Beta Channel

Support beta/alpha channels:

```json
{
  "version": "1.1.0-beta.1"
}
```

Users on beta channel will receive beta updates.

---

## Monitoring Updates

**Check logs:**
- Logs are saved to: `~/.config/benna-stock-manager/logs/`
- View logs for update activity and errors

**Track update metrics:**
- Monitor GitHub release download counts
- Track version distribution via analytics

---

## Resources

- [electron-updater documentation](https://www.electron.build/auto-update)
- [GitHub Releases guide](https://docs.github.com/en/repositories/releasing-projects-on-github)
- [Semantic Versioning](https://semver.org/)

---

## Support

If you encounter issues:
1. Check the logs in `~/.config/benna-stock-manager/logs/`
2. Verify GitHub token has correct permissions
3. Ensure repository is public
4. Check GitHub release is published (not draft)

---

**Last Updated**: 2026-03-18  
**Status**: Auto-update system fully configured and ready to use
