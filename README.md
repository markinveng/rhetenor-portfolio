# Astro Starter Kit: Basics

## Node.js version

This project requires Node.js `>= 22.12.0` (Astro v6).

### macOS upgrade (recommended: nvm)

1. Install nvm

```sh
brew install nvm
mkdir -p ~/.nvm
```

Add this to your `~/.zshrc`:

```sh
export NVM_DIR="$HOME/.nvm"
source "$(brew --prefix nvm)/nvm.sh"
```

Restart your terminal, then:

```sh
nvm install 22.12.0
nvm use 22.12.0
nvm alias default 22.12.0
node -v
```

2. Install deps and run

```sh
npm install
npm run dev
```

### Alternatives

- Volta:

```sh
brew install volta
volta install node@22.12.0
node -v
```

- Homebrew (if you don't need per-project switching):

```sh
brew install node@22
brew link --overwrite --force node@22
node -v
```

```sh
npm create astro@latest -- --template basics
```

> 🧑‍🚀 **Seasoned astronaut?** Delete this file. Have fun!

## 🚀 Project Structure

Inside of your Astro project, you'll see the following folders and files:

```text
/
├── public/
│   └── favicon.svg
├── src
│   ├── assets
│   │   └── astro.svg
│   ├── components
│   │   └── Welcome.astro
│   ├── layouts
│   │   └── Layout.astro
│   └── pages
│       └── index.astro
└── package.json
```

To learn more about the folder structure of an Astro project, refer to [our guide on project structure](https://docs.astro.build/en/basics/project-structure/).

## 🧞 Commands

All commands are run from the root of the project, from a terminal:

| Command                   | Action                                           |
| :------------------------ | :----------------------------------------------- |
| `npm install`             | Installs dependencies                            |
| `npm run dev`             | Starts local dev server at `localhost:4321`      |
| `npm run build`           | Build your production site to `./dist/`          |
| `npm run preview`         | Preview your build locally, before deploying     |
| `npm run astro ...`       | Run CLI commands like `astro add`, `astro check` |
| `npm run astro -- --help` | Get help using the Astro CLI                     |

## 👀 Want to learn more?

Feel free to check [our documentation](https://docs.astro.build) or jump into our [Discord server](https://astro.build/chat).
