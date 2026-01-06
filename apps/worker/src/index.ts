import {
  validateImageFile,
  type ApiResponse,
  type CreateComicBody,
  type PatchComicBody,
} from '@webcomic/shared';

interface Env {
  SANITY_PROJECT_ID: string;
  SANITY_DATASET: string;
  SANITY_WRITE_TOKEN: string;
  ADMIN_ORIGIN: string;
  GITHUB_TOKEN: string;
}

const GITHUB_OWNER = 'ericvanlare';
const GITHUB_REPO = 'webcomic-sandbox';

function corsHeaders(origin: string, adminOrigin: string): HeadersInit {
  const allowedOrigin = origin === adminOrigin ? adminOrigin : '';
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function jsonResponse<T>(
  data: ApiResponse<T>,
  status: number,
  headers: HeadersInit = {}
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  });
}

async function uploadImageToSanity(
  env: Env,
  imageBlob: Blob,
  filename: string
): Promise<{ _id: string }> {
  const url = `https://${env.SANITY_PROJECT_ID}.api.sanity.io/v2024-01-01/assets/images/${env.SANITY_DATASET}?filename=${encodeURIComponent(filename)}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.SANITY_WRITE_TOKEN}`,
      'Content-Type': imageBlob.type,
    },
    body: imageBlob,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to upload image: ${response.status} ${text}`);
  }

  const result = (await response.json()) as { document: { _id: string } };
  return { _id: result.document._id };
}

async function createComicDocument(
  env: Env,
  data: CreateComicBody,
  imageAssetId: string
): Promise<{ _id: string }> {
  const url = `https://${env.SANITY_PROJECT_ID}.api.sanity.io/v2024-01-01/data/mutate/${env.SANITY_DATASET}`;

  const mutations = [
    {
      create: {
        _type: 'comicEpisode',
        title: data.title,
        slug: { _type: 'slug', current: data.slug },
        publishedAt: data.publishedAt || new Date().toISOString(),
        image: {
          _type: 'image',
          asset: { _type: 'reference', _ref: imageAssetId },
        },
        altText: data.altText || '',
        transcript: data.transcript || '',
      },
    },
  ];

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.SANITY_WRITE_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ mutations }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to create document: ${response.status} ${text}`);
  }

  const result = (await response.json()) as {
    results: Array<{ id: string }>;
  };
  return { _id: result.results[0].id };
}

async function patchComicDocument(
  env: Env,
  documentId: string,
  data: PatchComicBody,
  newImageAssetId?: string
): Promise<void> {
  const url = `https://${env.SANITY_PROJECT_ID}.api.sanity.io/v2024-01-01/data/mutate/${env.SANITY_DATASET}`;

  const set: Record<string, unknown> = {};
  if (data.title !== undefined) set.title = data.title;
  if (data.slug !== undefined) set.slug = { _type: 'slug', current: data.slug };
  if (data.publishedAt !== undefined) set.publishedAt = data.publishedAt;
  if (data.altText !== undefined) set.altText = data.altText;
  if (data.transcript !== undefined) set.transcript = data.transcript;
  if (data.hidden !== undefined) set.hidden = data.hidden;
  if (newImageAssetId) {
    set.image = {
      _type: 'image',
      asset: { _type: 'reference', _ref: newImageAssetId },
    };
  }

  const mutations = [
    {
      patch: {
        id: documentId,
        set,
      },
    },
  ];

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.SANITY_WRITE_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ mutations }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to patch document: ${response.status} ${text}`);
  }
}

async function deleteComicDocument(
  env: Env,
  documentId: string
): Promise<void> {
  const url = `https://${env.SANITY_PROJECT_ID}.api.sanity.io/v2024-01-01/data/mutate/${env.SANITY_DATASET}`;

  const mutations = [
    {
      delete: {
        id: documentId,
      },
    },
  ];

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.SANITY_WRITE_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ mutations }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to delete document: ${response.status} ${text}`);
  }
}

async function handleCreateComic(
  request: Request,
  env: Env,
  cors: HeadersInit
): Promise<Response> {
  const contentType = request.headers.get('Content-Type') || '';
  if (!contentType.includes('multipart/form-data')) {
    return jsonResponse(
      { success: false, error: 'Expected multipart/form-data' },
      400,
      cors
    );
  }

  const formData = await request.formData();
  const jsonStr = formData.get('json');
  const imageFile = formData.get('image');

  if (!jsonStr || typeof jsonStr !== 'string') {
    return jsonResponse(
      { success: false, error: 'Missing json field in form data' },
      400,
      cors
    );
  }

  if (!imageFile || typeof imageFile === 'string') {
    return jsonResponse(
      { success: false, error: 'Missing image file in form data' },
      400,
      cors
    );
  }

  const file = imageFile as unknown as { name: string; size: number; type: string; arrayBuffer(): Promise<ArrayBuffer> };

  // Validate image
  const imageError = validateImageFile(
    { size: file.size, type: file.type },
    'image'
  );
  if (imageError) {
    return jsonResponse({ success: false, error: imageError }, 400, cors);
  }

  let data: CreateComicBody;
  try {
    data = JSON.parse(jsonStr);
  } catch {
    return jsonResponse(
      { success: false, error: 'Invalid JSON in json field' },
      400,
      cors
    );
  }

  if (!data.title || !data.slug) {
    return jsonResponse(
      { success: false, error: 'title and slug are required' },
      400,
      cors
    );
  }

  try {
    // Upload image first
    const imageBlob = new Blob([await file.arrayBuffer()], { type: file.type });
    const asset = await uploadImageToSanity(env, imageBlob, file.name);

    // Create document
    const doc = await createComicDocument(env, data, asset._id);

    return jsonResponse({ success: true, data: doc }, 201, cors);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse(
      { success: false, error: 'Failed to create comic', details: message },
      500,
      cors
    );
  }
}

async function handlePatchComic(
  request: Request,
  env: Env,
  documentId: string,
  cors: HeadersInit
): Promise<Response> {
  const contentType = request.headers.get('Content-Type') || '';

  let data: PatchComicBody;
  type FileData = { name: string; size: number; type: string; arrayBuffer(): Promise<ArrayBuffer> };
  let imageFileData: FileData | null = null;

  if (contentType.includes('multipart/form-data')) {
    const formData = await request.formData();
    const jsonStr = formData.get('json');
    const rawImageFile = formData.get('image');

    if (!jsonStr || typeof jsonStr !== 'string') {
      return jsonResponse(
        { success: false, error: 'Missing json field in form data' },
        400,
        cors
      );
    }

    try {
      data = JSON.parse(jsonStr);
    } catch {
      return jsonResponse(
        { success: false, error: 'Invalid JSON in json field' },
        400,
        cors
      );
    }

    if (rawImageFile && typeof rawImageFile !== 'string') {
      imageFileData = rawImageFile as unknown as FileData;
      const imageError = validateImageFile(
        { size: imageFileData!.size, type: imageFileData!.type },
        'image'
      );
      if (imageError) {
        return jsonResponse({ success: false, error: imageError }, 400, cors);
      }
    }
  } else if (contentType.includes('application/json')) {
    try {
      data = await request.json();
    } catch {
      return jsonResponse(
        { success: false, error: 'Invalid JSON body' },
        400,
        cors
      );
    }
  } else {
    return jsonResponse(
      { success: false, error: 'Expected multipart/form-data or application/json' },
      400,
      cors
    );
  }

  try {
    let newImageAssetId: string | undefined;
    if (imageFileData) {
      const imageBlob = new Blob([await imageFileData.arrayBuffer()], { type: imageFileData.type });
      const asset = await uploadImageToSanity(env, imageBlob, imageFileData.name);
      newImageAssetId = asset._id;
    }

    await patchComicDocument(env, documentId, data, newImageAssetId);

    return jsonResponse({ success: true, data: { _id: documentId } }, 200, cors);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse(
      { success: false, error: 'Failed to patch comic', details: message },
      500,
      cors
    );
  }
}

async function handleDeleteComic(
  env: Env,
  documentId: string,
  cors: HeadersInit
): Promise<Response> {
  try {
    await deleteComicDocument(env, documentId);
    return jsonResponse({ success: true, data: { _id: documentId, deleted: true } }, 200, cors);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse(
      { success: false, error: 'Failed to delete comic', details: message },
      500,
      cors
    );
  }
}

// AI Modification Endpoints

interface AiModRequest {
  description: string;
}

interface GitHubIssue {
  number: number;
  html_url: string;
  state: string;
}

interface GitHubPullRequest {
  number: number;
  html_url: string;
  state: string;
  head: { ref: string };
  mergeable: boolean | null;
  merged: boolean;
  body: string | null;
}

interface GitHubDeployment {
  id: number;
  environment: string;
  statuses_url: string;
}

interface GitHubDeploymentStatus {
  state: string;
  environment_url: string | null;
}

async function githubApi<T>(
  env: Env,
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const response = await fetch(`https://api.github.com${endpoint}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${env.GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'webcomic-api',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GitHub API error: ${response.status} ${text}`);
  }

  return response.json() as Promise<T>;
}

