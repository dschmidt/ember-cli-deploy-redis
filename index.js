/* jshint node: true */
'use strict';

var Promise   = require('ember-cli/lib/ext/promise');
var path      = require('path');
var fs        = require('fs');

var denodeify = require('rsvp').denodeify;
var readFile  = denodeify(fs.readFile);

var DeployPluginBase = require('ember-cli-deploy-plugin');

module.exports = {
  name: 'ember-cli-deploy-redis',

  createDeployPlugin: function(options) {
    var Redis = require('./lib/redis');

    var DeployPlugin = DeployPluginBase.extend({
      name: options.name,
      defaultConfig: {
        host: 'localhost',
        port: 6379,
        filePattern: 'index.html',
        distDir: function(context) {
          return context.distDir;
        },
        keyPrefix: function(context){
          return context.project.name() + ':index';
        },
        didDeployMessage: function(context){
          if (context.revisionKey && !context.activatedRevisionKey) {
            return "Deployed but did not activate revision " + context.revisionKey + ". "
                 + "To activate, run: "
                 + "ember deploy:activate " + context.deployTarget + " --revision=" + context.revisionKey + "\n";
          }
        },
        revisionKey: function(context) {
          return context.commandOptions.revision || context.revisionKey;
        },
        redisDeployClient: function(context) {
          return context.redisDeployClient || new Redis(context.config.redis);
        }
      },
      configure: function(/* context */) {
        this.log('validating config');

        if (!this.pluginConfig.url) {
          ['host', 'port'].forEach(this.applyDefaultConfigProperty.bind(this));
        }
        ['filePattern', 'distDir', 'keyPrefix', 'revisionKey', 'didDeployMessage', 'redisDeployClient'].forEach(this.applyDefaultConfigProperty.bind(this));

        this.log('config ok');
      },

      upload: function(/* context */) {
        var redisDeployClient = this.readConfig('redisDeployClient');
        var revisionKey       = this.readConfig('revisionKey');
        var distDir           = this.readConfig('distDir');
        var filePattern       = this.readConfig('filePattern');
        var keyPrefix         = this.readConfig('keyPrefix');
        var filePath          = path.join(distDir, filePattern);

        this.log('Uploading `' + filePath + '`');
        return this._readFileContents(filePath)
          .then(redisDeployClient.upload.bind(redisDeployClient, keyPrefix, revisionKey))
          .then(this._uploadSuccessMessage.bind(this))
          .then(function(key) {
            return { redisKey: key };
          })
          .catch(this._errorMessage.bind(this));
      },

      activate: function(/* context */) {
        var redisDeployClient = this.readConfig('redisDeployClient');
        var revisionKey = this.readConfig('revisionKey');
        var keyPrefix = this.readConfig('keyPrefix');

        this.log('Activating revision `' + revisionKey + '`');
        return Promise.resolve(redisDeployClient.activate(keyPrefix, revisionKey))
          .then(this.log.bind(this, '✔ Activated revision `' + revisionKey + '`', {}))
          .then(function(){
            return {
              activatedRevisionKey: revisionKey
            };
          })
          .catch(this._errorMessage.bind(this));
      },

      didDeploy: function(/* context */){
        var didDeployMessage = this.readConfig('didDeployMessage');
        if (didDeployMessage) {
          this.log(didDeployMessage);
        }
      },

      _readFileContents: function(path) {
        return readFile(path)
          .then(function(buffer) {
            return buffer.toString();
          });
      },

      _uploadSuccessMessage: function(key) {
        this.log('Uploaded with key `' + key + '`');
        return Promise.resolve(key);
      },

      _errorMessage: function(error) {
        this.log(error, { color: 'red' });
        return Promise.reject(error);
      }
    });
    return new DeployPlugin();
  }
};
