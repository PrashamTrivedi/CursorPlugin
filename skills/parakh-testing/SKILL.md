---
name: parakh-testing
description: End to end API testing to be done with Parakh MCP server. Checks and keeps API definitions up-to-date in Parakh MCP Servers, runs the tests against it and works with results as API Evidences. Proactively use it when user mentions 'API Testing', 'Backend API contract testing' or similar words.
allowed-tools: Bash, Write, Read, Edit, MultiEdit, Grep, Glob, Task, mcp__parakh__*
hooks:
  PreToolUse:
    - matcher: "mcp__parakh__run_test"
      hooks:
        - type: command
          command: sh
          args:
            - "-c"
            - |
              payload=$(cat)
              if command -v jq >/dev/null 2>&1; then
                code=$(printf '%s' "$payload" | jq -r '.tool_input.testCode // ""')
              else
                code=$payload
              fi
              case "$code" in
                *localhost*|*127.0.0.1*|*0.0.0.0*)
                  echo 'Parakh evidence must be captured against a deployed API, not localhost. Point testCode at the deployed base URL and run again.' >&2
                  exit 2 ;;
              esac
              exit 0
---

# Parakh Testing

## About Parakh

Parakh is an MCP server that takes the APIs, and can run an arbitrary code against it and saves the code execution as evidence to be presented later

## Workflow

- Check and verify Parakh MCP server is installed and ready to use. The MCP server is on `https://parakh.prashamhtrivedi.app/mcp`
- Understand all the tools offered by it.
- Make sure it is running against a deployed API and not localhost.
- Find or create the spec:
  1. Call `get_spec()` to list all saved specs
  2. Call `list_endpoints` on each to find one whose `baseUrl` matches the target API (e.g. `https://beta-siteinspection.prashamhtrivedi.app`)
  3. If a matching spec exists: call `update_spec` on it to refresh from the API docs URL
  4. If no match: call `save_spec` with the API docs URL to create one
  5. Check `manage_credentials` on the chosen spec — reuse existing credentials, don't recreate them
- Confirm the endpoints 
- Design the tests to run
  - Make sure those tests covers everything according to the feature.
- Run the tests
- Save the results.

## Designing the tests.

- This skill is invoked to test a feature end to end. And you are most likely to have the feature understanding or walkThrough. Understand it, and design thorough test cases for it.

- First think in plaintext about what tests you will write to test the given feature. 

- Those tests cases will be used as an evidence, so those tests will contain writing the data and then calling some GET apis to confirm the data writings step by step.

- Call that plaintext thoughts as test plans.

- Then based on plans, create the tests to call `run_test` tool.

## Saving the results

- You will save the test results in `testEvidence.md` in a directory. 
  - If you are working against a task, and have relevant `taskNotes` directory. save the test evidence there.

- Format of `testEvidence.md` should be as follows.
- ```markdown
  # Test evidence document
   One liner description of what you are testing
  
  ## Test Plan
  The plaintext test plan here

  ## Test Code
  
  The test code, which is used as input of `run_test` tool

  ## Evidence

  The Evidence of `get_result`. With evidence id to trace it back to Parakh Run. For single API, it should have curl with body and result. Save this verbatim, including server urls and IDs. Only obfuscate API Keys, passwords and tokens. 

  ## Summarry 
  A tabular summarry of the evidence.
  ```

- If you are running against a `taskWalkthrough.md` file. Save the testEvidence.md file alongside taskWalkThrough.md and then link the evidence to walkThrough file.