interface GraphQLResponse<T> {
  data?: T;
  errors?: Array<{ message: string }>;
}

async function githubGraphQL<T>(
  env: Env,
  query: string,
  variables: Record<string, unknown> = {}
): Promise<T> {
  const response = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.GITHUB_TOKEN}`,
      'Content-Type': 'application/json',
      'User-Agent': 'webcomic-api',
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GitHub GraphQL error: ${response.status} ${text}`);
  }

  const result = await response.json() as GraphQLResponse<T>;
  if (result.errors && result.errors.length > 0) {
    throw new Error(`GitHub GraphQL error: ${result.errors[0].message}`);
  }

  return result.data as T;
}

async function handleAiModRequest(
  request: Request,
  env: Env,
  cors: HeadersInit
): Promise<Response> {
  try {
    const body = await request.json() as AiModRequest;
    
    if (!body.description || body.description.trim().length === 0) {
      return jsonResponse(
        { success: false, error: 'Description is required' },
        400,
        cors
      );
    }

    const issueBody = `## Site Modification Request

${body.description}

---
*This issue was created from the admin panel. Copilot will work on this and create a PR.*
`;

    // Step 1: Create the issue without assignees first
    const issue = await githubApi<GitHubIssue>(
      env,
      `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/issues`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: `[AI] ${body.description.slice(0, 60)}${body.description.length > 60 ? '...' : ''}`,
          body: issueBody,
          labels: ['ai-modification'],
        }),
      }
    );

    // Step 2: Assign Copilot using GraphQL (REST API doesn't support bot assignees)
    let copilotAssigned = false;
    try {
      // First, find Copilot bot ID using suggestedActors
      interface SuggestedActorsResponse {
        repository: {
          suggestedActors: {
            nodes: Array<{ login: string; id: string; __typename: string }>;
          };
        };
      }
      
      const actorsResult = await githubGraphQL<SuggestedActorsResponse>(
        env,
        `query($owner: String!, $name: String!) {
          repository(owner: $owner, name: $name) {
            suggestedActors(capabilities: [CAN_BE_ASSIGNED], first: 20) {
              nodes {
                login
                __typename
                ... on Bot {
                  id
                }
                ... on User {
                  id
                }
              }
            }
          }
        }`,
        { owner: GITHUB_OWNER, name: GITHUB_REPO }
      );

      const copilotBot = actorsResult.repository.suggestedActors.nodes.find(
        (node) => node.login === 'copilot-swe-agent' && node.__typename === 'Bot'
      );

      if (copilotBot) {
        // Get the issue's GraphQL ID
        interface IssueIdResponse {
          repository: { issue: { id: string } };
        }
        
        const issueResult = await githubGraphQL<IssueIdResponse>(
          env,
          `query($owner: String!, $name: String!, $number: Int!) {
            repository(owner: $owner, name: $name) {
              issue(number: $number) {
                id
              }
            }
          }`,
          { owner: GITHUB_OWNER, name: GITHUB_REPO, number: issue.number }
        );

        // Assign Copilot to the issue
        await githubGraphQL<unknown>(
          env,
          `mutation($issueId: ID!, $assigneeIds: [ID!]!) {
            addAssigneesToAssignable(input: {
              assignableId: $issueId,
              assigneeIds: $assigneeIds
            }) {
              assignable {
                ... on Issue {
                  id
                }
              }
            }
          }`,
          { 
            issueId: issueResult.repository.issue.id, 
            assigneeIds: [copilotBot.id] 
          }
        );
        copilotAssigned = true;
      }
    } catch {
      // Copilot assignment failed - user may not have Copilot Pro/Pro+ enabled
      // The issue is still created, user can manually assign Copilot
    }

    return jsonResponse({
      success: true,
      data: {
        issueNumber: issue.number,
        issueUrl: issue.html_url,
        status: 'pending',
        copilotAssigned,
      },
    }, 201, cors);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse(
      { success: false, error: 'Failed to create AI modification request', details: message },
      500,
      cors
    );
  }
}

