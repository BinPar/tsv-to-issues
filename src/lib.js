import GitHub from 'github-api';
import randomColor from 'randomcolor';
import fs from 'fs';

function getIssuesFromTSV(tsvPath) {
  try {
    const tsvStr = fs.readFileSync(tsvPath, 'utf8');
    return tsvStr
      .split('\n')
      .map(issueStr =>
        issueStr.split('\t').map(s =>
          s
            .trim()
            .split(' ')
            .filter(st => st)
            .join(' '),
        ),
      )
      .map(issuePropsArray => ({
        title: issuePropsArray[0],
        description: issuePropsArray[1],
        assignees: issuePropsArray[2]
          ? issuePropsArray[2].split(',').map(s => s.trim())
          : issuePropsArray[2],
        labels: issuePropsArray[3]
          ? issuePropsArray[3].split(',').map(s => s.trim())
          : issuePropsArray[3],
        project: issuePropsArray[4],
      }));
  } catch (err) {
    console.log(err);
    return null;
  }
}

function getGitHubClient(authOptions) {
  return new GitHub(authOptions);
}

function getAllLabelsFromIssues(issues) {
  const dedupLabelsObj = {};
  issues.forEach((issue) => {
    if (issue.labels && issue.labels.length > 0) {
      issue.labels.forEach((label) => {
        dedupLabelsObj[label] = true;
      });
    }
  });
  return Object.keys(dedupLabelsObj);
}

function getAllProjectsFromIssues(issues) {
  const dedupProjectsObj = {};
  issues.forEach((issue) => {
    if (issue.project) {
      dedupProjectsObj[issue.project] = true;
    }
  });
  return Object.keys(dedupProjectsObj);
}

function getAllAssigneesFromIssues(issues) {
  const dedupAssigneesObj = {};
  issues.forEach((issue) => {
    if (issue.assignees && issue.assignees.length > 0) {
      issue.assignees.forEach((assignee) => {
        dedupAssigneesObj[assignee] = true;
      });
    }
  });
  return Object.keys(dedupAssigneesObj);
}

async function createAllLabelsNeeded(gh, labels) {
  if (labels && labels.length > 0) {
    const { data } = await gh.listLabels();
    await Promise.all(
      labels.filter(label => !data.some(githubLabel => githubLabel.name === label)).map(labelName =>
        gh.createLabel({
          name: labelName,
          color: randomColor().replace('#', ''),
        }),
      ),
    );
  }
}

async function createAllProjectsNeeded(gh, projects) {
  if (projects && projects.length > 0) {
    const { data } = await gh.listProjects();
    await Promise.all(
      projects
        .filter(project => !data.some(githubProject => githubProject.name === project))
        .map(projectName =>
          gh.createProject({
            name: projectName,
          }),
        ),
    );
  }
}

async function ensureAssigneesCanBeAssigned(gh, assignees) {
  if (assignees && assignees.length > 0) {
    const { data } = await gh.listProjects();
    await Promise.all(
      assignees
        .filter(project => !data.some(githubProject => githubProject.name === project))
        .map(projectName =>
          gh.createProject({
            name: projectName,
          }),
        ),
    );
  }
}

export default async function processTSVAndCreateIssues({
  username,
  password,
  token,
  tsvPath,
  repository,
}) {
  const [repositoryName, repositoryOwner] = repository.split('/').reverse();

  let gh;
  if (token) {
    gh = getGitHubClient({ token });
  } else {
    gh = getGitHubClient({ username, password });
  }
  const ghIssue = gh.getIssues(repositoryOwner, repositoryName);
  const ghOrganization = gh.getProject(repositoryOwner);
  const ghRepository = gh.getProject(repositoryName);
  const issues = getIssuesFromTSV(tsvPath);
  if (!issues) {
    return { ok: false, error: 'Error reading tsv file' };
  }
  if (issues.length === 0) {
    return { ok: false, error: 'There are no issues in this tsv file' };
  }
  await createAllLabelsNeeded(ghIssue, getAllLabelsFromIssues(issues));
  await createAllProjectsNeeded(ghRepository, getAllProjectsFromIssues(issues));
  await ensureAssigneesCanBeAssigned(ghOrganization, getAllAssigneesFromIssues(issues));

  return { ok: true };
}
