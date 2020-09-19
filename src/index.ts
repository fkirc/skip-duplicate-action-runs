import * as core from '@actions/core';
import * as github from '@actions/github';
if (!github) {
  throw new Error('Module not found: github');
}
if (!core) {
  throw new Error('Module not found: core');
}

async function main() {
  if (github.context.eventName === 'workflow_dispatch') {
    return console.info("Do not skip execution because the workflow was triggered with workflow_dispatch.");
  }

  const currentTreeHash: string = github.context.payload.head_commit.tree_id;
  if (!currentTreeHash) {
    logFatal("Did not find the current tree hash");
  }
  const repo = github.context.payload.repository;
  const repoOwner = repo?.owner?.name;
  const repoName = repo?.name;
  if (!repoOwner) {
    logFatal("Did not find the repo owner");
  }
  if (!repoName) {
    logFatal("Did not find the repo name");
  }

  const token = core.getInput('github_token', { required: true });
  if (!token) {
    logFatal("Did not find github_token");
  }

  const octokit = github.getOctokit(token);
  const { data: current_run } = await octokit.actions.getWorkflowRun({
    owner: repoOwner,
    repo: repoName,
    run_id: github.context.runId
  });
  const currentWorkflowId = current_run.workflow_id;
  if (!currentWorkflowId) {
    logFatal("Did not find the current workflow id");
  }

  const { data } = await octokit.actions.listWorkflowRuns({
    owner: repoOwner,
    repo: repoName,
    workflow_id: currentWorkflowId,
    status: "success" as unknown as any, // This works, but type definitions are broken.
    per_page: 100,
  });
  const successfulRuns = data.workflow_runs.filter((run) => {
    // This is just a sanity check; our request should return only successful runs.
    return run.status === 'completed' && run.conclusion === 'success'
  });
  console.info(`Found ${successfulRuns.length} successful runs of the same workflow.`);

  for (const run of successfulRuns) {
    const treeHash = run.head_commit.tree_id;
    if (!treeHash) {
      logFatal("Received a run without a tree hash");
    }
    if (treeHash === currentTreeHash) {
      const traceabilityUrl = run.html_url;
      console.info(`Skip execution because the exact same files have been successfully checked in ${traceabilityUrl}`);
      process.exit(0); // TODO: Trigger skip.
    }
  }
  console.info("Do not skip execution because we did not find a duplicate run.");
}

main().catch((e) => {
  console.error(e);
  logFatal(e.message);
});

function logFatal(msg: string): never {
  core.setFailed(msg);
  return process.exit(1) as never;
}