async function handleAiModStatus(
  request: Request,
  env: Env,
  cors: HeadersInit
): Promise<Response> {
  const url = new URL(request.url);
  const issueNumber = url.searchParams.get('issue');

  if (!issueNumber) {
    return jsonResponse(
      { success: false, error: 'Issue number is required' },
      400,
      cors
    );
  }

  try {
    // Get the issue to check its state
    const issue = await githubApi<GitHubIssue>(
      env,
      `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/issues/${issueNumber}`
    );

    // Search for PRs that reference this issue
    const prs = await githubApi<GitHubPullRequest[]>(
      env,
      `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/pulls?state=all&per_page=20`
    );

    // Find PR that mentions this issue (check branch name and body for "Fixes #N")
    const linkedPr = prs.find(pr => {
      if (pr.head.ref.includes(issueNumber) || pr.head.ref.includes(`issue-${issueNumber}`)) {
        return true;
      }
      if (pr.body) {
        const fixesPattern = new RegExp(`(fixes|closes|resolves)\\s+.*#${issueNumber}\\b`, 'i');
        if (fixesPattern.test(pr.body)) {
          return true;
        }
      }
      return false;
    });

    let previewUrl: string | null = null;
    let prStatus: string = 'not_found';

    if (linkedPr) {
      prStatus = linkedPr.merged ? 'merged' : linkedPr.state;

      // Cloudflare Pages preview URLs follow a pattern based on branch name
      if (!linkedPr.merged) {
        const branchSlug = linkedPr.head.ref.replace(/\//g, '-').toLowerCase();
        previewUrl = `https://${branchSlug}.webcomic-sandbox.pages.dev`;
      }
    }

    return jsonResponse({
      success: true,
      data: {
        issueNumber: parseInt(issueNumber),
        issueState: issue.state,
        prNumber: linkedPr?.number ?? null,
        prUrl: linkedPr?.html_url ?? null,
        prState: prStatus,
        previewUrl,
        status: linkedPr 
          ? (linkedPr.merged ? 'merged' : (previewUrl ? 'preview_ready' : 'pr_created'))
          : 'pending',
      },
    }, 200, cors);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse(
      { success: false, error: 'Failed to get status', details: message },
      500,
      cors
    );
  }
}

interface GitHubIssueListItem {
  number: number;
  title: string;
  body: string | null;
  state: string;
  created_at: string;
  html_url: string;
}

interface GitHubDeployment {
  id: number;
  environment: string;
  ref: string;
  sha: string;
}

interface GitHubDeploymentStatus {
  state: string;
  environment_url: string | null;
}

async function getPreviewUrlForBranch(
  env: Env,
  branchRef: string
): Promise<string | null> {
  // First try GitHub Deployments API for accurate URL
  try {
    const deployments = await githubApi<GitHubDeployment[]>(
      env,
      `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/deployments?ref=${encodeURIComponent(branchRef)}&per_page=5`
    );

    for (const deployment of deployments) {
      const statuses = await githubApi<GitHubDeploymentStatus[]>(
        env,
        `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/deployments/${deployment.id}/statuses`
      );

      const successStatus = statuses.find(s => s.state === 'success' && s.environment_url);
      if (successStatus?.environment_url) {
        return successStatus.environment_url;
      }
    }
  } catch {
    // Fall through to constructed URL
  }

  // Fallback: construct URL from branch name (works for most cases)
  // Cloudflare truncates long branch names, so limit to ~28 chars
  let branchSlug = branchRef.replace(/\//g, '-').toLowerCase();
  if (branchSlug.length > 28) {
    branchSlug = branchSlug.substring(0, 28);
  }
  return `https://${branchSlug}.webcomic-sandbox.pages.dev`;
}

async function handleAiModList(
  env: Env,
  cors: HeadersInit
): Promise<Response> {
  try {
    // Get all issues with ai-modification label
    const issues = await githubApi<GitHubIssueListItem[]>(
      env,
      `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/issues?labels=ai-modification&state=all&per_page=20&sort=created&direction=desc`
    );

    // Get all PRs to match with issues
    const prs = await githubApi<GitHubPullRequest[]>(
      env,
      `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/pulls?state=all&per_page=30`
    );

    // Build list with status info
    const requests = await Promise.all(
      issues.map(async (issue) => {
        const issueNumStr = String(issue.number);
        // Check for PR linked via branch name or "Fixes #N" in body
        const linkedPr = prs.find(pr => {
          // Check branch name
          if (pr.head.ref.includes(issueNumStr) || pr.head.ref.includes(`issue-${issueNumStr}`)) {
            return true;
          }
          // Check body for "Fixes #N" or "Closes #N" patterns
          if (pr.body) {
            const fixesPattern = new RegExp(`(fixes|closes|resolves)\\s+.*#${issue.number}\\b`, 'i');
            if (fixesPattern.test(pr.body)) {
              return true;
            }
          }
          return false;
        });

        let previewUrl: string | null = null;
        let status = 'pending';

        // Check if this issue was replaced by a revision
        const wasReplaced = issue.body?.includes('This replaces issue #') || false;
        
        // Check if PR was closed without merging (discarded)
        const wasDiscarded = linkedPr && linkedPr.state === 'closed' && !linkedPr.merged;

        if (wasReplaced && issue.state === 'closed') {
          status = 'replaced';
        } else if (wasDiscarded) {
          status = 'discarded';
        } else if (linkedPr) {
          if (linkedPr.merged) {
            status = 'applied';
          } else if (linkedPr.state === 'open') {
            previewUrl = await getPreviewUrlForBranch(env, linkedPr.head.ref);
            status = 'preview_ready';
          }
        }

        // Extract description from title (remove [AI] prefix and "Revision:" or "Revert:" prefixes)
        let description = issue.title.replace(/^\[AI\]\s*/, '');
        const isRevision = description.startsWith('Revision:');
        const isRevert = description.startsWith('Revert:');
        description = description.replace(/^(Revision|Revert):\s*/, '');

        return {
          issueNumber: issue.number,
          issueUrl: issue.html_url,
          issueState: issue.state,
          description,
          createdAt: issue.created_at,
          prNumber: linkedPr?.number ?? null,
          prUrl: linkedPr?.html_url ?? null,
          prState: linkedPr ? (linkedPr.merged ? 'merged' : linkedPr.state) : null,
          previewUrl,
          status,
          isRevision,
          isRevert,
        };
      })
    );

    return jsonResponse({
      success: true,
      data: requests,
    }, 200, cors);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse(
      { success: false, error: 'Failed to list requests', details: message },
      500,
      cors
    );
  }
}

async function handleAiModApprove(
  request: Request,
  env: Env,
  cors: HeadersInit
): Promise<Response> {
  try {
    const body = await request.json() as { prNumber: number };

    if (!body.prNumber) {
      return jsonResponse(
        { success: false, error: 'PR number is required' },
        400,
        cors
      );
    }

    // First, check if PR is a draft and mark it ready for review
    // Copilot creates PRs as drafts by default
    try {
      interface PrIdResponse {
        repository: { 
          pullRequest: { 
            id: string;
            isDraft: boolean;
          } 
        };
      }
      
      const prResult = await githubGraphQL<PrIdResponse>(
        env,
        `query($owner: String!, $name: String!, $number: Int!) {
          repository(owner: $owner, name: $name) {
            pullRequest(number: $number) {
              id
              isDraft
            }
          }
        }`,
        { owner: GITHUB_OWNER, name: GITHUB_REPO, number: body.prNumber }
      );

      if (prResult.repository.pullRequest.isDraft) {
        await githubGraphQL<unknown>(
          env,
          `mutation($pullRequestId: ID!) {
            markPullRequestReadyForReview(input: { pullRequestId: $pullRequestId }) {
              pullRequest {
                id
              }
            }
          }`,
          { pullRequestId: prResult.repository.pullRequest.id }
        );
      }
    } catch {
      // If marking ready fails, try to merge anyway
    }

    // Merge the PR
    await githubApi<unknown>(
      env,
      `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/pulls/${body.prNumber}/merge`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          merge_method: 'squash',
        }),
      }
    );

    return jsonResponse({
      success: true,
      data: { prNumber: body.prNumber, merged: true },
    }, 200, cors);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse(
      { success: false, error: 'Failed to merge PR', details: message },
      500,
      cors
    );
  }
}

