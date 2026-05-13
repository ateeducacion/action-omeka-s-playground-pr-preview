import * as core from '@actions/core';
import * as github from '@actions/github';
import {
  buildBlueprint,
  buildPreviewUrl,
  buildCommentBody,
  buildDescriptionBlock,
  computeNextDescriptionBody,
  removeDescriptionBlock,
  parseJsonInput,
  parseOptionalBoolean,
} from './lib.js';

const MODE_COMMENT = 'comment';
const MODE_APPEND = 'append-to-description';

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
    const extraText = (core.getInput('extra-text') || '').trim();
    const prNumberInput = core.getInput('pr-number');
    const rawMode = (core.getInput('mode') || MODE_COMMENT).trim().toLowerCase();
    if (rawMode !== MODE_COMMENT && rawMode !== MODE_APPEND) {
      core.setFailed(
        `Invalid mode "${rawMode}". Accepted values: ${MODE_COMMENT}, ${MODE_APPEND}.`
      );
      return;
    }
    const mode = rawMode;
    const restoreIfRemoved =
      parseOptionalBoolean(
        core.getInput('restore-button-if-removed'),
        'restore-button-if-removed'
      ) !== false;
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

    // --- Resolve PR context ---
    const context = github.context;
    const octokit = github.getOctokit(token);
    let pullRequest = context.payload.pull_request || null;
    let { owner, repo } = context.repo;

    if (prNumberInput && prNumberInput.trim()) {
      const prNum = Number.parseInt(prNumberInput.trim(), 10);
      if (!Number.isInteger(prNum) || prNum <= 0) {
        core.setFailed(`Invalid pr-number "${prNumberInput}".`);
        return;
      }
      core.info(`Fetching PR #${prNum} details from GitHub API...`);
      const { data: prData } = await octokit.rest.pulls.get({
        owner,
        repo,
        pull_number: prNum,
      });
      pullRequest = prData;
    }

    if (!pullRequest || !pullRequest.number) {
      core.setFailed(
        'This action must be triggered from a pull_request event, or pr-number must be provided as input.'
      );
      return;
    }

    const prNumber = pullRequest.number;

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
    core.setOutput('mode', mode);

    if (mode === MODE_APPEND) {
      const block = buildDescriptionBlock(
        commentMarker,
        previewUrl,
        imageUrl,
        extraText
      );
      core.setOutput('rendered-description', block);
      core.setOutput('comment-id', '');

      const currentBody = pullRequest.body || '';
      const nextBody = computeNextDescriptionBody(currentBody, commentMarker, block, {
        restoreIfRemoved,
      });

      if (nextBody === null) {
        core.info(
          'Skipping PR description update (user placeholder detected, or markers removed with restore-button-if-removed=false).'
        );
        return;
      }

      if (nextBody === currentBody) {
        core.info('PR description already up to date.');
        return;
      }

      await octokit.rest.pulls.update({
        owner,
        repo,
        pull_number: prNumber,
        body: nextBody,
      });
      core.info('PR description updated with Omeka S Playground preview.');
      return;
    }

    // --- Comment mode (default) ---
    // If the user previously used append-to-description mode, clean the block
    // out of the PR body so the preview lives in exactly one place.
    const currentBody = pullRequest.body || '';
    const cleanedBody = removeDescriptionBlock(currentBody, commentMarker);
    if (cleanedBody !== currentBody) {
      await octokit.rest.pulls.update({
        owner,
        repo,
        pull_number: prNumber,
        body: cleanedBody,
      });
      core.info('Removed leftover preview block from PR description.');
    }

    const commentBody = buildCommentBody(commentMarker, previewUrl, imageUrl, extraText);

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
      core.setOutput('comment-id', String(existingCommentId));
    } else {
      const created = await octokit.rest.issues.createComment({
        owner,
        repo,
        issue_number: prNumber,
        body: commentBody,
      });
      core.info(`Created new preview comment (id: ${created.data.id})`);
      core.setOutput('comment-id', String(created.data.id));
    }
  } catch (error) {
    core.setFailed(`Action failed: ${error.message}`);
  }
}

run();
