# CardDrop — Business Card Scanner

Scan business cards → Gemini extracts fields → review → saves to Google Sheets.

---

## Setup (one time, ~10 mins)

### 1. Get your Gemini API Key (free)
- Go to https://aistudio.google.com
- Click **Get API Key** → **Create API key**
- Copy the key

### 2. Prepare your Google Sheet
- Create a new Google Sheet
- Add this header row in Row 1:
  `Timestamp | Name | Email | Phone | Company | Designation | Website | Remarks`
- Copy the Sheet ID from the URL:
  `https://docs.google.com/spreadsheets/d/THIS_IS_YOUR_SHEET_ID/edit`

### 3. Set up Google Service Account
- Go to https://console.cloud.google.com
- Create a project (or use existing)
- Enable **Google Sheets API**
- Go to **IAM & Admin → Service Accounts** → Create service account
- Click the service account → **Keys** → **Add Key** → **JSON**
- Download the JSON file
- Share your Google Sheet with the service account email (editor access)
  (the email looks like: `something@your-project.iam.gserviceaccount.com`)

### 4. Add environment variables
Copy `.env.local` and fill in:
```
GEMINI_API_KEY=your_key
GOOGLE_SHEET_ID=your_sheet_id
GOOGLE_SERVICE_ACCOUNT_JSON={"type":"service_account",...}  ← paste entire JSON as one line
```

For the JSON — open the downloaded file, copy everything, paste as one line (no line breaks).

### 5. Deploy to Vercel
```bash
npm install -g vercel
vercel
```
When prompted, add the 3 environment variables.

Or via Vercel dashboard: **Settings → Environment Variables** → add all three.

---

## Local dev
```bash
npm install
npm run dev
```
Open http://localhost:3000

---

## Sheet columns output
| Timestamp | Name | Email | Phone | Company | Designation | Website | Remarks |
|-----------|------|-------|-------|---------|-------------|---------|---------|

---

## Tech
- Next.js 14 (App Router)
- Gemini 1.5 Flash (free tier)
- Google Sheets API
- Deployed on Vercel (free tier)