async function handleAiModReject(
  request: Request,
  env: Env,
  cors: HeadersInit
): Promise<Response> {
  try {
    const body = await request.json() as { prNumber: number; issueNumber?: number };

    if (!body.prNumber) {
      return jsonResponse(
        { success: false, error: 'PR number is required' },
        400,
        cors
      );
    }

    // Close the PR
    await githubApi<unknown>(
      env,
      `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/pulls/${body.prNumber}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: 'closed' }),
      }
    );

    // Optionally close the issue too
    if (body.issueNumber) {
      await githubApi<unknown>(
        env,
        `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/issues/${body.issueNumber}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ state: 'closed' }),
        }
      );
    }

    return jsonResponse({
      success: true,
      data: { prNumber: body.prNumber, closed: true },
    }, 200, cors);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse(
      { success: false, error: 'Failed to reject changes', details: message },
      500,
      cors
    );
  }
}

async function handleAiModRevise(
  request: Request,
  env: Env,
  cors: HeadersInit
): Promise<Response> {
  try {
    const body = await request.json() as { 
      issueNumber: number; 
      prNumber: number;
      originalDescription: string;
      feedback: string;
    };

    if (!body.issueNumber || !body.prNumber) {
      return jsonResponse(
        { success: false, error: 'Issue number and PR number are required' },
        400,
        cors
      );
    }

    if (!body.feedback || body.feedback.trim().length === 0) {
      return jsonResponse(
        { success: false, error: 'Feedback is required' },
        400,
        cors
      );
    }

    // 1. Close the old PR
    await githubApi<unknown>(
      env,
      `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/pulls/${body.prNumber}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: 'closed' }),
      }
    );

    // 2. Close the old issue with a note
    await githubApi<unknown>(
      env,
      `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/issues/${body.issueNumber}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: 'closed' }),
      }
    );

    // 3. Create a new issue with combined context
    const issueBody = `## Site Modification Request

${body.originalDescription}

### Additional Changes Requested:
${body.feedback}

---
*This replaces issue #${body.issueNumber}. Copilot will work on this and create a PR.*
`;

    const issue = await githubApi<GitHubIssue>(
      env,
      `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/issues`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: `[AI] Revision: ${body.originalDescription.slice(0, 50)}${body.originalDescription.length > 50 ? '...' : ''}`,
          body: issueBody,
          labels: ['ai-modification'],
        }),
      }
    );

    // 4. Assign Copilot using GraphQL
    let copilotAssigned = false;
    try {
      interface SuggestedActorsResponse {
        repository: {
          suggestedActors: {
            nodes: Array<{ login: string; id: string; __typename: string }>;
          };
        };
      }
      
      const actorsResult = await githubGraphQL<SuggestedActorsResponse>(
        env,
        `query($owner: String!, $name: String!) {
          repository(owner: $owner, name: $name) {
            suggestedActors(capabilities: [CAN_BE_ASSIGNED], first: 20) {
              nodes {
                login
                __typename
                ... on Bot {
                  id
                }
                ... on User {
                  id
                }
              }
            }
          }
        }`,
        { owner: GITHUB_OWNER, name: GITHUB_REPO }
      );

      const copilotBot = actorsResult.repository.suggestedActors.nodes.find(
        (node) => node.login === 'copilot-swe-agent' && node.__typename === 'Bot'
      );

      if (copilotBot) {
        interface IssueIdResponse {
          repository: { issue: { id: string } };
        }
        
        const issueResult = await githubGraphQL<IssueIdResponse>(
          env,
          `query($owner: String!, $name: String!, $number: Int!) {
            repository(owner: $owner, name: $name) {
              issue(number: $number) {
                id
              }
            }
          }`,
          { owner: GITHUB_OWNER, name: GITHUB_REPO, number: issue.number }
        );

        await githubGraphQL<unknown>(
          env,
          `mutation($issueId: ID!, $assigneeIds: [ID!]!) {
            addAssigneesToAssignable(input: {
              assignableId: $issueId,
              assigneeIds: $assigneeIds
            }) {
              assignable {
                ... on Issue {
                  id
                }
              }
            }
          }`,
          { 
            issueId: issueResult.repository.issue.id, 
            assigneeIds: [copilotBot.id] 
          }
        );
        copilotAssigned = true;
      }
    } catch {
      // Copilot assignment failed - continue anyway
    }

    return jsonResponse({
      success: true,
      data: {
        issueNumber: issue.number,
        issueUrl: issue.html_url,
        copilotAssigned,
        replacedIssue: body.issueNumber,
      },
    }, 201, cors);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse(
      { success: false, error: 'Failed to create revision', details: message },
      500,
      cors
    );
  }
}

