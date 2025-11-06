# Movember Donation Scraper - Complete Setup Guide

A simple guide to set up a Cloudflare Worker that automatically tracks your Movember donation progress. This tool scrapes your Movember donation page and provides the data in a format perfect for stream overlays or websites.

## What This Does

This project creates a small program (called a "Worker") that runs on Cloudflare's servers. It automatically checks your Movember donation page every 5 minutes and stores the current donation amount. You can then access this information through a simple web link that returns the data in a format that's easy to use in stream overlays, websites, or other applications.

**Think of it like:** A robot that checks your Movember page every few minutes and gives you the latest donation amount whenever you ask for it.

---

## Step 1: Create a Cloudflare Account

### 1.1 Sign Up for Cloudflare

1. Go to [https://dash.cloudflare.com/sign-up/workers-and-pages](https://dash.cloudflare.com/sign-up/workers-and-pages)
2. Click the **"Sign Up"** button
3. Enter your email address and create a password
4. Verify your email address by clicking the link in the confirmation email Cloudflare sends you
5. Complete any additional verification steps if prompted

**Note:** Cloudflare offers a free tier that includes Workers, so you won't need to pay anything to get started!

### 1.2 Log In to Your Account

1. Go to [https://dash.cloudflare.com/](https://dash.cloudflare.com/)
2. Enter your email and password
3. Click **"Log in"**

You should now see the Cloudflare dashboard. Don't worry if it looks complicated - we'll guide you through everything you need!

---

## Step 2: Install Node.js

Node.js is a program that lets you run JavaScript code on your computer. We need it to set up and deploy your Worker.

### 2.1 Download Node.js

1. Go to [https://nodejs.org/](https://nodejs.org/)
2. You'll see two big green buttons - click the one that says **"LTS"** (this stands for "Long Term Support" and is the most stable version)
3. The download should start automatically. If it doesn't, click the download link for your operating system:
   - **Windows:** Click "Windows Installer (.msi)"
   - **Mac:** Click "macOS Installer (.pkg)"
   - **Linux:** Follow the instructions for your specific Linux distribution

### 2.2 Install Node.js

1. **Windows:**
   - Double-click the downloaded `.msi` file
   - Click "Next" through the installation wizard
   - Make sure "Add to PATH" is checked (it should be by default)
   - Click "Install" and wait for it to finish
   - Click "Finish"

2. **Mac:**
   - Double-click the downloaded `.pkg` file
   - Follow the installation wizard
   - Enter your Mac password when prompted
   - Click "Install" and wait for it to finish

3. **Linux:**
   - Follow the installation instructions for your specific distribution

### 2.3 Verify Node.js is Installed

1. Open a terminal/command prompt:
   - **Windows:** Press `Win + R`, type `cmd`, and press Enter
   - **Mac:** Press `Cmd + Space`, type "Terminal", and press Enter
   - **Linux:** Open your terminal application

2. Type the following command and press Enter:
   ```bash
   node --version
   ```

3. You should see a version number like `v20.x.x` or `v18.x.x`. If you see an error, try restarting your computer and try again.

4. Also check that npm (Node Package Manager) is installed:
   ```bash
   npm --version
   ```

   You should see a version number like `10.x.x` or `9.x.x`.

**If you see version numbers for both commands, you're all set!** ✅

---

## Step 3: Download and Set Up the Project

### 3.1 Get the Project Files

If you received this project as a ZIP file:
1. Extract the ZIP file to a folder on your computer (e.g., `C:\Users\YourName\movember-scraper` or `~/movember-scraper`)

If you received it from GitHub:
1. Clone the repository or download it as a ZIP file
2. Extract it to a folder on your computer

### 3.2 Open Terminal in the Project Folder

1. **Windows:**
   - Navigate to the project folder in File Explorer
   - Right-click in the folder
   - Select "Open in Terminal" or "Open PowerShell window here"
   - If you don't see this option, open Command Prompt and use `cd` to navigate:
     ```bash
     cd C:\path\to\your\project\folder
     ```

2. **Mac/Linux:**
   - Open Terminal
   - Use `cd` to navigate to the project folder:
     ```bash
     cd ~/path/to/your/project/folder
     ```

### 3.3 Install Project Dependencies

In your terminal, type the following command and press Enter:

```bash
npm install
```

This will download all the necessary code libraries the project needs. Wait for it to finish - it might take a minute or two. You'll see a lot of text scrolling by, which is normal.

When it's done, you should see something like:
```
added 150 packages, and audited 151 packages in 30s
```

**If you see any errors, make sure you're in the correct folder and that Node.js is installed correctly.**

---

## Step 4: Log In to Cloudflare from Your Computer

Now we need to connect your computer to your Cloudflare account so you can deploy your Worker.

### 4.1 Authenticate with Cloudflare

In your terminal (still in the project folder), type:

```bash
npx wrangler login
```

Press Enter. This will:
1. Open your web browser automatically
2. Ask you to log in to Cloudflare (if you're not already logged in)
3. Ask for permission to allow Wrangler (the Cloudflare tool) to access your account
4. Click "Allow" to grant permission

After you click "Allow", you should see a message in your terminal saying something like:
```
Successfully logged in.
```

**If the browser doesn't open automatically:**
- Look for a URL in the terminal output
- Copy and paste it into your browser
- Complete the login process

---

## Step 5: Create a KV Namespace (Database for Caching)

KV (Key-Value) is Cloudflare's simple database system. We use it to store the donation amounts temporarily so we don't have to check the Movember page every single time someone asks for the data.

### 5.1 Create the Production KV Namespace

In your terminal, type:

```bash
npx wrangler kv namespace create CACHE
```

Press Enter. You should see output like:
```
🌀  Creating namespace with title "CACHE"
✨  Success!
Add the following to your configuration file in your kv_namespaces array:
{ binding = "CACHE", id = "abc123def456ghi789" }
```

**IMPORTANT:** Copy the `id` value (the long string of letters and numbers) - you'll need it in the next step!

### 5.2 Create the Preview KV Namespace (for Testing)

Now create a preview namespace for local testing:

```bash
npx wrangler kv namespace create CACHE --preview
```

Press Enter. You should see similar output with a different `id`. Copy this `id` as well!

**You should now have TWO IDs:**
- One for production (the first command)
- One for preview (the second command, with `--preview`)

---

## Step 6: Configure Your Worker

Now we need to tell your Worker where to find the KV database we just created.

### 6.1 Open the Configuration File

1. In your project folder, find the file named `wrangler.jsonc`
2. Open it with a text editor:
   - **Windows:** Right-click the file → "Open with" → "Notepad" or any text editor
   - **Mac:** Right-click the file → "Open with" → "TextEdit" or any text editor
   - **Or use:** VS Code, Notepad++, Sublime Text, or any code editor

### 6.2 Update the KV Namespace IDs

You should see a section that looks like this:

```jsonc
"kv_namespaces": [
  {
    "binding": "CACHE",
    "id": "199652263a0d4886a813db0a4f4d538b"
  }
]
```

**Replace the `id` value** with the production KV namespace ID you copied in Step 5.1.

**Important Notes:**
- Make sure you keep the quotes around the ID
- Make sure there are no extra spaces
- The ID should be a long string of letters and numbers (like `abc123def456ghi789`)

**Example:**
If your production KV namespace ID was `abc123def456ghi789`, your file should look like:

```jsonc
"kv_namespaces": [
  {
    "binding": "CACHE",
    "id": "abc123def456ghi789"
  }
]
```

### 6.3 Save the File

Save the file after making your changes:
- **Windows:** Press `Ctrl + S`
- **Mac:** Press `Cmd + S`

---

## Step 7: (Optional) Test Your Worker Locally

Before deploying to the internet, you can test it on your computer to make sure everything works.

### 7.1 Start the Local Development Server

In your terminal, type:

```bash
npm run dev
```

Press Enter. You should see output like:
```
⎔ Starting local server...
[wrangler:inf] Ready on http://localhost:8787
```

### 7.2 Test It in Your Browser

1. Open your web browser
2. Go to: `http://localhost:8787`
3. You should see a page showing your Movember donation progress!

You can also test the JSON endpoint by going to: `http://localhost:8787/json`

### 7.3 Stop the Local Server

When you're done testing, go back to your terminal and press `Ctrl + C` (or `Cmd + C` on Mac) to stop the server.

---

## Step 8: Deploy Your Worker to Cloudflare

Now it's time to put your Worker on the internet so you can access it from anywhere!

### 8.1 Deploy the Worker

In your terminal, make sure you're still in the project folder, then type:

```bash
npm run deploy
```

Press Enter. You'll see a lot of output as it:
1. Builds your Worker
2. Uploads it to Cloudflare
3. Deploys it to their servers

This might take 30-60 seconds. When it's done, you should see something like:

```
✨  Deployed!
➜  https://your-worker-name.your-subdomain.workers.dev
```

**IMPORTANT:** Copy the URL it gives you - this is your Worker's address on the internet!

### 8.2 Test Your Deployed Worker

1. Open your web browser
2. Go to the URL you copied (it should look like `https://something.workers.dev`)
3. You should see your Movember donation progress page!

You can also test the JSON endpoint by adding `/json` to the end of your URL:
- Example: `https://your-worker.workers.dev/json`

---

## Step 9: Using Your Worker

### 9.1 Accessing Your Donation Data

Your Worker provides two ways to get your donation data:

**1. Visual Progress Page:**
- Just visit your Worker URL in a browser: `https://your-worker.workers.dev`
- You'll see a nice progress bar showing your donation progress

**2. JSON Data (for stream overlays/websites):**
- Visit: `https://your-worker.workers.dev/json`
- You'll get data in this format:
  ```json
  {
    "amount": "$2,500",
    "currency": "AUD",
    "target": "$10,000",
    "percentage": 25,
    "timestamp": 1704067200000
  }
  ```

### 9.2 How Often Does It Update?

- The Worker checks the Movember page every time someone requests the data
- However, it caches (stores) the result for 5 minutes
- This means if 10 people check in 5 minutes, it only actually checks the Movember page once
- After 5 minutes, the next request will fetch fresh data

### 9.3 Using in Stream Overlays

Most stream overlay software (like OBS, Streamlabs, etc.) can display data from a URL. You can use the `/json` endpoint to get the donation amount and display it in your overlay.

**Example for OBS:**
1. Add a "Browser Source" to your scene
2. Use a custom HTML/CSS overlay that fetches data from your Worker's `/json` endpoint
3. Or use a text source with a plugin that can read JSON from URLs

---

## Troubleshooting

### Problem: "Command not found" when running npm commands

**Solution:**
- Make sure Node.js is installed (see Step 2)
- Try restarting your terminal/computer
- Make sure you're in the project folder

### Problem: "Failed to authenticate" when running `wrangler login`

**Solution:**
- Make sure you're logged into Cloudflare in your browser
- Try running `npx wrangler login` again
- Make sure you click "Allow" when prompted

### Problem: "KV namespace not found" error

**Solution:**
- Make sure you created the KV namespace (Step 5)
- Double-check that you copied the correct ID into `wrangler.jsonc`
- Make sure there are no extra spaces or quotes in the ID
- Try creating the KV namespace again and updating the ID

### Problem: Worker doesn't show the correct donation amount

**Solution:**
- The Worker caches data for 5 minutes - wait a bit and try again
- Check that the Movember URL in the code matches your actual Movember page
- Check the Worker logs in the Cloudflare dashboard for errors

### Problem: "Cannot find module" errors

**Solution:**
- Make sure you ran `npm install` (Step 3.3)
- Delete the `node_modules` folder and run `npm install` again
- Make sure you're in the correct project folder

---

## Changing Your Movember Page URL

If you need to track a different Movember page:

1. Open the file `src/index.ts` in a text editor
2. Find the line that says:
   ```typescript
   const MOVEMBER_URL = "https://au.movember.com/donate/details?memberId=14810348";
   ```
3. Replace the URL with your Movember page URL
4. Save the file
5. Deploy again with `npm run deploy`

---

## Understanding the Files

Here's what each important file does:

- **`wrangler.jsonc`** - Configuration file that tells Cloudflare how to set up your Worker
- **`src/index.ts`** - The main code that does all the work (scrapes the page, caches data, etc.)
- **`package.json`** - Lists all the code libraries the project needs
- **`README.md`** - This file!

---

## Getting Help

If you run into problems:

1. **Check the Cloudflare Dashboard:**
   - Go to [https://dash.cloudflare.com/](https://dash.cloudflare.com/)
   - Click on "Workers & Pages" in the sidebar
   - Click on your Worker name
   - Check the "Logs" tab to see if there are any errors

2. **Check Your Terminal:**
   - Look for error messages when running commands
   - Error messages usually tell you what went wrong

3. **Common Issues:**
   - Make sure all the steps were completed in order
   - Double-check that you copied the KV namespace ID correctly
   - Make sure you're logged into Cloudflare

---

## What's Next?

Once your Worker is deployed and working:

- ✅ Your donation data is automatically updated every 5 minutes
- ✅ You can access it from anywhere via the Worker URL
- ✅ You can use it in stream overlays, websites, or any application
- ✅ It's running on Cloudflare's fast global network

**Congratulations!** 🎉 You've successfully set up your Movember donation tracker!

---

## Technical Details (For Reference)

- **Cache Duration:** 5 minutes (300 seconds)
- **Retry Attempts:** 3 tries with delays of 1s, 2s, and 4s
- **Browser Rendering:** Uses Cloudflare's Browser Rendering API
- **Response Format:** JSON with amount, currency, target, percentage, and timestamp

---

## License

MIT
