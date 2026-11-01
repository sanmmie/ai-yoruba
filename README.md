```markdown
# YorùbáGPT — The Digital Brain of Yorùbá Civilization

<<<<<<< HEAD
[![Netlify Status](https://api.netlify.com/api/v1/badges/your-badge-id/deploy-status)](https://yorubagpt.netlify.app/)
=======
[![Firebase Hosting Status](https://api.Firebase Hosting.com/api/v1/badges/your-badge-id/deploy-status)](https://ai-yoruba.web.app/)
>>>>>>> fix/master-upgrade-v2
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**YorùbáGPT** is an AI-powered ecosystem for the Yorùbá language, culture, and education – built in partnership with **Adekunle Ajasin University (AAUA)**. We go beyond a simple chatbot: we are building the foundational AI platform that preserves, promotes, and empowers the Yorùbá language for generations to come.

<<<<<<< HEAD
🔗 **Live Demo:** [ai-yoruba.web.app](https://ai-yoruba.web.app)
=======
🔗 **Live Demo:** [ai-yoruba.web.app](http://ai-yoruba.web.app)
>>>>>>> fix/master-upgrade-v2

---

## 🚀 Vision

> *To become the authoritative AI operating system for Yorùbá language, culture, education, and research – bridging the gap between tradition and technology.*

We are not just another AI that speaks Yorùbá. We are the digital brain that understands **proverbs, history, Ifá literature, oral traditions, names, festivals, cuisine, and more**.

---

## 🎯 Why YorùbáGPT?

### ✅ Strengths
- **Academic Credibility** – Official partnership with AAUA’s Department of Yorùbá Studies.
- **Holistic Ecosystem** – Beyond chat: translation, speech, education, research, APIs.
- **Cultural Depth** – Built with domain expertise, not generic LLMs.

### 📈 Opportunities We Pursue
| Sector | Application |
|--------|-------------|
| 🎓 Education | WAEC/NECO/JAMB AI tutor, homework helper, grammar correction |
| 🏛️ Government | Digital language preservation, official translation |
| 🌍 Diaspora | Reconnection with language and culture |
| 💼 Business | AI customer support in Yorùbá |
| 🏥 Healthcare | Native-language health communication |
| 🔬 Research | AI-assisted corpus analysis, tone restoration, OCR |
| 🛠️ Developers | API platform for translation, speech, dictionary, spell-check |

---

## ✨ Features

- **Conversational AI** – Natural dialogue in Yorùbá (and English).
- **Translation & Dictionary** – Yorùbá ↔ English with tone marks.
- **Speech Recognition & Synthesis** – Voice input/output (STT/TTS).
- **Cultural Intelligence** – Proverbs, history, festivals, names, cuisine.
- **Educational Tools** – Homework assistance, essay support, pronunciation guide.
- **Image Understanding** – Describe and interpret images in Yorùbá.
- **Document Processing** – Translate long documents, batch processing.
- **Developer APIs** – Integrate Yorùbá AI into your own apps.

---

## 💰 Subscription Tiers

We follow a **freemium model** to maximize accessibility while ensuring sustainability.

| Plan       | Monthly (NGN) | Monthly (USD) | Target Users |
|------------|---------------|---------------|--------------|
| **Free**   | ₦0            | $0            | Casual users (limited daily prompts) |
| **Student**| ₦1,500        | $2.99         | Students, language learners |
| **Standard**| ₦3,000       | $5.99         | Professionals, everyday users |
| **Pro**    | ₦7,500        | $12.99        | Researchers, educators, creators |
| **Enterprise**| Custom    | Custom        | Schools, universities, businesses |

---

## 🧰 Tech Stack

| Layer          | Technology |
|----------------|------------|
| **Frontend**   | Vite + vanilla JavaScript (or React/Vue) – see `src/` |
| **Backend**    | Firebase Cloud Functions (Node.js) |
| **Database**   | Cloud Firestore (NoSQL) |
| **Authentication** | Firebase Auth |
<<<<<<< HEAD
| **Hosting**    | Netlify (primary) / Firebase Hosting / Docker |
=======
| **Hosting**    | Firebase Hosting (primary) / Firebase Hosting / Docker |
>>>>>>> fix/master-upgrade-v2
| **Deployment** | GitHub Actions, Docker, Nginx |
| **Static Assets** | Vite build output in `public/` |

---

## 📂 Project Structure

```
.
├── .github/workflows      # CI/CD pipelines
├── functions/             # Firebase Cloud Functions (backend)
├── public/                # Static assets (images, fonts, etc.)
├── src/                   # Frontend source code
│   ├── components/        # Reusable UI components
│   ├── pages/             # Page views (home, pricing, etc.)
│   ├── services/          # API calls, Firebase integration
│   └── styles/            # CSS modules / global styles
├── .env.example           # Environment variables template
├── .eslintrc.cjs          # ESLint configuration
├── .gitignore
├── Dockerfile             # Containerized deployment
├── docker-compose.yml     # Multi-container setup
├── firebase.json          # Firebase Hosting/Functions config
├── firestore.indexes.json # Firestore composite indexes
├── firestore.rules        # Firestore security rules
├── index.html             # Vite entry point
<<<<<<< HEAD
├── netlify.toml           # Netlify deployment config
=======
├── firebase.json           # Firebase Hosting deployment config
>>>>>>> fix/master-upgrade-v2
├── nginx.conf             # Nginx reverse proxy config
├── package.json           # Dependencies and scripts
├── pricing.html           # (Optional standalone pricing page)
├── style.css              # (Global CSS, may move to src)
└── vite.config.js         # Vite build configuration
```

---

## 🛠️ Local Development

### Prerequisites
- Node.js (v18+)
- npm or yarn
- Firebase CLI (optional, for local functions)

### Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/sanmmie/yorubagpt-deltaoscore-aaua.git
   cd yorubagpt-deltaoscore-aaua
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Environment variables**
<<<<<<< HEAD
   Copy `.env.example` to `.env` and fill in your Firebase config and API keys:
   ```bash
   cp .env.example .env
   ```
=======
   Copy `.env.example` to `.env.local` and replace every placeholder with values from your Firebase project:
   ```bash
   cp .env.example .env.local
   ```
   In PowerShell, use `Copy-Item .env.example .env.local`. Find the web app config in Firebase Console → Project settings → General → Your apps. The example values are placeholders and will not work.
>>>>>>> fix/master-upgrade-v2
   (See **Environment Variables** section below for required keys.)

4. **Run the development server**
   ```bash
   npm run dev
   ```
   The app will be available at `http://localhost:5173`.

