# 🔐 Benna Stock Manager - Default Login Credentials

## Default Admin Account

Use these credentials to log in to the application for the first time:

**Email:** `admin@bennastock.com`  
**Password:** `admin123`

## Important Security Notes

⚠️ **CRITICAL**: You MUST change the default admin password immediately after your first login!

1. Log in with the default credentials above
2. Go to Settings
3. Change the admin password to a strong, unique password
4. Store your new password securely

## First Login Process

When you log in for the first time with these credentials:

1. The system will verify your credentials against the database
2. A Supabase Auth account will be automatically created
3. Your session will be established
4. You'll be redirected to the dashboard

This process may take a few seconds on the first login.

## Troubleshooting Login Issues

### "Invalid credentials" error

If you see this error, it could be due to:

1. **Typing error**: Double-check you're using:
   - Email: `admin@bennastock.com`
   - Password: `admin123`

2. **Database not initialized**: Ensure the application has started properly and migrations have run

3. **Network issue**: Check your internet connection (required for Supabase)

### Check Database Connection

To verify the database is set up correctly:

```bash
# The app should show this in console on startup:
Server running on port 5000
```

### Browser Console Logs

If login fails, open your browser's developer console (F12) and check for error messages. Common issues:

- Network errors: Check internet connection
- CORS errors: Ensure the app is running on the correct port
- Auth errors: Check the error message for details

## Creating Additional Users

After logging in as admin, you can create additional users:

1. Go to **Admin** → **User Management**
2. Click **Add New User**
3. Fill in the user details:
   - Email
   - Name
   - Role (admin, audit_manager, or user)
   - Password
4. Click **Create User**

### User Roles

**Admin**
- Full access to all features
- Can manage users
- Can manage all inventory, orders, suppliers, and payments
- Can view audit logs

**Audit Manager**
- Can manage inventory
- Can manage suppliers, orders, and payments
- Can view audit logs
- Cannot manage users

**User**
- Can view all data
- Cannot modify anything
- Cannot view audit logs

## Password Requirements

When creating or changing passwords:

- Minimum 6 characters (recommended: 12+ characters)
- Use a mix of letters, numbers, and symbols
- Avoid common words or patterns
- Don't reuse passwords from other services

## Security Best Practices

1. **Change default password immediately**
2. **Use strong, unique passwords** for each user
3. **Limit admin accounts** to only necessary personnel
4. **Review user access** regularly
5. **Monitor audit logs** for suspicious activity
6. **Keep the application updated**

## Need Help?

If you continue to experience login issues:

1. Check the application logs
2. Verify your internet connection
3. Ensure Supabase is accessible
4. Review the browser console for errors
5. Contact support with error details

---

**Remember**: Always log out when finished, especially on shared computers!
