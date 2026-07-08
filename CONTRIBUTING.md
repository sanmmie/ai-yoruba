```markdown
# 🤝 Contributing to YorùbáGPT

*Ẹ káàbọ̀!* (Welcome!)  
We are thrilled that you want to contribute to **YorùbáGPT** – the Digital Brain of Yorùbá Civilization.  
Whether you're a developer, linguist, student, or cultural enthusiast, there's a place for you here.

---

## 📌 Our Guiding Principles

1. **Respect the Language** – Yorùbá has diacritics (tone marks) and deep cultural context. Always prioritize linguistic accuracy.
2. **Collaborate, Don't Compete** – We work with AAUA, LyngualLabs, Masakhane, and other researchers. Share openly where possible.
3. **User-First** – Our free tier exists to serve students and the diaspora; keep accessibility in mind.
4. **Cultural Integrity** – Proverbs, oral traditions, and Ifá literature must be sourced accurately and cited when possible.

---

## 🧑‍💻 Who Can Contribute?

- **Developers** – Frontend (Vite), Backend (Firebase), DevOps (Docker/Netlify), Mobile, API integrations.
- **Linguists / Yorùbá Scholars** – Tone correction, grammar rules, dataset curation, translation validation.
- **UI/UX Designers** – Make the interface beautiful, intuitive, and accessible.
- **Researchers** – NLP models, speech synthesis (TTS/STT), corpus building.
- **Testers** – Report bugs, suggest features, test the AI responses.

---

## 🛠️ What to Work On?

Check our **Issues** tab for:
- 🐛 **Bug reports** (labeled `bug`)
- ✨ **Feature requests** (labeled `enhancement`)
- 🧪 **Good first issues** (perfect for new contributors!)
- 🏷️ **Help wanted** (we need extra hands)

You can also propose new features via a **Discussion** or an **Issue** before coding.

---

## 🔧 Development Environment Setup

Make sure you have:
- Node.js (v18 or higher)
- npm or yarn
- Firebase CLI (optional, for functions)
- Git

Follow the `README.md` to get the project running locally.

---

## 🚀 Contribution Workflow (Step-by-Step)

> **Note:** Our default branch is `main`. Always branch off `main` and merge back into `main`.

1. **Fork the repository** (click the Fork button on GitHub).
2. **Clone your fork** locally:
   ```bash
   git clone https://github.com/your-username/yorubagpt-deltaoscore-aaua.git
   cd yorubagpt-deltaoscore-aaua
   ```
3. **Add the original repo as upstream** (to keep your fork synced):
   ```bash
   git remote add upstream https://github.com/sanmmie/yorubagpt-deltaoscore-aaua.git
   ```
4. **Create a feature branch** (never work directly on `main`):
   ```bash
   git checkout -b feature/your-feature-name
   ```
5. **Make your changes** – write code, fix bugs, update docs, add translations, etc.
6. **Test your changes** – run `npm run dev` and ensure nothing breaks.
7. **Commit with a clear message**:
   ```bash
   git add .
   git commit -m "feat: add tone-mark correction for verbs"
   ```
   > We follow [Conventional Commits](https://www.conventionalcommits.org/):
   > - `feat:` new feature
   > - `fix:` bug fix
   > - `docs:` documentation
   > - `style:` formatting
   > - `refactor:` code restructuring
   > - `test:` adding tests
   > - `chore:` maintenance tasks
8. **Push to your fork**:
   ```bash
   git push origin feature/your-feature-name
   ```
9. **Open a Pull Request (PR)** on GitHub – go to the main repo, click "Pull Requests" → "New PR", and select your branch.
10. **Describe your PR** – explain *what* changed, *why*, and *how* you tested it.

---

## 📝 PR Checklist

Before submitting, ensure:
- [ ] Code follows existing style (ESLint runs without errors).
- [ ] You've tested locally (Firebase emulator or Vite dev server).
- [ ] No sensitive data (API keys, passwords) is committed.
- [ ] If adding new dependencies, they are justified.
- [ ] You've updated the `README.md` or docs if necessary.
- [ ] For UI changes, you've attached a screenshot (if possible).

---

## 🧪 Code Style

- **JavaScript/HTML/CSS**: We use ESLint (`npm run lint` to check).
- **Tone Marks**: When adding Yorùbá text, use Unicode combining characters (e.g., `ẹ̀` not `e + \`). We recommend the Yorùbá keyboard layout.
- **Comments**: Comment in English (for international developers) but include Yorùbá explanations where context matters.

---

## 🔒 Security & Data

- Never commit `.env` files or real Firebase service account keys.
- If you discover a security vulnerability, **do not open an issue**. Email us directly (add contact email) or DM the maintainer.

---

## 💬 Communication

- **GitHub Issues** – for bugs and feature requests.
- **Pull Requests** – for code contributions.
- **Discussions** – for questions, ideas, and general conversation.

---

## 👑 Recognition

All contributors will be acknowledged in our `CONTRIBUTORS.md` file (to be created) and on our website.  
*E se pupọ!* (Thank you very much!) for helping us build the digital future of the Yorùbá language.

---

## ❓ Questions?

Reach out to **Oluwasanmi** via [GitHub @sanmmie](https://github.com/sanmmie) or open a Discussion.

---

*Mọ́jú mọ́n* – Let's build this together! 🇳🇬🌍
```