5. **(Optional) Run Firebase Functions locally**
   ```bash
   npm run serve
   ```

---

## 🔐 Environment Variables

<<<<<<< HEAD
Create a `.env` file with the following keys:
=======
Create a `.env.local` file with the following keys:
>>>>>>> fix/master-upgrade-v2

```
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_bucket.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
VITE_FIREBASE_MEASUREMENT_ID=your_measurement_id

# For Cloud Functions / backend
FIREBASE_ADMIN_PRIVATE_KEY=your_private_key
FIREBASE_ADMIN_CLIENT_EMAIL=your_service_account_email

# Optional: Third-party API keys (e.g., OpenAI, Hugging Face)
VITE_OPENAI_API_KEY=your_openai_key
```

<<<<<<< HEAD
> **Never commit `.env` to version control** – it is already ignored via `.gitignore`.
=======
> **Never commit `.env.local` to version control** – environment files are ignored via `.gitignore`. `VITE_*` values are bundled into the public frontend; use Firebase Security Rules to protect data.

If you see `Firebase: Error (auth/invalid-api-key)`, verify that `VITE_FIREBASE_API_KEY` is the real Web API key for this Firebase project (not `AIzaSy...` or another example value), and that the other `VITE_FIREBASE_*` values belong to the same project. Restart `npm run dev` after changing the file. For Firebase Hosting, set these variables in the site's build environment and trigger a new deploy; Vite embeds them at build time.
>>>>>>> fix/master-upgrade-v2

---

## 🚢 Deployment

<<<<<<< HEAD
### Netlify (Recommended)
1. Connect your GitHub repository to Netlify.
2. Set build command: `npm run build`
3. Publish directory: `dist`
4. Add the same environment variables in Netlify's UI.
=======
### Firebase Hosting (Recommended)
1. Connect your GitHub repository to Firebase Hosting.
2. Set build command: `npm run build`
3. Publish directory: `dist`
4. Add the `VITE_FIREBASE_*` variables in Firebase Hosting's UI, then trigger a new deploy.
>>>>>>> fix/master-upgrade-v2

### Firebase Hosting
```bash
npm run build
firebase deploy --only hosting
```

### Docker (Production)
```bash
docker build -t yorubagpt .
docker run -p 8080:80 yorubagpt
```

---

## 🤝 Contributing

We welcome contributions! Please read our [CONTRIBUTING.md](CONTRIBUTING.md) (you may create one) for guidelines. For major changes, please open an issue first to discuss what you would like to change.

- Fork the repo
- Create your feature branch (`git checkout -b feature/AmazingFeature`)
- Commit your changes (`git commit -m 'Add some AmazingFeature'`)
- Push to the branch (`git push origin feature/AmazingFeature`)
- Open a Pull Request

---

## 📄 License

This project is licensed under the MIT License – see the [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgements

- **Adekunle Ajasin University (AAUA)** – Department of Yorùbá Studies, for their invaluable domain expertise and partnership.
- **Open-source community** – for the tools that make this possible.
- Our early users and testers – *E se gan-an o!* (Thank you very much!)

---

## 📬 Contact

- **Project Lead:** Oluwasanmi Titus Adebowale ([@sanmmie](https://github.com/sanmmie))
- **Email:** [your-email@example.com]  
<<<<<<< HEAD
- **Website:** [yorubagpt.netlify.app](http://yorubagpt.netlify.app)
=======
- **Website:** [ai-yoruba.web.app](http://ai-yoruba.web.app)
>>>>>>> fix/master-upgrade-v2

---

> *“Láti fi èdè àti àṣà Yorùbá ṣe èrò tuntun fún ayé.”*  
> *(Using the Yorùbá language and culture to create new innovations for the world.)*
```

---

## ✅ What Makes This README "Winning"?

1. **Vision-driven** – It immediately communicates the grand ambition ("Digital Brain of Yorùbá Civilization") and differentiates from generic competitors.
2. **Academic Credibility** – Highlights the AAUA partnership, building trust.
3. **Clear Value Proposition** – Lists real-world opportunities (education, diaspora, healthcare, etc.).
4. **Professional Formatting** – Uses badges, emojis, tables, and clear sections for readability.
5. **Complete Technical Details** – Tech stack, folder structure, environment variables, and deployment instructions are thorough, helping both users and developers.
6. **Community Focus** – Includes contribution guidelines, acknowledgements, and a call to action.
7. **Business Model Transparency** – Subscription tiers are shown, demonstrating a sustainable plan.

You can further customize the contact email, add a screenshot or logo, and link to a **CONTRIBUTING.md** and **LICENSE** file when you create them. This README will make a strong impression on visitors, potential contributors, and investors alike.

Great work so far! Let me know if you need any adjustments.
<<<<<<< HEAD
=======

>>>>>>> fix/master-upgrade-v2