async function handleAiModRevert(
  request: Request,
  env: Env,
  cors: HeadersInit
): Promise<Response> {
  try {
    const body = await request.json() as { prNumber: number; description: string };

    if (!body.prNumber) {
      return jsonResponse(
        { success: false, error: 'PR number is required' },
        400,
        cors
      );
    }

    // Create a new issue asking Copilot to revert the changes
    const issueBody = `## Site Modification Request

Undo the changes from PR #${body.prNumber}.

Original change: ${body.description || 'No description available'}

Please revert the code changes made in that PR to restore the previous behavior.

---
*This is a revert request created from the admin panel. Copilot will work on this and create a PR.*
`;

    // Create the issue
    const issue = await githubApi<GitHubIssue>(
      env,
      `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/issues`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: `[AI] Revert: ${body.description?.slice(0, 50) || `PR #${body.prNumber}`}`,
          body: issueBody,
          labels: ['ai-modification'],
        }),
      }
    );

    // Assign Copilot using GraphQL
    let copilotAssigned = false;
    try {
      interface SuggestedActorsResponse {
        repository: {
          suggestedActors: {
            nodes: Array<{ login: string; id: string; __typename: string }>;
          };
        };
      }
      
      const actorsResult = await githubGraphQL<SuggestedActorsResponse>(
        env,
        `query($owner: String!, $name: String!) {
          repository(owner: $owner, name: $name) {
            suggestedActors(capabilities: [CAN_BE_ASSIGNED], first: 20) {
              nodes {
                login
                __typename
                ... on Bot {
                  id
                }
                ... on User {
                  id
                }
              }
            }
          }
        }`,
        { owner: GITHUB_OWNER, name: GITHUB_REPO }
      );

      const copilotBot = actorsResult.repository.suggestedActors.nodes.find(
        (node) => node.login === 'copilot-swe-agent' && node.__typename === 'Bot'
      );

      if (copilotBot) {
        interface IssueIdResponse {
          repository: { issue: { id: string } };
        }
        
        const issueResult = await githubGraphQL<IssueIdResponse>(
          env,
          `query($owner: String!, $name: String!, $number: Int!) {
            repository(owner: $owner, name: $name) {
              issue(number: $number) {
                id
              }
            }
          }`,
          { owner: GITHUB_OWNER, name: GITHUB_REPO, number: issue.number }
        );

        await githubGraphQL<unknown>(
          env,
          `mutation($issueId: ID!, $assigneeIds: [ID!]!) {
            addAssigneesToAssignable(input: {
              assignableId: $issueId,
              assigneeIds: $assigneeIds
            }) {
              assignable {
                ... on Issue {
                  id
                }
              }
            }
          }`,
          { 
            issueId: issueResult.repository.issue.id, 
            assigneeIds: [copilotBot.id] 
          }
        );
        copilotAssigned = true;
      }
    } catch {
      // Copilot assignment failed - continue anyway
    }

    return jsonResponse({
      success: true,
      data: {
        issueNumber: issue.number,
        issueUrl: issue.html_url,
        copilotAssigned,
      },
    }, 201, cors);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse(
      { success: false, error: 'Failed to create revert request', details: message },
      500,
      cors
    );
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';
    const cors = corsHeaders(origin, env.ADMIN_ORIGIN);

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    // Route: POST /api/comics
    if (url.pathname === '/api/comics' && request.method === 'POST') {
      return handleCreateComic(request, env, cors);
    }

    // Route: PATCH /api/comics/:id
    const patchMatch = url.pathname.match(/^\/api\/comics\/([^/]+)$/);
    if (patchMatch && request.method === 'PATCH') {
      return handlePatchComic(request, env, patchMatch[1], cors);
    }

    // Route: DELETE /api/comics/:id
    const deleteMatch = url.pathname.match(/^\/api\/comics\/([^/]+)$/);
    if (deleteMatch && request.method === 'DELETE') {
      return handleDeleteComic(env, deleteMatch[1], cors);
    }

    // AI Modification routes
    if (url.pathname === '/api/ai-mod/request' && request.method === 'POST') {
      return handleAiModRequest(request, env, cors);
    }

    if (url.pathname === '/api/ai-mod/list' && request.method === 'GET') {
      return handleAiModList(env, cors);
    }

    if (url.pathname === '/api/ai-mod/status' && request.method === 'GET') {
      return handleAiModStatus(request, env, cors);
    }

    if (url.pathname === '/api/ai-mod/approve' && request.method === 'POST') {
      return handleAiModApprove(request, env, cors);
    }

    if (url.pathname === '/api/ai-mod/reject' && request.method === 'POST') {
      return handleAiModReject(request, env, cors);
    }

    if (url.pathname === '/api/ai-mod/revise' && request.method === 'POST') {
      return handleAiModRevise(request, env, cors);
    }

    if (url.pathname === '/api/ai-mod/revert' && request.method === 'POST') {
      return handleAiModRevert(request, env, cors);
    }

    // Health check
    if (url.pathname === '/health') {
      return jsonResponse({ success: true, data: { status: 'ok' } }, 200, cors);
    }

    return jsonResponse({ success: false, error: 'Not found' }, 404, cors);
  },
};
