#!/usr/bin/env node
'use strict';

var _commander = require('commander');

var _commander2 = _interopRequireDefault(_commander);

var _path = require('path');

var _path2 = _interopRequireDefault(_path);

var _future = require('fibers/future');

var _future2 = _interopRequireDefault(_future);

var _chalk = require('chalk');

var _chalk2 = _interopRequireDefault(_chalk);

var _package = require('../package.json');

var _package2 = _interopRequireDefault(_package);

var _lib = require('./lib');

var _lib2 = _interopRequireDefault(_lib);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

_future2.default.task(() => {
  _commander2.default.version(_package2.default.version).usage('[options] <tsv_file>').option('-u, --username [username]', 'GitHub login username').option('-p, --password [password]', 'GitHub login password').option('-t, --token [token]', 'GitHub OAuth token').option('-r, --repository <repository>', 'GitHub repository URL (i.e.: https://github.com/BinPar/tsv-to-issues)').option('-T, --teams [team1,team2,...]', 'GitHub teams where we should look for the assignees. The repository must be assigned to the teams. If no teams are specified, one team will be created automatically', val => val.split(',')).parse(process.argv);

  if (!_commander2.default.args || !_commander2.default.args[0]) {
    _commander2.default.help(helpOutput => `\r\n  ${_chalk2.default.red('Error: You should specify a tsv file')}\r\n${helpOutput}`);
  }

  if (!_commander2.default.repository) {
    _commander2.default.help(helpOutput => `\r\n  ${_chalk2.default.red('Error: You should specify a GitHub repository URL')}\r\n${helpOutput}`);
  }

  if (_commander2.default.token || _commander2.default.username && _commander2.default.password) {
    try {
      const res = _future2.default.fromPromise((0, _lib2.default)({
        username: _commander2.default.username,
        password: _commander2.default.password,
        token: _commander2.default.token,
        tsvPath: _path2.default.resolve(_commander2.default.args[0]),
        repository: _commander2.default.repository,
        teams: _commander2.default.teams
      })).wait();
      if (res.ok) {
        console.log(`\r\n${_chalk2.default.green.bold('Issues created successfully.')}`);
      } else {
        _commander2.default.help(helpOutput => `\r\n  ${_chalk2.default.red(`Error: ${res.error}`)}\r\n${helpOutput}`);
      }
    } catch (err) {
      _commander2.default.help(helpOutput => `\r\n  ${_chalk2.default.red(`Error: ${err.message}`)}\r\n${helpOutput}`);
    }
  } else {
    _commander2.default.help(helpOutput => `\r\n  ${_chalk2.default.red('Error: You should specify one auth method (token or username & password)')}\r\n${helpOutput}`);
  }
});