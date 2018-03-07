#!/usr/bin/env node
import program from 'commander';
import path from 'path';
import Future from 'fibers/future';
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
    .parse(process.argv);

  if (!program.args || !program.args[0]) {
    program.help(helpOutput => `\r\n  Error: You should specify a tsv file\r\n${helpOutput}`);
  }

  if (!program.repository) {
    program.help(helpOutput => `\r\n  Error: You should specify a GitHub repository URL\r\n${helpOutput}`);
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
        }),
      ).wait();
      if (res.ok) {
        console.log('\r\nIssues created successfully.');
      } else {
        program.help(helpOutput => `\r\n  Error: ${res.error}\r\n${helpOutput}`);
      }
    } catch (err) {
      program.help(helpOutput => `\r\n  Error: ${err.message}\r\n${helpOutput}`);
    }
  } else {
    program.help(
      helpOutput =>
        `\r\n  Error: You should specify one auth method (token or username & password)\r\n${helpOutput}`,
    );
  }
});
