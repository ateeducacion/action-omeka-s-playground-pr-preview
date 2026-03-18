import * as core from '@actions/core';
import * as github from '@actions/github';
import {
  buildBlueprint,
  buildPreviewUrl,
  buildCommentBody,
  parseJsonInput,
  parseOptionalBoolean,
} from './lib.js';

async function run() {
  try {
    // --- Read inputs ---
    const token = core.getInput('github-token', { required: true });
    const zipUrl = core.getInput('zip-url', { required: true });
    const title = core.getInput('title') || 'PR Preview';
    const description =
      core.getInput('description') || 'Preview this PR in Omeka S Playground';
    const author = core.getInput('author') || 'ateeducacion';
    const playgroundUrl =
      core.getInput('playground-url') ||
      'https://ateeducacion.github.io/omeka-s-playground/';
    const imageUrl =
      core.getInput('image-url') ||
      'https://raw.githubusercontent.com/ateeducacion/omeka-s-playground/refs/heads/main/ogimage.png';
    const commentMarker =
      core.getInput('comment-marker') || 'omeka-s-playground-preview';
    const addonName = core.getInput('addon-name') || undefined;
    const addonType = core.getInput('addon-type') || 'module';
    const addonState = core.getInput('addon-state') || undefined;
    const extraModules = [
      ...(parseJsonInput(
        'extra-modules',
        core.getInput('extra-modules'),
        'array'
      ) || []),
      ...(parseJsonInput(
        'extra-plugins',
        core.getInput('extra-plugins'),
        'array'
      ) || []),
    ];
    const extraThemes =
      parseJsonInput('extra-themes', core.getInput('extra-themes'), 'array') ||
      [];
    const users =
      parseJsonInput('users-json', core.getInput('users-json'), 'array');
    const itemSets =
      parseJsonInput('item-sets-json', core.getInput('item-sets-json'), 'array');
    const items =
      parseJsonInput('items-json', core.getInput('items-json'), 'array');
    const site =
      parseJsonInput('site-json', core.getInput('site-json'), 'object');
    const blueprintOverride =
      parseJsonInput('blueprint-json', core.getInput('blueprint-json'), 'object');
    const landingPage = core.getInput('landing-page') || undefined;
    const debugEnabled = parseOptionalBoolean(
      core.getInput('debug-enabled'),
      'debug-enabled'
    );
    const siteTitle = core.getInput('site-title') || undefined;
    const siteLocale = core.getInput('site-locale') || undefined;
    const siteTimezone = core.getInput('site-timezone') || undefined;
    const loginEmail =
      core.getInput('login-email') || core.getInput('login-username') || undefined;
    const loginPassword = core.getInput('login-password') || undefined;

    // --- Validate PR context ---
    const context = github.context;
    const prNumber =
      context.payload.pull_request && context.payload.pull_request.number;
    if (!prNumber) {
      core.setFailed(
        'This action must be triggered from a pull_request event. No pull request context found.'
      );
      return;
    }

    const { owner, repo } = context.repo;

    // --- Build blueprint and preview URL ---
    const blueprint = buildBlueprint(zipUrl, title, author, description, {
      addonName,
      addonType,
      addonState,
      extraModules,
      extraThemes,
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
    });
    const blueprintJson = JSON.stringify(blueprint, null, 2);
    const previewUrl = buildPreviewUrl(playgroundUrl, blueprintJson);

    core.info(`Preview URL: ${previewUrl}`);
    core.setOutput('preview-url', previewUrl);

    // --- Build comment body ---
    const commentBody = buildCommentBody(commentMarker, previewUrl, imageUrl);

    // --- Create or update sticky comment ---
    const octokit = github.getOctokit(token);

    // List existing comments and look for the marker
    let existingCommentId = null;
    for await (const response of octokit.paginate.iterator(
      octokit.rest.issues.listComments,
      { owner, repo, issue_number: prNumber, per_page: 100 }
    )) {
      for (const comment of response.data) {
        if (comment.body && comment.body.includes(`<!-- ${commentMarker} -->`)) {
          existingCommentId = comment.id;
          break;
        }
      }
      if (existingCommentId) break;
    }

    if (existingCommentId) {
      await octokit.rest.issues.updateComment({
        owner,
        repo,
        comment_id: existingCommentId,
        body: commentBody,
      });
      core.info(`Updated existing preview comment (id: ${existingCommentId})`);
    } else {
      await octokit.rest.issues.createComment({
        owner,
        repo,
        issue_number: prNumber,
        body: commentBody,
      });
      core.info('Created new preview comment');
    }
  } catch (error) {
    core.setFailed(`Action failed: ${error.message}`);
  }
}

run();
