# BrandGuard AI 🛡️

**AI-powered brand governance and marketing content compliance.**

Review marketing copy, identify potentially misleading or unsupported claims, and get safer suggested alternatives before publishing.

### 🚀 Live Demo

**[Open BrandGuard AI](https://brandguard-ai-nvfs.onrender.com)**

> The live demo runs on Render's free tier and may take a little time to wake up after inactivity.

### ✨ Features

- AI-assisted marketing content review
- Risk and severity labels for flagged claims
- Explanations for detected issues
- Suggested alternative wording
- Apply suggestions directly to your draft
- Local rule checks when AI review is unavailable
- API key kept on the server, not in browser code

### 🧰 Tech Stack

- Node.js
- Express
- Groq API — `openai/gpt-oss-20b`
- HTML, CSS and JavaScript
- Node.js test runner

### 💻 Run Locally

1. Clone this repository.
2. Install dependencies:

   ```bash
   npm install
   ```

3. Create a `.env` file using `.env.example` as a reference.
4. Add your `GROQ_API_KEY` to `.env`.
5. Start the server:

   ```bash
   npm start
   ```

6. Open `http://localhost:3000`.

### 🧪 Tests

Run the automated test suite:

```bash
npm test
```

### 🔐 Security & Claim Verification

API keys should be stored in environment variables and never committed to GitHub. AI-generated findings are review suggestions, not legal advice or proof that a claim is false or verified.

### 📌 Project Status

A deployed working prototype. AI output and suggested wording should be reviewed before publication.
