/**
 * Encodes a string as base64url (RFC 4648 §5).
 * Replaces `+` with `-`, `/` with `_`, and strips trailing `=`.
 * @param {string} str
 * @returns {string}
 */
export function toBase64Url(str) {
  const b64 = Buffer.from(str, 'utf8').toString('base64');
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

const OMEKA_BLUEPRINT_SCHEMA_URL =
  'https://ateeducacion.github.io/omeka-s-playground/assets/blueprints/blueprint-schema.json';

/**
 * Parses an optional JSON action input.
 * @param {string} name
 * @param {string} value
 * @param {'array' | 'object'} expectedType
 * @returns {object | Array | undefined}
 */
export function parseJsonInput(name, value, expectedType) {
  if (!value || !value.trim()) {
    return undefined;
  }

  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch (error) {
    throw new Error(`Invalid JSON for "${name}": ${error.message}`);
  }

  if (expectedType === 'array' && !Array.isArray(parsed)) {
    throw new Error(`Input "${name}" must be a JSON array.`);
  }

  if (expectedType === 'object' && !isPlainObject(parsed)) {
    throw new Error(`Input "${name}" must be a JSON object.`);
  }

  return parsed;
}

/**
 * Parses an optional boolean action input.
 * @param {string} value
 * @param {string} name
 * @returns {boolean | undefined}
 */
export function parseOptionalBoolean(value, name) {
  if (!value || !value.trim()) {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(normalized)) {
    return true;
  }

  if (['false', '0', 'no', 'off'].includes(normalized)) {
    return false;
  }

  throw new Error(
    `Input "${name}" must be a boolean value such as "true" or "false".`
  );
}

function inferAddonNameFromZipUrl(zipUrl) {
  try {
    const url = new URL(zipUrl);
    const segments = url.pathname.split('/').filter(Boolean);

    if (
      ['github.com', 'www.github.com', 'codeload.github.com'].includes(
        url.hostname
      ) &&
      segments.length >= 2 &&
      (segments.includes('archive') || segments.includes('zip'))
    ) {
      return decodeURIComponent(segments[1]).trim();
    }

    const fileName = decodeURIComponent(segments.at(-1) || '')
      .replace(/\.zip$/iu, '')
      .trim();
    return fileName || undefined;
  } catch {
    return undefined;
  }
}

function normalizeAddonEntry(addon, name) {
  if (typeof addon === 'string') {
    const normalized = addon.trim();
    if (!normalized) {
      throw new Error(`Each entry in "${name}" must not be empty.`);
    }
    return normalized;
  }

  if (!isPlainObject(addon)) {
    throw new Error(
      `Each entry in "${name}" must be either a string or an object.`
    );
  }

  const addonName = typeof addon.name === 'string' ? addon.name.trim() : '';
  if (!addonName) {
    throw new Error(
      `Each object entry in "${name}" must include a non-empty "name".`
    );
  }

  const normalized = {
    ...addon,
    name: addonName,
  };

  if ('state' in normalized) {
    if (typeof normalized.state !== 'string' || !normalized.state.trim()) {
      throw new Error(`Each object entry in "${name}" must have a valid "state".`);
    }
    normalized.state = normalized.state.trim();
  }

  if ('source' in normalized) {
    if (!isPlainObject(normalized.source)) {
      throw new Error(`Each object entry in "${name}" must have a valid "source".`);
    }

    normalized.source = { ...normalized.source };
    for (const key of ['type', 'url', 'slug']) {
      if (typeof normalized.source[key] === 'string') {
        normalized.source[key] = normalized.source[key].trim();
      }
    }
  }

  return normalized;
}

function dedupeAddons(addons, name) {
  const deduped = [];
  const seen = new Set();

  for (const addon of addons) {
    const normalized = normalizeAddonEntry(addon, name);
    const key =
      typeof normalized === 'string'
        ? `string:${normalized.toLowerCase()}`
        : `name:${normalized.name.toLowerCase()}`;

    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(normalized);
    }
  }

  return deduped;
}

