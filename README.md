# Benna Stock Manager

A full-stack inventory management system with advanced security features, audit trails, and multi-language support.

## Features

- **User Authentication**: Supabase Auth with three role levels (admin, audit_manager, user)
- **Inventory Management**: Complete CRUD operations with search, filter, and status tracking
- **Security Freeze Rule**: Restricts editing for regular users after the 15th of each month
- **Audit Trail**: Comprehensive logging of all inventory changes with user tracking
- **Excel Export**: Export audit logs to Excel for analysis (admin/audit_manager only)
- **Internationalization**: Full support for English and French languages
- **Responsive Design**: Modern UI with Tailwind CSS
- **Auto-Update System**: Automatic updates from GitHub releases with built-in update checker
- **Desktop Application**: Cross-platform desktop app with Electron
- **Multi-Currency Support**: Dynamic currency formatting and conversion

## Technology Stack

- **Frontend**: React + TypeScript + Vite + Tailwind CSS
- **Backend**: Node.js + Express
- **Database**: Supabase (PostgreSQL)
- **Authentication**: Supabase Auth + bcrypt
- **Desktop**: Electron + electron-updater
- **Updates**: GitHub Releases integration
- **i18n**: react-i18next

## Prerequisites

- Node.js 18+ and npm
- (Optional) Electron for desktop builds

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd benna-stock-manager
```

2. Install dependencies:
```bash
npm install
```

3. Configure environment variables (optional):
Create a `.env` file in the root directory:
```
JWT_SECRET=your-secret-key-change-this-in-production
```

## Development

### Run the application in development mode:

```bash
npm run dev
```

This will start:
- Backend server on port 5000
- Frontend dev server on port 3000

### Default Login Credentials

- **Email**: admin@bennastock.com
- **Password**: admin123

⚠️ **Important**: Change the default admin password after first login!

For detailed login information, see `DEFAULT_CREDENTIALS.md`

## Building for Production

### Web Application

```bash
npm run build
```

The built files will be in the `dist/` directory.

### Desktop Application (Electron)

#### Windows:
```bash
npm run electron:build:win
```

#### macOS:
```bash
npm run electron:build:mac
```

#### Linux:
```bash
npm run electron:build:linux
```

The packaged application will be in the `release/` directory.

### Auto-Updates

The desktop application includes automatic update functionality using `electron-updater` with GitHub as the provider.

#### Setting Up Auto-Updates

1. **GitHub Repository**: Ensure your project is hosted on GitHub with releases enabled.

2. **GitHub Token**: To publish updates, you need to set the `GH_TOKEN` environment variable:
   ```bash
   # Windows (Command Prompt)
   set GH_TOKEN=your_github_personal_access_token

   # Windows (PowerShell)
   $env:GH_TOKEN="your_github_personal_access_token"

   # macOS/Linux
   export GH_TOKEN=your_github_personal_access_token
   ```

3. **Create a GitHub Personal Access Token**:
   - Go to GitHub Settings > Developer settings > Personal access tokens > Tokens (classic)
   - Click "Generate new token (classic)"
   - Select scopes: `repo` (full control of private repositories)
   - Copy the generated token

4. **Build and Publish**:
   ```bash
   npm run electron:build:win    # For Windows
   npm run electron:build:mac    # For macOS
   npm run electron:build:linux  # For Linux
   ```

   With `GH_TOKEN` set, electron-builder will automatically upload the build to GitHub Releases.

5. **How Auto-Updates Work**:
   - The app checks for updates on startup (production builds only)
   - Checks for updates every hour while running
   - Users can manually check via Settings page
   - When a new version is available, users are notified
   - Updates download with progress indicator
   - Users can install updates with one click (app restarts)
   - Updates are pulled from your GitHub Releases page

6. **Version Bumping**: Update the `version` field in `package.json` before each build to create a new release.

7. **Manual Update Check**: Users can check for updates anytime by:
   - Opening the application
   - Going to Settings page
   - Clicking "Check for Updates" button
   - Following the prompts to download and install

**Note**: Auto-updates only work in production builds. Development mode will not check for updates.

**For detailed setup instructions**, see `GITHUB_AUTO_UPDATE_SETUP.md`
**For quick reference**, see `QUICK_UPDATE_GUIDE.md`

## Project Structure

```
benna-stock-manager/
├── src/                    # Frontend source code
│   ├── pages/             # React pages
│   ├── components/        # Reusable components
│   ├── contexts/          # React contexts (Auth)
│   ├── locales/           # Translation files (en, fr)
│   └── main.tsx           # Entry point
├── server/                # Backend source code
│   ├── routes/            # API routes
│   ├── middleware/        # Express middleware
│   └── database.js        # SQLite database setup
├── electron/              # Electron main process files
├── database.sqlite        # SQLite database file (auto-created)
└── dist/                  # Production build output
```

## Database Schema

### Users Table
- id, email, password, name, role, created_at

### Inventory Table
- id, name, category, quantity, price, supplier, location, min_stock, max_stock, last_updated

### Audit Logs Table
- id, user_id, action, table_name, record_id, old_values, new_values, ip_address, timestamp

## API Endpoints

### Authentication
- `POST /api/auth/login` - User login

### Users (Admin only)
- `GET /api/users` - List all users
- `POST /api/users` - Create new user
- `PUT /api/users/:id` - Update user role
- `DELETE /api/users/:id` - Delete user

### Inventory
- `GET /api/inventory` - List all items
- `GET /api/inventory/:id` - Get single item
- `POST /api/inventory` - Create new item
- `PUT /api/inventory/:id` - Update item
- `DELETE /api/inventory/:id` - Delete item

### Audit
- `GET /api/audit/history/:id` - Get change history for item
- `GET /api/audit/export` - Export audit logs to Excel (admin/audit_manager)

## Security Features

1. **Role-Based Access Control**: Three distinct user roles with different permissions
2. **Security Freeze**: Users cannot edit after the 15th of the month
3. **Audit Logging**: All changes are tracked with user and timestamp
4. **Password Hashing**: bcrypt with salt rounds
5. **JWT Authentication**: Secure token-based authentication

## License

© 2024 Ikiké Collective SARL. All rights reserved. Version 2.0.0

## Support

For issues or questions, please contact the development team.
