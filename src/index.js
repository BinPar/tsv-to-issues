#!/usr/bin/env node
import program from 'commander';
import path from 'path';
import Future from 'fibers/future';
import chalk from 'chalk';
import pkg from '../package.json';
import processTSVAndCreateIssues from './lib';

Future.task(() => {
  program
    .version(pkg.version)
    .usage('[options] <tsv_file>')
    .option('-u, --username [username]', 'GitHub login username')
    .option('-p, --password [password]', 'GitHub login password')
    .option('-t, --token [token]', 'GitHub OAuth token')
    .option(
      '-r, --repository <repository>',
      'GitHub repository URL (i.e.: https://github.com/BinPar/tsv-to-issues)',
    )
    .option(
      '-T, --teams [team1,team2,...]',
      'GitHub teams where we should look for the assignees. The repository must be assigned to the teams. If no teams are specified, one team will be created automatically',
      val => val.split(','),
    )
    .parse(process.argv);

  if (!program.args || !program.args[0]) {
    program.help(
      helpOutput => `\r\n  ${chalk.red('Error: You should specify a tsv file')}\r\n${helpOutput}`,
    );
  }

  if (!program.repository) {
    program.help(
      helpOutput =>
        `\r\n  ${chalk.red('Error: You should specify a GitHub repository URL')}\r\n${helpOutput}`,
    );
  }

  if (program.token || (program.username && program.password)) {
    try {
      const res = Future.fromPromise(
        processTSVAndCreateIssues({
          username: program.username,
          password: program.password,
          token: program.token,
          tsvPath: path.resolve(program.args[0]),
          repository: program.repository,
          teams: program.teams,
        }),
      ).wait();
      if (res.ok) {
        console.log(`\r\n${chalk.green.bold('Issues created successfully.')}`);
      } else {
        program.help(helpOutput => `\r\n  ${chalk.red(`Error: ${res.error}`)}\r\n${helpOutput}`);
      }
    } catch (err) {
      program.help(helpOutput => `\r\n  ${chalk.red(`Error: ${err.message}`)}\r\n${helpOutput}`);
    }
  } else {
    program.help(
      helpOutput =>
        `\r\n  ${chalk.red(
          'Error: You should specify one auth method (token or username & password)',
        )}\r\n${helpOutput}`,
    );
  }
});