function buildPrimaryAddon(zipUrl, addonName, addonType, addonState) {
  const type = String(addonType || 'module')
    .trim()
    .toLowerCase();

  if (!['module', 'theme'].includes(type)) {
    throw new Error('Input "addon-type" must be either "module" or "theme".');
  }

  const resolvedAddonName =
    (typeof addonName === 'string' && addonName.trim()) ||
    inferAddonNameFromZipUrl(zipUrl);

  if (!resolvedAddonName) {
    throw new Error(
      'Input "addon-name" is required when the addon name cannot be inferred from "zip-url".'
    );
  }

  if (type === 'theme') {
    return {
      collection: 'themes',
      entry: {
        name: resolvedAddonName,
        source: {
          type: 'url',
          url: zipUrl,
        },
      },
    };
  }

  const normalizedState = String(addonState || 'activate')
    .trim()
    .toLowerCase();
  if (!['install', 'activate'].includes(normalizedState)) {
    throw new Error(
      'Input "addon-state" must be either "install" or "activate".'
    );
  }

  return {
    collection: 'modules',
    entry: {
      name: resolvedAddonName,
      state: normalizedState,
      source: {
        type: 'url',
        url: zipUrl,
      },
    },
  };
}

function mergeBlueprint(baseValue, overrideValue) {
  if (overrideValue === undefined) {
    return baseValue;
  }

  if (Array.isArray(overrideValue)) {
    return overrideValue;
  }

  if (isPlainObject(baseValue) && isPlainObject(overrideValue)) {
    const merged = { ...baseValue };

    for (const [key, value] of Object.entries(overrideValue)) {
      merged[key] = mergeBlueprint(baseValue[key], value);
    }

    return merged;
  }

  return overrideValue;
}

/**
 * Builds the blueprint JSON object from action inputs.
 * @param {string} zipUrl
 * @param {string} title
 * @param {string} author
 * @param {string} description
 * @param {object} [options]
 * @returns {object}
 */
export function buildBlueprint(
  zipUrl,
  title,
  author,
  description,
  options = {}
) {
  const {
    addonName,
    addonType = 'module',
    addonState,
    extraModules = [],
    extraThemes = [],
    users,
    itemSets,
    items,
    site,
    landingPage,
    debugEnabled,
    siteTitle,
    siteLocale,
    siteTimezone,
    loginEmail,
    loginPassword,
    blueprintOverride,
  } = options;

  const blueprint = {
    $schema: OMEKA_BLUEPRINT_SCHEMA_URL,
    meta: {
      title,
      author,
      description,
    },
  };

  const primaryAddon = buildPrimaryAddon(zipUrl, addonName, addonType, addonState);
  blueprint[primaryAddon.collection] = [primaryAddon.entry];

  if (extraModules.length > 0) {
    blueprint.modules = dedupeAddons(
      [...(blueprint.modules || []), ...extraModules],
      'extra-modules'
    );
  }

  if (extraThemes.length > 0) {
    blueprint.themes = dedupeAddons(
      [...(blueprint.themes || []), ...extraThemes],
      'extra-themes'
    );
  }

  if (landingPage) {
    blueprint.landingPage = landingPage;
  }

  if (debugEnabled !== undefined) {
    blueprint.debug = { enabled: debugEnabled };
  }

  const siteOptions = {};
  if (siteTitle) {
    siteOptions.title = siteTitle;
  }
  if (siteLocale) {
    siteOptions.locale = siteLocale;
  }
  if (siteTimezone) {
    siteOptions.timezone = siteTimezone;
  }
  if (Object.keys(siteOptions).length > 0) {
    blueprint.siteOptions = siteOptions;
  }

  const login = {};
  if (loginEmail) {
    login.email = loginEmail;
  }
  if (loginPassword) {
    login.password = loginPassword;
  }
  if (Object.keys(login).length > 0) {
    blueprint.login = login;
  }

  if (users) {
    blueprint.users = users;
  }

  if (itemSets) {
    blueprint.itemSets = itemSets;
  }

  if (items) {
    blueprint.items = items;
  }

  if (site) {
    blueprint.site = site;
  }

  const mergedBlueprint = mergeBlueprint(blueprint, blueprintOverride);

  if (Array.isArray(mergedBlueprint.modules)) {
    mergedBlueprint.modules = dedupeAddons(
      mergedBlueprint.modules,
      'blueprint-json.modules'
    );
  }

  if (Array.isArray(mergedBlueprint.themes)) {
    mergedBlueprint.themes = dedupeAddons(
      mergedBlueprint.themes,
      'blueprint-json.themes'
    );
  }

  return mergedBlueprint;
}

