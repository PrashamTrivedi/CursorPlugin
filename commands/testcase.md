---
allowed-tools: Bash(git:*), Bash(tree:*), Bash(ls:*), Bash(grep:*), Bash(cat:*), Bash(find:*), Bash(gh:*), mcp__memory-server_*, FileSystem
description: Write and update test cases — integration-first, with mocked LLM calls and test reports
argument-hint: files | task description | github ticket id
---

# Purpose

Understand the code and requirements and write test cases for them.

## Arguments

- Task and/or Github Ticket ID: This can be mix and match, user may provide both
  task description and github ticket ID or just one of them. Or Files.

## Workflow

- You may have given any of the following in arguments.
  - Task description
  - Github Ticket ID
  - Files (file paths separated by comma)
  - May be whole codebase (if user is starting to write tests)

- Determine the language, framework and testing framework used in the project.

- If there is no testing framework, suggest one based on the language and
  framework used.
  - Start with language default test runner.
  - For JavaScript/TypeScript, suggest Vitest.

- Always prefer to write end to end tests, integration tests and unit tests in
  that order. Focus on integration tests.

- ALWAYS MOCK ANY LLM API CALLS.

- Based on the task and arguments, read relevant files.

- Check if they have any tests, or the tests are outdated.

- If they are outdated, update or write new tests.

- Make sure the test clearly convey the following. Either by name, by
  description or by comments.
  - What is being tested (The functionality, or specific part of code)
  - Why it is being tested (The intent and the requirement)
  - How it is being tested (What is real, what is mock and how the test is
    structured)

- Organise the tests modularly and make them easier to find.

- Make sure for each functionality, there is atleast one positive and one
  negative test case.

- Once you are done, run the test and check the results.

- IMPORTANT: WHILE YOU ARE WRITING THE TEST, CODE FILE IS STRICTLY READ-ONLY. IF
  YOU HAVE TO MAKE ANY CHANGE, TAKE USER PERMISSION.

- IMPORTANT: WRITE A TEST REPORT, WHICH CONTAINS,
  - Brief summary of tests being written or updated.
    - For updated reason, mention why
  - What is the current coverage and pass/fail status
  - If you are suggesting any changes in code, mention them clearly as action
    items