---

## Part 2: Step‑by‑Step Guide for Contributors (Explained for Students & Beginners)

If your contributors (like students from AAUA) are new to Git, you can share this **plain‑language walkthrough** with them:

---

### Step 1: Fork the Repository (Make a copy)

- Go to your repository on GitHub: `https://github.com/sanmmie/yorubagpt-deltaoscore-aaua`
- Click the **Fork** button (top‑right corner).  
  → This creates a personal copy (e.g., `your-username/yorubagpt-deltaoscore-aaua`) under your own GitHub account.

---

### Step 2: Clone Your Fork (Download it to your computer)

```bash
git clone https://github.com/your-username/yorubagpt-deltaoscore-aaua.git
cd yorubagpt-deltaoscore-aaua
```

---

### Step 3: Add the Original Repository as "Upstream"

This lets you sync changes from the main project into your fork later.

```bash
git remote add upstream https://github.com/sanmmie/yorubagpt-deltaoscore-aaua.git
```

---

### Step 4: Create a Feature Branch

**Never commit directly to `main`** – it keeps things clean.

```bash
git checkout -b feature/add-translation-api
```
- Branch name should be descriptive (e.g., `fix/typo-in-readme`, `feature/voice-recognition`).

---

### Step 5: Make Your Changes

Write your code, fix the bug, or update documentation.  
Test it locally: `npm run dev`.

---

### Step 6: Stage and Commit Your Changes

```bash
git add .
git commit -m "feat: add translation endpoint for educational content"
```
- Write a short, clear message in **present tense**.

---

### Step 7: Push Your Branch to Your Fork

```bash
git push origin feature/add-translation-api
```
- `origin` is your fork. This uploads your branch to GitHub.

---

### Step 8: Open a Pull Request (PR)

1. Go to the original repository: `https://github.com/sanmmie/yorubagpt-deltaoscore-aaua`
2. You'll see a yellow banner saying *"Compare & pull request"* – click it.
   - If you don't see it, go to the **Pull Requests** tab → **New Pull Request**.
   - Set **base repository** = `sanmmie/yorubagpt-deltaoscore-aaua` (main)  
     **head repository** = `your-username/yorubagpt-deltaoscore-aaua` (your branch).
3. Write a description of your changes:
   - What did you add/fix?
   - Why is it important?
   - Did you test it?
4. Click **Create Pull Request**.

---

### Step 9: Wait for Review

- I (or other maintainers) will review your code.
- We might ask for changes – that's normal! Just update your branch and push again (the PR updates automatically).
- Once approved, we'll merge your contribution into the main project!

---

### Bonus: Syncing Your Fork with Upstream (Keep it up‑to‑date)

If you want to pull the latest changes from the main project into your fork:

```bash
git checkout main
git pull upstream main
git push origin main
```

---

## 🎯 Summary of Commands (Cheat Sheet)

| Action | Command |
|--------|---------|
| Clone your fork | `git clone <your-fork-url>` |
| Create branch | `git checkout -b feature/name` |
| Add changes | `git add .` |
| Commit | `git commit -m "feat: message"` |
| Push to your fork | `git push origin feature/name` |
| Open PR | Go to GitHub → Click "Compare & pull request" |
| Sync fork | `git pull upstream main` |

---