/**
 * Constructs the full playground preview URL.
 * @param {string} playgroundUrl
 * @param {string} blueprintJson
 * @returns {string}
 */
export function buildPreviewUrl(playgroundUrl, blueprintJson) {
  const encoded = toBase64Url(blueprintJson);
  const base = playgroundUrl.endsWith('/')
    ? playgroundUrl
    : playgroundUrl + '/';
  return `${base}?blueprint-data=${encoded}`;
}

function buildPreviewBody(previewUrl, imageUrl, extraText) {
  let body = `## Omeka S Playground Preview

<a href="${previewUrl}">
  <img src="${imageUrl}" alt="Open this PR in Omeka S Playground" width="220">
</a><br>
<small><a href="${previewUrl}">Try this PR in your browser</a></small>

This preview was generated automatically from the PR branch ZIP.`;
  if (typeof extraText === 'string' && extraText.trim()) {
    body += `\n\n${extraText.trim()}`;
  }
  return body;
}

/**
 * Builds the body of the sticky PR comment.
 * @param {string} marker
 * @param {string} previewUrl
 * @param {string} imageUrl
 * @param {string} [extraText]
 * @returns {string}
 */
export function buildCommentBody(marker, previewUrl, imageUrl, extraText) {
  return `<!-- ${marker} -->\n${buildPreviewBody(previewUrl, imageUrl, extraText)}`;
}

/**
 * Builds the managed block inserted into the PR description in
 * `append-to-description` mode. The block is wrapped with `:start` and `:end`
 * marker comments so the action can find and update it on subsequent runs.
 * @param {string} marker
 * @param {string} previewUrl
 * @param {string} imageUrl
 * @param {string} [extraText]
 * @returns {string}
 */
export function buildDescriptionBlock(marker, previewUrl, imageUrl, extraText) {
  return `<!-- ${marker}:start -->\n${buildPreviewBody(previewUrl, imageUrl, extraText)}\n<!-- ${marker}:end -->`;
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Returns the regex that matches the managed description block (including a
 * trailing run of whitespace) for the given marker.
 * @param {string} marker
 * @returns {RegExp}
 */
export function descriptionBlockPattern(marker) {
  const escaped = escapeRegex(marker);
  return new RegExp(
    `<!-- ${escaped}:start -->([\\s\\S]*?)<!-- ${escaped}:end -->\\s*`,
    'm'
  );
}

/**
 * Computes the next PR body after applying (or skipping) the managed
 * description block. Returns `null` when the action should leave the body
 * untouched: either a user replaced the block content with their own placeholder
 * text, or the markers are missing and `restoreIfRemoved` is `false`.
 * @param {string} currentBody
 * @param {string} marker
 * @param {string} block
 * @param {object} [options]
 * @param {boolean} [options.restoreIfRemoved=true]
 * @returns {string | null}
 */
export function computeNextDescriptionBody(
  currentBody,
  marker,
  block,
  options = {}
) {
  const { restoreIfRemoved = true } = options;
  const body = currentBody || '';
  const pattern = descriptionBlockPattern(marker);
  const match = body.match(pattern);

  if (match) {
    const existingContent = (match[1] || '').trim();
    const looksLikeButton =
      existingContent.includes('<a ') &&
      existingContent.toLowerCase().includes('playground');
    if (existingContent && !looksLikeButton) {
      return null;
    }
    return body.replace(pattern, block);
  }

  if (!restoreIfRemoved) {
    return null;
  }

  const trimmed = body.trimEnd();
  return trimmed ? `${trimmed}\n\n${block}` : block;
}

/**
 * Removes the managed description block from a PR body, if present. Returns
 * the original body when no markers are found.
 * @param {string} currentBody
 * @param {string} marker
 * @returns {string}
 */
export function removeDescriptionBlock(currentBody, marker) {
  const body = currentBody || '';
  const pattern = descriptionBlockPattern(marker);
  if (!pattern.test(body)) {
    return body;
  }
  return body.replace(pattern, '').trimEnd();
}
