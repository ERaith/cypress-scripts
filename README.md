# Cypress Unused Steps Finder

A utility to identify unused step definitions in your Cypress Cucumber/Gherkin test suite.

## Overview

This tool scans your Cypress step definition files and feature files to identify step definitions that are defined but never used in any feature file. This helps keep your test codebase clean and maintainable.

## Features

- Supports Cucumber Expressions (e.g., `"I do {int} things"`)
- Supports regex patterns (e.g., `/^I click (.+)$/i`)
- Handles common parameter types: `{int}`, `{float}`, `{word}`, `{string}`, `{uuid}`, etc.
- Configurable via environment variables
- Clear reporting of unused steps

## Installation

```bash
npm install
```

## Usage

### Basic Usage

```bash
node find-unused.mjs
```

### With Custom Paths

Use environment variables to customize the search paths:

```bash
STEP_GLOB="cypress/e2e/**/*.steps.{js,ts}" FEATURE_GLOB="cypress/e2e/**/*.feature" node find-unused.mjs
```

### As a Package Script

```bash
npm start
```

### As a Global Command (after npm link or install)

```bash
find-unused-steps
```

## Configuration

The tool uses the following environment variables:

- `STEP_GLOB` - Glob pattern for step definition files (default: `"cypress/e2e/**/*.steps.{js,ts}"`)
- `FEATURE_GLOB` - Glob pattern for feature files (default: `"cypress/e2e/**/*.feature"`)

## Output Example

```
== Step Usage Summary ==
Step files: 15
Feature files: 42
Total step defs (parsed): 87
Unused (parsed): 3
Unparsed (skipped due to variables/indirection): 2

== UNUSED STEP DEFINITIONS ==
• cypress/e2e/common.steps.js  —  "I wait for {int} seconds"
• cypress/e2e/login.steps.js  —  /^I login as (.+)$/
• cypress/e2e/navigation.steps.js  —  "I navigate to the {word} page"
```

## Supported Step Definition Formats

The tool recognizes step definitions in these formats:

```javascript
// Cucumber Expressions (string literals)
Given("I do {int} things", () => {});
When('I click {word}', () => {});

// Template literals
Then(`I see {string}`, () => {});

// Regex patterns
Given(/^I have (\d+) items$/, () => {});
```

## Limitations

- Only static patterns are analyzed (dynamic patterns from variables are skipped)
- Custom parameter types must be added to the `cucumberExprToRegex` function
- Doc strings and data tables are not considered in matching

## License

MIT

## Author

Erik Raith

## Repository

https://github.com/ERaith/cypress-scripts
