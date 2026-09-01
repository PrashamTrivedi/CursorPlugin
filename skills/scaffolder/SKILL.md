---
name: scaffolder
description: Autonomous project scaffolding with framework-specific templates and best practices. Auto-applies when user mentions creating projects, frameworks (Hono, Next.js, CDK), or says "create", "scaffold", "initialize", "setup", "new project". Handles complete project setup from git init to deployment-ready structure.
allowed-tools: Bash, Write, Read, Grep, Glob, MultiEdit, mcp__jina__read_webpage, mcp__jina__search_web, mcp__cloudflare-docs__search_cloudflare_documentation
---


## Instructions

### Step 1: Understand Requirements

Ask clarifying questions if not specified:

1. **Framework**: Which framework? (Hono, Next.js, CDK, etc.)
2. **Platform**: Where will it run? (Cloudflare Workers, AWS Lambda, Vercel, etc.)
3. **Database**: Need database? (Postgres, D1, DynamoDB, none)
4. **Auth**: Need authentication? (Yes/No)
5. **Project name**: What to call the project?

### Step 2: Initialize Git Repository

*Note:* In most of the cases you are in project directory, you may want to confirm it with user. 

```bash
# Initialize git
git init

# Create .gitignore (framework-specific)
```



### Step 3: Scaffold Framework

- Based on the requirement, create the project with default tools using relevant CLIs
- Always include latest versions
- Add a testing framework, for nodejs and typescript project, prefer vitest with relevant plugins unless specified.
- Create Github Action that runs the test case with coverage and reports it.

### Step 4: Add Environment Configuration

- Create `.env.example` or `.dev.vars.example` with relevant and required environment variables
- If you are creating some hashes or encryption keys, create an important section in readme so anybody who checks out the project can create values for themselves
- Create `.env` or `.dev.vars` by copying releant example file and work with user to fill out the values


### Step 5: Configure Package Scripts

- Add useful scripts to `package.json` which includes dev, build, test without watch. 
- Make sure this scripts are default for AI agents, add human level scripts if required with `:watch` suffix

### Step 6: Add Testing Setup

- Create proper testing setup

### Step 7: Add Linting & Formatting

- Add proper linting and formatting.
### Step 8: Create README.md and Documentations

- Generate framework-specific README:
- Create modern, platform native swagger. 
- Create a script that exposes local and online environment as postman collection and postman environment files.

### Step 9: Initial Commit

```bash
git add .
git commit -m "🎉 chore: Initial project scaffold"
```

### Step 10: Guide Next Steps

Print helpful next steps:

```
✅ Project scaffolded successfully!

📁 Project: <project-name>
🛠️  Framework: <framework>
📦 Dependencies: Installed

Next Steps:
1. cd <project-name>
2. Update .env with your configuration
3. Run: npm run dev
4. Start building!

Optional:
- Create GitHub repository: gh repo create <project-name> --public
- Push code: git remote add origin <url> && git push -u origin main
- Deploy to Cloudflare: npm run deploy (if applicable)

Happy coding! 🚀
```

### Step 11: Github Push

Work with user to create a github repository, ask if they want to create a private repo or not
