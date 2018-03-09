/* eslint no-await-in-loop: "off" */
import GitHub from 'github-api';
import randomColor from 'randomcolor';
import chalk from 'chalk';
import fs from 'fs';

const PROJECTS = [];
const TEAMS = [];

function hyphenToCamelCase(str) {
  return str.split('').reduce((v, a) => {
    if (v[v.length - 1] === '-') {
      return `${v.slice(0, -1)}${a.toUpperCase()}`;
    }
    return v + a;
  }, '');
}

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

async function createDefaultColumnsForNewProjects() {
  const projects = PROJECTS.filter(p => p.isNew);
  for (let i = 0, l = projects.length; i < l; i += 1) {
    const { ghWrapper } = projects[i];
    const { data: toDo } = await ghWrapper.createProjectColumn({
      name: 'ToDo',
    });
    await ghWrapper.createProjectColumn({
      name: 'In Progress',
    });
    await ghWrapper.createProjectColumn({
      name: 'Done',
    });
    projects[i].idToDoCol = toDo.id;
  }
}

async function createAllProjectsNeeded(gh, ghRepository, projects) {
  if (projects && projects.length > 0) {
    try {
      const { data } = await ghRepository.listProjects();
      const projectsDataArray = await Promise.all(
        projects
          .filter(project => !data.some(githubProject => githubProject.name === project))
          .map(projectName =>
            ghRepository.createProject({
              name: projectName,
            }),
          ),
      );
      for (let i = 0, l = data.length; i < l; i += 1) {
        const { id, name } = data[i];
        if (id) {
          const project = {
            id,
            name,
            ghWrapper: gh.getProject(id),
          };
          const { data: cols } = await project.ghWrapper.listProjectColumns();
          const toDoCol = cols.find(c => c.name === 'ToDo');
          if (toDoCol) {
            project.idToDoCol = toDoCol.id;
          }
          PROJECTS.push(project);
        }
      }
      projectsDataArray.forEach(({ data: projectData }) => {
        if (projectData.id) {
          PROJECTS.push({
            id: projectData.id,
            name: projectData.name,
            isNew: true,
            ghWrapper: gh.getProject(projectData.id),
          });
        }
      });
      await createDefaultColumnsForNewProjects();
    } catch (err) {
      console.log(chalk.red(err.response.data));
    }
  }
}

async function ensureAssigneesCanBeAssigned(
  gh,
  ghOrganization,
  names,
  repositoryName,
  repositoryOwner,
  assignees,
) {
  if (assignees && assignees.length > 0) {
    const { data } = await ghOrganization.getTeams();
    const teams = data.filter(({ name }) => names.indexOf(name) !== -1);
    const assigneesNotFound = assignees.map(a => a.toLowerCase());
    if (teams && teams.length > 0) {
      teams.forEach(({ id, name }) => {
        if (id) {
          TEAMS.push({
            id,
            name,
            ghWrapper: gh.getTeam(id),
          });
        }
      });
      const result = await Promise.all(TEAMS.map(team => team.ghWrapper.listMembers()));
      for (let i = 0, l = result.length; i < l; i += 1) {
        const { data: members } = result[i];
        for (let j = 0, l2 = members.length; j < l2; j += 1) {
          const { login } = members[j];
          const index = assigneesNotFound.indexOf(login.toLowerCase());
          if (index >= 0) {
            assigneesNotFound.splice(index, 1);
          }
        }
      }
    }
    if (!teams || teams.length === 0 || assigneesNotFound.length > 0) {
      try {
        const { data: resData } = await ghOrganization.createTeam({
          name: `${hyphenToCamelCase(repositoryName)}Dev`,
          description: 'Automatically generated by TSVToIssues to ensure the issues assignment',
          repo_names: [repositoryName],
          privacy: 'closed',
        });
        const ghWrapper = gh.getTeam(resData.id);
        TEAMS.push({
          id: resData.id,
          name: resData.name,
          ghWrapper,
        });
        for (let i = 0, l = assignees.length; i < l; i += 1) {
          const assignee = assignees[i];
          await ghWrapper.addMembership(assignee);
        }
        await ghWrapper.manageRepo(repositoryOwner, repositoryName, { permission: 'admin' });
        console.log(
          chalk.green(
            `=> Default repository team created (${hyphenToCamelCase(repositoryName)}Dev)`,
          ),
        );
      } catch (err) {
        const repoTeam = TEAMS.find(t => t.name === `${hyphenToCamelCase(repositoryName)}Dev`);
        if (repoTeam) {
          for (let i = 0, l = assigneesNotFound.length; i < l; i += 1) {
            const assignee = assigneesNotFound[i];
            await repoTeam.ghWrapper.addMembership(assignee);
          }
          await repoTeam.ghWrapper.manageRepo(repositoryOwner, repositoryName, {
            permission: 'admin',
          });
          console.log(chalk.green('=> Added assignees to default repository team'));
        }
      }
    }
  }
}

