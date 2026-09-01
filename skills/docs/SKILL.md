---
name: docs
description: Update documentation and changelog to reflect codebase changes
disable-model-invocation: true
---

---
allowed-tools: Bash(git:*), FileSystem, Bash(tree:*), Bash(ls:*), Bash(cat:*)
description: Update documentation and changelog to reflect codebase changes
model: composer
---

Update the documentation to reflect the changes made in the codebase.

## Arguments

- Directory Name: The name of the directory or task where `taskFindings.md` file
  is located. This is used to understand the context of the task and where to
  write the findings. This is optional, if not provided, the current directory
  is used.

## Process

- Check the codebase, run `git ls-files` and `tree` commands to understand the
  context of the codebase and its directory structure.

- Check the documentation files. And compare the changes against the latest
  code.

- If you find any changes in the codebase that are not reflected in the
  documentation, update the documentation accordingly.

- Check the changelog file, if available, and update it with the changes made in
  the codebase. If the changelog file is not present, create a new one. The
  changelog file is addressed to the end users and other contributors, so it
  should be written in a way that is easy to understand and follow.

- UPDATE changelog to include changes between given tag/commit and latest tag.
  Make sure we follow reverse chronological order. Each tag should be their own
  h2 header and under the tag, we list the changes made since given tag. If
  there is no given tag, consider the changelog against the latest master
  commit. And keep them under Unreleased h2 header.

<FormatOfChangeLog>
Under each h2 header, we can have the following sections:

## [Unreleased OR tag]

### Added

### Changed

### Deprecated

### Removed

### Fixed

### Security

</FormatOfChangeLog>

UPDATE readme consisely, in max two statements, to reflect those changes for the
first time visitor.
