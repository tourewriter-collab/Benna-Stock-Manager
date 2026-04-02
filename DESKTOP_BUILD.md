# Desktop App Build Instructions

This guide will help you compile the Benna Stock Manager as a desktop application using Electron.

## Prerequisites

- Node.js (v18 or higher)
- npm (comes with Node.js)
- Git (for version control)

## Environment Setup

1. **Configure Environment Variables**

   The `.env` file in the project root contains all necessary environment variables for Supabase:

   ```env
   VITE_SUPABASE_URL=your-supabase-url
   VITE_SUPABASE_ANON_KEY=your-anon-key
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   ```

   **Note:** These variables are already configured. The Supabase instance is already set up and ready to use.

2. **Install Dependencies**

   ```bash
   npm install
   ```

## Building the Desktop App

### Development Mode

To run the app in development mode with hot-reload:

```bash
# Start the development server
npm run dev
```

In a separate terminal:

```bash
# Run Electron
npm run electron:dev
```

### Production Build

To build the desktop application for your platform:

```bash
# Build for your current platform
npm run electron:build
```

Platform-specific builds:

```bash
# Windows
npm run electron:build:win

# macOS
npm run electron:build:mac

# Linux
npm run electron:build:linux
```

The compiled application will be available in the `release` directory.

## Build Output

After running the build command, you'll find:

- **Windows:** `.exe` installer in `release/`
- **macOS:** `.dmg` file in `release/`
- **Linux:** `.AppImage` file in `release/`

## Database Connection

The app is configured to use Supabase as the database backend. The connection is already configured with:

- **URL:** your-supabase-url
- **Authentication:** Using Supabase Auth with email/password
- **Tables:** All necessary tables are created via migrations

### Database Migrations

The database schema includes:
- Users and authentication
- Inventory management
- Categories (multilingual)
- Suppliers
- Orders and order items
- Payments
- Audit logs

Migrations are automatically applied when the app starts.

## Features

The desktop app includes:
- Offline-capable authentication
- Inventory management
- Supplier management
- Order tracking
- Payment recording
- Usage analytics
- Multilingual support (English/French)
- Auto-updates (in production builds)

## Troubleshooting

### Build Fails

1. Clear node_modules and reinstall:
   ```bash
   rm -rf node_modules package-lock.json
   npm install
   ```

2. Ensure all environment variables are set in `.env`

3. Check Node.js version:
   ```bash
   node --version  # Should be v18 or higher
   ```

### App Won't Start

1. Check that port 5000 is not in use
2. Verify Supabase connection in `.env`
3. Check logs in the app's user data directory

## Distribution

To distribute the app:

1. Build for the target platform
2. The installer/executable will be in the `release` folder
3. Share the installer with users
4. Users can install without needing Node.js or npm

## Notes

- The app uses Supabase for data persistence
- All data is stored in the cloud Supabase instance
- The app requires an internet connection to sync data
- Auto-updates are enabled for production builds

## Support

For issues or questions, contact the development team.
