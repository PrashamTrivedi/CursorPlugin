---
name: onboarding
description: Create comprehensive onboarding documentation for new developers
disable-model-invocation: true
---

---
allowed-tools: Bash(git:*), Bash(tree:*), Bash(ls:*), FileSystem, Bash(npm:*), Bash(yarn:*), Bash(cat:*), Jina
description: Create comprehensive onboarding documentation for new developers
---

Onboard a new developer or agent to the given codebase and create an onboarding
document for future reference.

## Arguments

- Directory Name: Directory name, default to current directory.
- File name: `onboarding.md` on directory root as default.
- Competency: The expected competency level of the developer in technology.

## Process

- Run `git ls-files` to understand the context of the project in terms of git
  files.

- Run `tree` with appropriate arguments to understand the directory structure of
  the project.

- Understand the dependency file (like package.json, requirements.txt, go.mod
  etc.) to understand the entrypoints, dependencies and versions, common scripts
  used in the project. For monorepos, do it for each subdirectory.

- If the project uses makefile, read the makefile to understand the common
  commands used in the project.

- Start with the entrypoint file from the dependency file and read the code to
  understand the flow of the codebase.

- If the codebase is too large, focus on main entrypoint files, and logical
  modules of the codebase.

- If the codebase is on newer versions of tools and dependencies, search online
  for the latest documentation and best practices.

- Understand the codebase, coding standards, conventions, practices. And find
  out any other gotchas, tricky parts of the codebase.

- Understand the user and systems journey from start to end (or terminal state)

- Understand and plot the logical flow of the codebase, how the modules interact
  with each other, and how the data flows through the codebase.

- Map these user and system journeys to the logical flow of the codebase.

- Write a comprehensive onboarding document, for the developer to understand the
  codebase, how to run it, how to test it, how to deploy it, and how to
  contribute to it. Including all the conventions, coding standards, gotchas,
  tricky parts, and best practices.

- Write down the flows and journeys in the onboarding document.

- Arrange the document in logical order, easy to read and grasp by the developer
  with minimal mental overhead.

- Link relevant files, directories, and code snippets in the onboarding document
  for easy reference.

- Write the onboarding document in the given file name, in the given directory.