async function createIssue(ghIssue, issue) {
  return ghIssue.createIssue({
    title: issue.title,
    body: issue.description,
    assignees: issue.assignees instanceof Array ? issue.assignees : [issue.assignees],
    labels: issue.labels instanceof Array ? issue.labels : [issue.labels],
  });
}

async function createProjectCard({ project: projectName }, id, number) {
  if (projectName) {
    const { ghWrapper, idToDoCol } = PROJECTS.find(p => p.name === projectName);
    await ghWrapper.createProjectCard(idToDoCol, {
      content_id: id,
      content_type: 'Issue',
    });
    console.log(chalk.green(`=> Issue #${number} added to project ${projectName}`));
  }
}

export default async function processTSVAndCreateIssues({
  username,
  password,
  token,
  tsvPath,
  repository,
  teams,
}) {
  const [repositoryName, repositoryOwner] = repository.split('/').reverse();

  let gh;
  if (token) {
    gh = getGitHubClient({ token });
  } else {
    gh = getGitHubClient({ username, password });
  }
  const ghIssue = gh.getIssues(repositoryOwner, repositoryName);
  const ghOrganization = gh.getOrganization(repositoryOwner);
  const ghRepository = gh.getRepo(repositoryOwner, repositoryName);
  const issues = getIssuesFromTSV(tsvPath);
  if (!issues) {
    return { ok: false, error: 'Error reading tsv file' };
  }
  if (issues.length === 0) {
    return { ok: false, error: 'There are no issues in this tsv file' };
  }
  console.log(chalk.green('Creating labels...'));
  await createAllLabelsNeeded(ghIssue, getAllLabelsFromIssues(issues));
  console.log(chalk.green('=> OK'));
  console.log(chalk.green('Creating projects...'));
  await createAllProjectsNeeded(gh, ghRepository, getAllProjectsFromIssues(issues));
  console.log(chalk.green('=> OK'));
  let teamNames = [];
  if (teams && teams.length > 0) {
    teamNames = [...teams];
  }
  teamNames.push(`${hyphenToCamelCase(repositoryName)}Dev`);
  console.log(chalk.green('Checking repository teams & members...'));
  await ensureAssigneesCanBeAssigned(
    gh,
    ghOrganization,
    teamNames,
    repositoryName,
    repositoryOwner,
    getAllAssigneesFromIssues(issues),
  );
  console.log(chalk.green('Starting issue creation...'));
  for (let i = 0, l = issues.length; i < l; i += 1) {
    const issue = issues[i];
    try {
      const { data: issueRes } = await createIssue(ghIssue, issue);
      console.log(chalk.green(`=> Issue #${issueRes.number} created`));
      try {
        await createProjectCard(issue, issueRes.id, issueRes.number);
      } catch (err) {
        console.log(chalk.red(`The issue #${issueRes.number} could not be assigned to project ${issue.project}`));
      }
    } catch (err) {
      console.log(chalk.red(`The issue of line number ${i + 1} could not be created`));
    }
  }

  return { ok: true };
}
