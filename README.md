# ❄️ Snow Hub

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Electron](https://img.shields.io/badge/Electron-v39.x-blue.svg)](https://www.electronjs.org/)
[![React](https://img.shields.io/badge/React-v19.x-61DAFB.svg)](https://reactjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-v5.x-3178C6.svg)](https://www.typescriptlang.org/)

**Snow Hub** is a powerful desktop workstation designed specifically for ServiceNow developers. Built on Electron, it provides a unified interface to manage multiple ServiceNow instances with deep integration of powerful developer tools.

## ✨ Features

- 🏢 **Multi-Instance Management**: Connect and manage multiple ServiceNow environments simultaneously.
- 🛠️ **Seamless SN Utils Integration**: Full support for SN Utils features, including background scripts, settings, and popups.
- 📑 **Tabbed Browsing**: Efficiently manage multiple tabs per instance, just like in a professional IDE.
- 🚀 **Desktop Shortcuts**: Create native desktop shortcuts to launch specific instances directly.
- 📥 **System Tray Access**: Keep the application running in the background for quick access from the tray.
- 🎨 **Modern Interface**: Clean and professional UI built with React and Tailwind CSS.
- 🔍 **Smart Search**: Rapidly find records and navigate between instances (Custom SN Hub feature).

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (Recommended version 18 or higher)
- [npm](https://www.npmjs.com/) (Included with Node.js)

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/kaiserdj/SNOW-HUB.git
   cd SNOW-HUB
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Run the application in development mode:
   ```bash
   npm run dev
   ```

### 🏗️ Building for Production

To create a production executable for your platform:

```bash
# For Windows
npm run build:win

# For macOS
npm run build:mac

# For Linux
npm run build:linux
```

The output will be available in the `dist` folder.

## 🛠️ Technology Stack

- **Core**: [Electron](https://www.electronjs.org/)
- **Frontend**: [React 19](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
- **Build Tool**: [Vite](https://vitejs.dev/) with [electron-vite](https://electron-vite.org/)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/)
- **Storage**: [electron-store](https://github.com/sindresorhus/electron-store)
- **Components**: [Radix UI](https://www.radix-ui.com/) & [Lucide Icons](https://lucide.dev/)

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **[SN Utils](https://arnoudkooi.com/)**: This project integrates the incredible [SN Utils](https://github.com/arnoudkooi/ServiceNow-Utils) extension created by **Arnoud Kooi**. All credits for the extension logic and features go to him.
- **ServiceNow**: For providing the platform that makes this tool necessary and useful.

---

Crafted with ❤️ for the ServiceNow Developer Community.
