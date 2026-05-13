# Omeka S Playground PR Preview Action

A GitHub Action that automatically posts or updates a sticky pull request comment containing a preview link to [Omeka S Playground](https://ateeducacion.github.io/omeka-s-playground/) for a module or theme ZIP.

It generates a base64url-encoded `blueprint-data` payload compatible with the Omeka S Playground blueprint schema, so the PR comment opens a ready-to-test browser preview of the addon under review.

## Usage

### Preview a module ZIP from the PR branch

```yaml
- name: Add Omeka S Playground preview
  uses: ateeducacion/action-omeka-s-playground-pr-preview@v1
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    zip-url: https://github.com/${{ github.repository }}/archive/refs/heads/${{ github.head_ref }}.zip
    addon-name: MyModule
    addon-type: module
    title: My Module PR Preview
    description: Preview this PR in Omeka S Playground
```

> `addon-name` is strongly recommended when `zip-url` points to a GitHub archive ZIP because Omeka S Playground requires an explicit addon name for remote modules and themes.

### Preview a theme ZIP

```yaml
- name: Add Omeka S Playground preview
  uses: ateeducacion/action-omeka-s-playground-pr-preview@v1
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    zip-url: https://github.com/${{ github.repository }}/archive/refs/heads/${{ github.head_ref }}.zip
    addon-name: MyTheme
    addon-type: theme
    landing-page: /s/demo
    site-json: >-
      {"title":"Demo Site","slug":"demo","theme":"MyTheme","setAsDefault":true}
```

### Add extra modules, users, items, and site configuration

```yaml
- name: Add Omeka S Playground preview
  uses: ateeducacion/action-omeka-s-playground-pr-preview@v1
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    zip-url: https://github.com/${{ github.repository }}/releases/download/pr-preview/MyModule.zip
    addon-name: MyModule
    extra-modules: >-
      ["CSVImport",{"name":"NumericDataTypes","state":"install","source":{"type":"omeka.org","slug":"numeric-data-types"}}]
    users-json: >-
      [{"username":"admin","email":"admin@example.com","password":"password","role":"global_admin"}]
    item-sets-json: >-
      [{"title":"Demo Collection"}]
    items-json: >-
      [{"title":"Landscape sample","itemSets":["Demo Collection"],"media":[{"type":"url","url":"https://example.com/photo.jpg","title":"Photo"}]}]
    site-json: >-
      {"title":"Demo Site","slug":"demo","theme":"default","setAsDefault":true}
    login-email: admin@example.com
    login-password: password
```

### Advanced blueprint override

```yaml
- name: Add Omeka S Playground preview
  uses: ateeducacion/action-omeka-s-playground-pr-preview@v1
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    zip-url: https://github.com/${{ github.repository }}/archive/refs/heads/${{ github.head_ref }}.zip
    addon-name: MyModule
    site-title: Omeka Playground Demo
    site-locale: es
    site-timezone: Atlantic/Canary
    blueprint-json: >-
      {"themes":[{"name":"Foundation","source":{"type":"omeka.org","slug":"foundation-s"}}],
       "site":{"title":"Demo Site","slug":"demo","theme":"Foundation","setAsDefault":true},
       "debug":{"enabled":true}}
```

## Inputs

| Input | Required | Default | Description |
|---|---|---|---|
| `github-token` | ✅ | — | GitHub token with `pull-requests: write` permission |
| `zip-url` | ✅ | — | URL of the primary module or theme ZIP file |
| `mode` | ❌ | `comment` | How to publish the preview: `comment` (sticky PR comment) or `append-to-description` (managed block inside the PR body) |
| `addon-name` | ❌ | inferred from `zip-url` when possible | Explicit Omeka addon name for the primary ZIP |
| `addon-type` | ❌ | `module` | Primary addon type: `module` or `theme` |
| `addon-state` | ❌ | `activate` | State for the primary module (`install` or `activate`). Ignored for themes |
| `title` | ❌ | `PR Preview` | Blueprint meta title |
| `description` | ❌ | `Preview this PR in Omeka S Playground` | Blueprint meta description |
| `author` | ❌ | `ateeducacion` | Blueprint meta author |
| `playground-url` | ❌ | `https://ateeducacion.github.io/omeka-s-playground/` | Base URL of the Omeka S Playground |
| `image-url` | ❌ | Omeka S Playground `ogimage.png` | URL of the image shown in the PR comment |
| `comment-marker` | ❌ | `omeka-s-playground-preview` | Hidden marker used to update the same sticky comment, and as the base for the `:start`/`:end` markers in description mode |
| `extra-text` | ❌ | — | Optional text/HTML appended after the preview (useful for testing instructions) |
| `restore-button-if-removed` | ❌ | `true` | In `append-to-description` mode, restore the preview block if the PR author removed it |
| `pr-number` | ❌ | *(from event)* | Pull request number override. Required when triggered from a `workflow_run`; otherwise read from the `pull_request` event payload |
| `extra-modules` | ❌ | — | JSON array of additional blueprint `modules` entries |
| `extra-themes` | ❌ | — | JSON array of additional blueprint `themes` entries |
| `users-json` | ❌ | — | JSON array assigned to blueprint `users` |
| `item-sets-json` | ❌ | — | JSON array assigned to blueprint `itemSets` |
| `items-json` | ❌ | — | JSON array assigned to blueprint `items` |
| `site-json` | ❌ | — | JSON object assigned to blueprint `site` |
| `landing-page` | ❌ | — | Blueprint `landingPage` value |
| `debug-enabled` | ❌ | — | Boolean-like value (`true`/`false`, `on`/`off`, `1`/`0`) for `debug.enabled` |
| `site-title` | ❌ | — | Blueprint `siteOptions.title` value |
| `site-locale` | ❌ | — | Blueprint `siteOptions.locale` value |
| `site-timezone` | ❌ | — | Blueprint `siteOptions.timezone` value |
| `login-email` | ❌ | — | Blueprint `login.email` value |
| `login-password` | ❌ | — | Blueprint `login.password` value |
| `blueprint-json` | ❌ | — | JSON object merged last into the generated blueprint |

Legacy compatibility aliases still accepted:

- `extra-plugins` → `extra-modules`
- `login-username` → `login-email`

## Outputs

| Output | Description |
|---|---|
| `preview-url` | The full Omeka S Playground preview URL |
| `mode` | Effective publishing mode used (`comment` or `append-to-description`) |
| `comment-id` | ID of the managed preview comment in `comment` mode (empty otherwise) |
| `rendered-description` | Managed description block rendered in `append-to-description` mode (empty otherwise) |

## Required Workflow Permissions

The calling workflow must grant write access to pull requests:

```yaml
permissions:
  contents: read
  pull-requests: write
```

## Example Workflow

```yaml
name: PR Preview

on:
  pull_request:
    types: [opened, synchronize, reopened, edited]

permissions:
  contents: read
  pull-requests: write

jobs:
  preview:
    runs-on: ubuntu-latest
    steps:
      - name: Add Omeka S Playground preview
        uses: ateeducacion/action-omeka-s-playground-pr-preview@v1
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          zip-url: https://github.com/${{ github.repository }}/archive/refs/heads/${{ github.head_ref }}.zip
          addon-name: MyModule
          extra-modules: '["CSVImport"]'
          site-locale: es
          site-timezone: Atlantic/Canary
```

## How It Works

1. **Blueprint generation** — The action builds an Omeka S Playground blueprint from the provided inputs. The primary `zip-url` becomes either a `modules` or `themes` entry, depending on `addon-type`.

   Minimal example:

   ```json
   {
     "$schema": "https://ateeducacion.github.io/omeka-s-playground/assets/blueprints/blueprint-schema.json",
     "meta": {
       "title": "My Module PR Preview",
       "author": "ateeducacion",
       "description": "Preview this PR in Omeka S Playground"
     },
     "modules": [
       {
         "name": "MyModule",
         "state": "activate",
         "source": {
           "type": "url",
           "url": "https://github.com/OWNER/REPO/archive/refs/heads/BRANCH.zip"
         }
       }
     ]
   }
   ```

   Optional inputs extend the blueprint only when present, for example:

   ```json
   {
     "$schema": "https://ateeducacion.github.io/omeka-s-playground/assets/blueprints/blueprint-schema.json",
     "meta": {
       "title": "My Module PR Preview",
       "author": "ateeducacion",
       "description": "Preview this PR in Omeka S Playground"
     },
     "modules": [
       {
         "name": "MyModule",
         "state": "activate",
         "source": {
           "type": "url",
           "url": "https://github.com/OWNER/REPO/archive/refs/heads/BRANCH.zip"
         }
       },
       "CSVImport"
     ],
     "themes": [
       {
         "name": "Foundation",
         "source": {
           "type": "omeka.org",
           "slug": "foundation-s"
         }
       }
     ],
     "landingPage": "/s/demo",
     "debug": {
       "enabled": true
     },
     "siteOptions": {
       "title": "Omeka Playground Demo",
       "locale": "es",
       "timezone": "Atlantic/Canary"
     },
     "login": {
       "email": "admin@example.com",
       "password": "password"
     },
     "site": {
       "title": "Demo Site",
       "slug": "demo",
       "theme": "Foundation",
       "setAsDefault": true
     }
   }
   ```

   The action deduplicates `modules` and `themes` by addon name where possible, safely parses JSON inputs, and applies `blueprint-json` last as the final override layer.

2. **Base64url encoding** — The blueprint JSON is encoded as [base64url](https://datatracker.ietf.org/doc/html/rfc4648#section-5) (RFC 4648 §5), replacing `+` with `-`, `/` with `_`, and removing trailing `=`.

3. **Preview URL** — The encoded blueprint is appended as the `blueprint-data` query parameter:

   ```text
   https://ateeducacion.github.io/omeka-s-playground/?blueprint-data=ENCODED_BLUEPRINT
   ```

4. **Sticky comment** — The action searches existing PR comments for a hidden HTML marker (`<!-- omeka-s-playground-preview -->`). If found, it updates that comment; otherwise it creates a new one.

## Development

### Prerequisites

- Node.js 20+
- npm

### Install dependencies

```bash
npm install
```

### Build

```bash
npm run build
```

This bundles `index.js` and its dependencies into `dist/index.cjs` using [esbuild](https://esbuild.github.io/).

> **Note:** Always commit the updated `dist/index.cjs` after making changes to `index.js`.

### Test

```bash
npm test
```
