import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  toBase64Url,
  buildBlueprint,
  buildPreviewUrl,
  buildCommentBody,
  parseJsonInput,
  parseOptionalBoolean,
} from '../lib.js';

test('toBase64Url produces valid base64url (no +, /, or = chars)', () => {
  const input = '{"test":"hello world+/="}';
  const result = toBase64Url(input);
  assert.ok(!result.includes('+'), 'must not contain +');
  assert.ok(!result.includes('/'), 'must not contain /');
  assert.ok(!result.includes('='), 'must not contain =');
  // Verify round-trip
  const decoded = Buffer.from(result.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
  assert.equal(decoded, input);
});

test('toBase64Url strips padding from base64', () => {
  // 'a' encodes to 'YQ==' in standard base64, must be 'YQ' in base64url
  assert.equal(toBase64Url('a'), 'YQ');
});

test('buildBlueprint returns correct structure', () => {
  const bp = buildBlueprint(
    'https://example.com/plugin.zip',
    'Test Title',
    'test-author',
    'Test description'
  );
  assert.deepEqual(bp, {
    meta: {
      title: 'Test Title',
      author: 'test-author',
      description: 'Test description',
    },
    plugins: ['https://example.com/plugin.zip'],
  });
});

test('buildBlueprint adds optional sections, deduplicates plugins, and keeps unset sections out', () => {
  const bp = buildBlueprint(
    'https://example.com/plugin.zip',
    'Test Title',
    'test-author',
    'Test description',
    {
      extraPlugins: [
        'PluginA',
        ' https://example.com/plugin.zip ',
        'PluginB',
        'PluginA',
      ],
      seed: {
        customers: [{ codcliente: 'CDEMO1', nombre: 'Cliente Demo' }],
      },
      landingPage: '/admin',
      debugEnabled: true,
      siteTitle: 'Demo Site',
      siteLocale: 'es_ES',
      loginUsername: 'admin',
    }
  );

  assert.deepEqual(bp, {
    meta: {
      title: 'Test Title',
      author: 'test-author',
      description: 'Test description',
    },
    plugins: [
      'https://example.com/plugin.zip',
      'PluginA',
      'PluginB',
    ],
    landingPage: '/admin',
    debug: {
      enabled: true,
    },
    siteOptions: {
      title: 'Demo Site',
      locale: 'es_ES',
    },
    login: {
      username: 'admin',
    },
    seed: {
      customers: [{ codcliente: 'CDEMO1', nombre: 'Cliente Demo' }],
    },
  });

  assert.equal('timezone' in bp.siteOptions, false);
});

test('buildBlueprint applies blueprint override last and still deduplicates plugins', () => {
  const bp = buildBlueprint(
    'https://example.com/plugin.zip',
    'Generated Title',
    'generated-author',
    'Generated description',
    {
      extraPlugins: ['PluginA'],
      debugEnabled: true,
      blueprintOverride: {
        meta: {
          title: 'Override Title',
        },
        debug: {
          enabled: false,
        },
        siteOptions: {
          timezone: 'Europe/Madrid',
        },
        plugins: ['PluginA', 'PluginA', 'PluginB'],
      },
    }
  );

  assert.deepEqual(bp, {
    meta: {
      title: 'Override Title',
      author: 'generated-author',
      description: 'Generated description',
    },
    debug: {
      enabled: false,
    },
    siteOptions: {
      timezone: 'Europe/Madrid',
    },
    plugins: ['PluginA', 'PluginB'],
  });
});

test('buildBlueprint rejects non-string plugin entries', () => {
  assert.throws(
    () =>
      buildBlueprint(
        'https://example.com/plugin.zip',
        'Generated Title',
        'generated-author',
        'Generated description',
        {
          extraPlugins: ['PluginA', 123],
        }
      ),
    /Each entry in "extra-plugins" must be a string/
  );

  assert.throws(
    () =>
      buildBlueprint(
        'https://example.com/plugin.zip',
        'Generated Title',
        'generated-author',
        'Generated description',
        {
          blueprintOverride: {
            plugins: ['PluginA', false],
          },
        }
      ),
    /Each entry in "blueprint-json.plugins" must be a string/
  );
});

test('parseJsonInput validates JSON types', () => {
  assert.deepEqual(
    parseJsonInput('extra-plugins', '["PluginA"]', 'array'),
    ['PluginA']
  );
  assert.deepEqual(
    parseJsonInput('seed-json', '{"customers":[]}', 'object'),
    { customers: [] }
  );
  assert.equal(parseJsonInput('seed-json', '', 'object'), undefined);
  assert.throws(
    () => parseJsonInput('extra-plugins', '{"plugin":"A"}', 'array'),
    /must be a JSON array/
  );
  assert.throws(
    () => parseJsonInput('seed-json', '[1,2,3]', 'object'),
    /must be a JSON object/
  );
});

test('parseOptionalBoolean accepts common boolean forms and rejects invalid values', () => {
  assert.equal(parseOptionalBoolean('true', 'debug-enabled'), true);
  assert.equal(parseOptionalBoolean('OFF', 'debug-enabled'), false);
  assert.equal(parseOptionalBoolean('', 'debug-enabled'), undefined);
  assert.throws(
    () => parseOptionalBoolean('maybe', 'debug-enabled'),
    /must be a boolean value/
  );
});

test('buildPreviewUrl appends blueprint-data query param', () => {
  const json = '{"meta":{},"plugins":["https://example.com/plugin.zip"]}';
  const url = buildPreviewUrl('https://erseco.github.io/facturascripts-playground/', json);
  assert.ok(url.startsWith('https://erseco.github.io/facturascripts-playground/'), 'starts with playground URL');
  assert.ok(url.includes('?blueprint-data='), 'contains blueprint-data param');
  // Must not contain raw base64 special chars
  const encoded = url.split('?blueprint-data=')[1];
  assert.ok(!encoded.includes('+'), 'encoded must not contain +');
  assert.ok(!encoded.includes('/'), 'encoded must not contain /');
  assert.ok(!encoded.includes('='), 'encoded must not contain =');
});

test('buildPreviewUrl appends trailing slash to playground URL if missing', () => {
  const json = '{"test":1}';
  const url = buildPreviewUrl('https://erseco.github.io/facturascripts-playground', json);
  assert.ok(url.startsWith('https://erseco.github.io/facturascripts-playground/'), 'trailing slash added');
});

test('buildCommentBody contains marker, URL, and image', () => {
  const marker = 'facturascripts-playground-preview';
  const previewUrl = 'https://erseco.github.io/facturascripts-playground/?blueprint-data=abc123';
  const imageUrl = 'https://example.com/logo.png';
  const body = buildCommentBody(marker, previewUrl, imageUrl);
  assert.ok(body.includes(`<!-- ${marker} -->`), 'contains hidden marker');
  assert.ok(body.includes(previewUrl), 'contains preview URL');
  assert.ok(body.includes(imageUrl), 'contains image URL');
});
