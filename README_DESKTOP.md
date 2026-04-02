# 🖥️ Benna Stock Manager - Desktop Application

This is the desktop version of Benna Stock Manager, built with Electron for Windows, macOS, and Linux.

## 🚀 Quick Start

### Prerequisites

- **Node.js** v18 or higher ([Download](https://nodejs.org/))
- **npm** (comes with Node.js)
- Internet connection (for Supabase database)

### Build Instructions

#### Option 1: Using Build Scripts (Recommended)

**On Windows:**
```bash
build-desktop.bat
```

**On macOS/Linux:**
```bash
./build-desktop.sh
```

#### Option 2: Manual Build

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Build the Application**
   ```bash
   npm run build
   ```

3. **Build Desktop App**
   
   For your current platform:
   ```bash
   npm run electron:build
   ```

   For specific platforms:
   ```bash
   # Windows
   npm run electron:build:win

   # macOS
   npm run electron:build:mac

   # Linux
   npm run electron:build:linux
   ```

## 📦 Output

After building, you'll find the installer in the `release/` directory:

- **Windows**: `Benna Stock Manager Setup 1.0.0.exe`
- **macOS**: `Benna Stock Manager-1.0.0.dmg`
- **Linux**: `Benna Stock Manager-1.0.0.AppImage`

## 🔧 Configuration

### Environment Variables

The application is pre-configured with Supabase database credentials in the `.env` file:

```env
VITE_SUPABASE_URL=your-supabase-url
VITE_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

**⚠️ Important:**
- These credentials are already configured and ready to use
- The `.env` file is included in the packaged application
- Do not share the `.env` file publicly as it contains sensitive keys

### Database

The application uses **Supabase** as the database backend:

- **Type**: PostgreSQL (cloud-hosted)
- **Connection**: Automatic via environment variables
- **Migrations**: Automatically applied on first run
- **Data**: Stored securely in Supabase cloud

## 🎯 Features

The desktop app includes all web features plus:

✅ **Offline Authentication** - Login credentials cached locally  
✅ **Auto-Updates** - Automatic updates when new versions are released  
✅ **System Integration** - Native desktop notifications  
✅ **Performance** - Optimized for desktop use  
✅ **Security** - Sandboxed environment  

### Application Features

- 📊 **Dashboard** - Overview of inventory, stock levels, and outstanding payments
- 📦 **Inventory Management** - Track all parts and equipment
- 🏢 **Supplier Management** - Manage supplier information
- 🛒 **Order Tracking** - Create and track purchase orders
- 💰 **Payment Recording** - Record and track payments
- 📈 **Usage Reports** - Analyze part usage over time
- 🏷️ **Category Management** - Organize inventory with custom categories
- 🌐 **Multilingual** - English and French support
- 👥 **User Management** - Admin, audit manager, and user roles
- 🔍 **Audit Trail** - Complete history of all changes

## 🔐 Security

- **Row Level Security (RLS)** - Enabled on all database tables
- **Authentication** - Supabase Auth with email/password
- **Encrypted Storage** - Sensitive data encrypted at rest
- **Secure Communication** - HTTPS/WSS for all connections

## 🛠️ Development

### Run in Development Mode

```bash
# Terminal 1: Start the development server
npm run dev

# Terminal 2: Start Electron
npm run electron:dev
```

### Project Structure

```
benna-stock-manager/
├── dist/                 # Built web files
├── electron/             # Electron main process
├── server/               # Express backend
├── src/                  # React frontend
├── supabase/            # Database migrations
├── .env                 # Environment variables
├── build-desktop.sh     # Build script (Unix)
├── build-desktop.bat    # Build script (Windows)
└── package.json         # Dependencies & scripts
```

## 📋 System Requirements

### Minimum Requirements
- **OS**: Windows 10/11, macOS 10.13+, Linux (Ubuntu 18.04+)
- **RAM**: 4 GB
- **Storage**: 500 MB free space
- **Network**: Internet connection required

### Recommended
- **RAM**: 8 GB or more
- **Storage**: 1 GB free space
- **Network**: Stable broadband connection

## 🐛 Troubleshooting

### Build Fails

**Issue**: Build fails with errors

**Solutions**:
1. Clear cache and reinstall:
   ```bash
   rm -rf node_modules package-lock.json
   npm install
   ```

2. Check Node.js version:
   ```bash
   node --version  # Should be v18 or higher
   ```

3. Verify .env file exists and is properly formatted

### App Won't Start

**Issue**: Application doesn't launch

**Solutions**:
1. Check if port 5000 is available
2. Verify Supabase credentials in `.env`
3. Check application logs:
   - **Windows**: `%APPDATA%/benna-stock-manager/logs/`
   - **macOS**: `~/Library/Logs/benna-stock-manager/`
   - **Linux**: `~/.config/benna-stock-manager/logs/`

### Database Connection Issues

**Issue**: Cannot connect to database

**Solutions**:
1. Verify internet connection
2. Check Supabase status at https://status.supabase.com/
3. Verify environment variables in `.env` are correct
4. Check firewall settings

### Missing Dependencies

**Issue**: `npm install` fails

**Solutions**:
1. Update npm:
   ```bash
   npm install -g npm@latest
   ```

2. Use legacy peer deps (if needed):
   ```bash
   npm install --legacy-peer-deps
   ```

## 📝 Distribution

### Creating an Installer

The build process automatically creates platform-specific installers:

1. **Run the build command** for your target platform
2. **Find the installer** in the `release/` directory
3. **Test the installer** on a clean machine
4. **Distribute** the installer to users

### Auto-Updates

The application is configured for automatic updates via GitHub releases:

1. Create a new release on GitHub
2. Upload the built installers as release assets
3. Users will be notified of the update automatically

## 📞 Support

For issues, questions, or feature requests:

- **Email**: support@ikikecollective.com
- **Documentation**: See `DESKTOP_BUILD.md` for detailed build instructions

## 📄 License

Copyright © 2024 Ikiké Collective SARL. All rights reserved.

---

**Version**: 1.0.0  
**Built with**: Electron, React, Supabase, Express  
**Maintained by**: Ikiké Collective SARL
