# Skip Duplicate Actions

`skip-duplicate-actions` provides the following features for [GitHub Actions](https://github.com/features/actions):

- [Skip duplicate workflow-runs](#skip-duplicate-workflow-runs) after merges, pull requests or similar.
- [Skip ignored paths](#skip-ignored-paths) to speedup documentation-changes or similar.
- [Cancel outdated workflow-runs](#cancel-outdated-workflow-runs) after branch-pushes.

All of those features help to save time and costs; especially for long-running workflows.
You can choose any subset of those features.

## Skip duplicate workflow-runs

If you work with feature branches, then you might see lots of _duplicate workflow-runs_.
For example, duplicate workflow-runs can happen if a workflow runs on a feature branch, but then the workflow is repeated right after merging the feature branch.
`skip-duplicate-actions` helps to prevent such unnecessary runs.

- **Full traceability:** After clean merges, you will see a message like `Skip execution because the exact same files have been successfully checked in <previous_run_URL>`.
- **Skip concurrent workflow-runs:** If the same workflow is unnecessarily triggered twice, then one of the workflow-runs will be skipped.
  For example, this can happen when you push a tag right after pushing a commit.
- **Respect manual triggers:** If you manually trigger a workflow with `workflow_dispatch`, then the workflow-run will not be skipped.
- **Flexible Git usage:** `skip-duplicate-actions` does not care whether you use fast-forward-merges, rebase-merges or squash-merges.
  However, if a merge yields a result that is different from the source branch, then the resulting workflow-run will _not_ be skipped.
  This is commonly the case if you merge "outdated branches".

## Skip ignored paths

In many projects, it is unnecessary to run all tests for documentation-only-changes.
Therefore, GitHub provides a `paths-ignore` feature [out of the box](https://docs.github.com/en/actions/reference/workflow-syntax-for-github-actions#onpushpull_requestpaths).
However, GitHub's `paths-ignore` has some limitations:

- GitHub's `path-ignore` does not work for _required checks_. If you path-ignore a required check, then pull requests will block forever without being mergeable. 
- Although GitHub's `path-ignore` works well with `pull_request`-triggers, it does not really work with `push`-triggers.

To overcome those limitations, `skip-duplicate-action` provides a more flexible `path_ignore` feature with an efficient backtracking-algorithm.
Instead of stupidly looking at the current commit, `path_ignore` will look for successful checks in the commit-history.
  
## Cancel outdated workflow-runs

Typically, workflows should only run for the most recent commit.
Therefore, when you push changes to a branch, `skip-duplicate-actions` will cancel any previous workflow-runs that run against outdated commits.

- **Full traceability:** If a workflow-run is cancelled, then you will see a message like `Cancelled <previous_run_URL>`.
- **Guaranteed execution:** The cancellation-algorithm guarantees that a complete check-set will finish no matter what.

## Inputs

### `github_token`

**Required** Your access token for GitHub.

### `paths_ignore`

A JSON-array with ignored path patterns, e.g. something like `["**/README.md", "**/docs/**"]`.
See [micromatch](https://github.com/micromatch/micromatch) for details about supported path patterns.
Default `[]`.

### `cancel_others`

If true, then workflow-runs from outdated commits will be cancelled. Default `true`.

## Outputs

### `should_skip`

true if the current run is a duplicate workflow-run. This should be evaluated for either individual steps or entire jobs.

## Usage examples

You can use `skip-duplicate-actions` to either skip individual steps or entire jobs.
Which one is easier depends on your workflow.

### Option 1: Skip entire jobs

To skip entire jobs, you will need a `pre_job` that acts as a pre-condition for your `main_job`.
Although this example looks like a lot of code, there are only two additional lines in your project-specific `main_job` (the `needs`-clause and the `if`-clause):

```yml
jobs:
  pre_job:
    runs-on: ubuntu-latest
    # Map a step output to a job output
    outputs:
      should_skip: ${{ steps.skip_check.outputs.should_skip }}
    steps:
      - id: skip_check
        uses: fkirc/skip-duplicate-actions@master
        with:
          github_token: ${{ github.token }}
          paths_ignore: ["**/README.md", "**/docs/**"]

  main_job:
    needs: pre_job
    if: ${{ needs.pre_job.outputs.should_skip == 'false' }}
    runs-on: ubuntu-latest
    steps:
      - run: echo "Running slow tests..." && sleep 60
```

### Option 2: Skip individual steps

If you do not want an additional `pre_job`, then you can use `skip-duplicate-actions` to skip individual steps.
The following example demonstrates how to skip an individual step with an `if`-clause and an `id`:

```yml
jobs:
  skip_individual_steps_job:
    runs-on: ubuntu-latest
    steps:
      - id: skip_check
        uses: fkirc/skip-duplicate-actions@master
        with:
          github_token: ${{ github.token }}
      - if: ${{ steps.skip_check.outputs.should_skip == 'false' }}
        run: |
          echo "Running slow tests..." && sleep 60
          echo "Do other stuff..."
```

### Option 3: Cancellation-only

If you do not care about the duplicate-skip-functionality, then you can simply ignore the `should_skip`-output.
In this case, the integration reduces to three lines:

```yml
  - uses: fkirc/skip-duplicate-actions@master
    with:
      github_token: ${{ github.token }}
```

## How does it work?

`skip-duplicate-actions` uses the [Workflow Runs API](https://docs.github.com/en/rest/reference/actions#workflow-runs) to query workflow-runs.

Firstly, `skip-duplicate-actions` will only look at workflow-runs that belong to the same workflow as the current workflow-run.
Secondly, `skip-duplicate-actions` will only look at _older_ workflow-runs in order to guard against race conditions and edge cases.
After querying such workflow-runs, it will compare them with the current workflow-run as follows:

- If there exists a workflow-runs with the same tree hash, then we have identified a duplicate workflow-run.
- If there exists an in-progress workflow-run that matches the current branch but not the current tree hash, then this workflow-run will be cancelled.

https://docs.github.com/en/rest/reference/repos#get-a-commit
