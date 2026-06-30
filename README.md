# 🐟 Blue Catfish Invasion - AI Presentation

An interactive AI-powered presentation about the Blue Catfish invasion in the Chesapeake Bay. Features professor-style voice narration, adaptive learning with confusion detection, and motion graphics.

![Presentation Preview](https://via.placeholder.com/800x400?text=Blue+Catfish+AI+Presentation)

## ✨ Features

### 🎙️ AI Voice Narration
- **Professor-style narration** by Professor Marine
- **Web Speech API** for text-to-speech
- **Voicebox integration** (optional - for enhanced AI voices)
- Adjustable speech speed (0.7x, 0.85x, 1.0x)

### 🎓 Adaptive Learning
- **"I'm Confused" button** on each slide
- Multi-level explanations:
  - Simple explanations with analogies
  - Detailed scientific explanations
  - Key vocabulary terms
  - Real-world examples
- Tracks which sections the learner found confusing

### 🎨 Interactive Design
- **Motion graphics** with swimming fish animations
- **Floating bubbles** effect
- **Interactive hover effects** on all elements
- Progress indicator
- Smooth slide transitions

### 💬 AI Chat
- Ask questions to Professor Marine
- Get answers based on lecture content

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ installed
- npm or yarn package manager

### Installation

1. **Download/Clone the project**
   ```bash
   git clone <your-repo-url>
   cd bluecatfish-presentation
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start the development server**
   ```bash
   npm run dev
   ```

4. **Open in browser**
   ```
   http://localhost:3000/presentation
   ```

### Alternative: Use ZSH Script
Run this one-liner to start everything:
```bash
npm install && npm run dev
```

## 📱 How to Use

### Starting the Presentation
1. Click **"Start Class"** on the intro screen
2. Click the **Play ▶️ button** to hear narration
3. Use **Previous/Next** buttons or dots to navigate

### Audio Not Working?
1. Click anywhere on the page first (required for Web Speech API)
2. Click the **Play ▶️ button** in the header
3. Allow audio permissions if prompted
4. Try Chrome for best compatibility (Firefox has limited Web Speech support)

### I'm Confused Feature
1. Scroll to bottom of any slide
2. Click **"I'm Confused - Explain This"** button
3. View breakdown with:
   - Simple explanation
   - Key terms
   - Real-world example
4. Click **"Show More Details"** for scientific explanation

## 🎨 Project Structure

```
bluecatfish-presentation/
├── app/
│   ├── presentation/
│   │   └── page.tsx          # Main presentation component
│   ├── layout.tsx             # App layout
│   └── globals.css            # Global styles
├── public/
│   └── images/                # SVG images
├── package.json               # Dependencies
├── next.config.ts            # Next.js config
└── tsconfig.json              # TypeScript config
```

## 🛠️ Tech Stack

- **Next.js 16** - React framework
- **React 19** - UI library
- **TypeScript** - Type safety
- **Tailwind CSS** - Styling
- **Web Speech API** - Voice narration
- **Framer Motion concepts** - Animations (via CSS)

## 🎙️ Voicebox Integration (Optional)

Voicebox provides more natural AI voices. To enable:

1. Download **Voicebox** from [voicebox.sh](https://github.com/jamiepine/voicebox)
2. Run Voicebox on your computer (port 17493)
3. The presentation will auto-detect and use it

If Voicebox is not running, it falls back to Web Speech API.

## 🔧 Troubleshooting

### Blank Page
```bash
rm -rf .next
npm run build
npm run dev
```

### Port Already in Use
```bash
# Kill existing process
pkill -f "next"

# Or use a different port
npm run dev -p 3001
```

### Audio Not Playing
- Web Speech API requires user interaction first
- Try clicking the page then the play button
- Chrome recommended for best audio support

## 📚 Content Overview

The presentation covers 5 topics:

1. **A New Predator Arrives** - History of introduction
2. **Explosive Growth** - Population statistics
3. **Eating Everything** - Ecological impact
4. **No Natural Enemies** - Why they're successful
5. **A Delicious Solution** - Commercial harvesting

## 📄 License

This project is for educational purposes.

## 🙏 Credits

- Content based on [UMD Extension Factsheet](https://extension.umd.edu/resource/chesapeake-bay-blue-catfish-invasive-delicious-and-nutritious/)
- Created with Next.js, React, and Tailwind CSS

---

**Professor Marine says: "Learning about ecology can be fun - especially when the solution is on your dinner plate!" 🐟**
