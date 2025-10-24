# Setup Instructions - Etsy API Integration

This guide will help you set up the Seller Tools application with your Etsy API credentials.

## Prerequisites

- Node.js (v14 or higher)
- npm
- An Etsy seller account
- Etsy API credentials (API Key and Shared Secret)

## Step 1: Register Your App with Etsy

Before you can use this application, you need to register it in the Etsy Developer Dashboard:

1. Go to [Etsy Developer Dashboard](https://www.etsy.com/developers/your-apps)
2. Click "Create a New App" or select your existing app
3. Fill in the app details:
   - **App Name**: Seller Tools (or your preferred name)
   - **Description**: Backup and version control for Etsy listings
   - **Callback URL**: `http://localhost:3000/api/auth/etsy/callback`
4. Save the app and note down:
   - **API Key (keystring)**
   - **Shared Secret**

## Step 2: Configure Environment Variables

Create a `.env` file in the project root with your Etsy API credentials:

```bash
ETSY_API_KEY=your_api_key_here
ETSY_SHARED_SECRET=your_shared_secret_here
PORT=3000
SESSION_SECRET=generate-a-random-secure-string-here
FRONTEND_URL=http://localhost:8080
REDIRECT_URI=http://localhost:3000/api/auth/etsy/callback
```

**Important**:
- Replace `your_api_key_here` and `your_shared_secret_here` with your actual credentials from Step 1
- Make sure the `REDIRECT_URI` matches the Callback URL you registered in the Etsy Developer Dashboard
- The `.env` file is already in `.gitignore` and will NOT be committed to git

## Step 3: Install Dependencies

Install the required Node.js packages:

```bash
npm install
```

## Step 4: Start the Server

Start the backend server:

```bash
npm start
```

Or for development with auto-reload:

```bash
npm run dev
```

You should see:
```
🚀 Server running on http://localhost:3000
📱 Frontend available at http://localhost:3000/app.html
🔐 Etsy OAuth callback: http://localhost:3000/api/auth/etsy/callback
```

## Step 5: Connect Your Etsy Shop

1. Open your browser and go to: `http://localhost:3000/app.html`
2. Click "Connect to Etsy"
3. You'll be redirected to Etsy to authorize the app
4. Grant the requested permissions
5. You'll be redirected back to the app with your listings loaded

## Security Notes

⚠️ **Important Security Information**:

1. **Never commit `.env` to git** - It contains sensitive credentials
2. **Never share your API credentials** - Keep them private
3. The `.env` file is already added to `.gitignore`
4. Change `SESSION_SECRET` to a random secure string in production
5. Use HTTPS in production (set `cookie.secure: true` in `server.js`)

## What's Next?

Now that your Etsy integration is working, you can:

1. ✅ View all your Etsy listings
2. ✅ Create backups of selected listings
3. ✅ View backup history
4. ✅ Download listing data as JSON
5. ✅ Restore from previous backups

For detailed troubleshooting and development information, see the full documentation in the repository.

---

**Happy selling!** 🎉
