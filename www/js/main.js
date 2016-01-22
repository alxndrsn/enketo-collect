require('angular');
require('lodash');
var PouchDB = require('pouchdb');
// set window.jQuery for enketo's sake
var $ = window.jQuery = require('jquery');
var Enketo = require('enketo-core');

var db;

var ncollectApp = angular.module('ncollectApp', []);

ncollectApp.service('EnketoTransform', [
	'$http', '$q',
	function($http, $q) {
		function getStylesheet(url) {
			return $http.get(url, { responseType:'document' })
				.then(function(res) {
					var p = new XSLTProcessor();
					p.importStylesheet(res.data);
					return p;
				});
		}

		function getStylesheets() {
			return $q.all([
				getStylesheet('enketo/openrosa2html5form.xsl'),
				getStylesheet('enketo/openrosa2xmlmodel.xsl')]);
		}

		function transform(processor, xml) {
			var transformed = processor.transformToDocument(xml);
			var root = transformed.documentElement.firstElementChild;
			return new XMLSerializer().serializeToString(root);
		}

		return function(xml) {
			return getStylesheets()
				.then(function(processors) {
					return $q.all([
						transform(processors[0], xml),
						transform(processors[1], xml)]);
				})
				.then(function(transformed) {
					return {
						html: transformed[0],
						model: transformed[1],
					};
				});
		};
	}
]);

ncollectApp.controller('ncollectCtrl',
	['$scope', '$q',
	function($scope, $q) {
		$scope.loading = true;

		$scope.errors = [];

		$scope.setPane = function(pane) { $scope.pane = pane; };

		$scope.logError = function(err) {
			console.log(err);
			$scope.errors.unshift({ date:new Date(), err:err });
		};

		db = new PouchDB('ncollect');

		ddocs = _.map({
			forms: function(doc) { if(doc.type === 'form') emit(doc.title); },
		}, function(map, name) {
			var doc = { _id:'_design/'+name, views:{} };
			doc.views[name] = { map:map.toString() };

			return db.get(doc._id)
				.then(function(old) {
					doc._rev = old._rev;
					return db.put(doc);
				})
		});
		$q.all(ddocs)
			.then(function() {
				$scope.loading = false;
				$scope.pane = 'main-menu';
			})
			.catch($scope.logError);
	}
]);

ncollectApp.controller('mainMenuCtrl',
	['$scope',
	function($scope) {
	}
]);

ncollectApp.controller('settingsCtrl',
	['$scope',
	function($scope) {
		$scope.version = '___VERSION___';
		$scope.serverUrl = 'http://localhost:8080/';
	}
]);

ncollectApp.controller('formManagerCtrl',
	['$scope',
	function($scope) {
		$scope.refresh = function() {
			$scope.loading = true;
			delete $scope.forms;
			db.query('forms', { include_docs:true })
				.then(function(res) {
					$scope.loading = false;
					$scope.forms = _.map(res.rows, 'doc');
					$scope.$apply();
				})
				.catch($scope.logError);
		}

		$scope.delete = function(form) {
			$scope.loading = true;
			db.remove({ _id:form._id, _rev:form._rev })
				.then($scope.refresh)
				.catch($scope.logError);
		};

		$scope.refresh();
	}
]);

ncollectApp.controller('formEditCtrl',
	['$scope', 'EnketoTransform',
	function($scope, EnketoTransform) {
		$scope.refresh = function() {
			db.query('forms', { include_docs:true })
				.then(function(res) {
					$scope.loading = false;
					$scope.forms = _.map(res.rows, 'doc');
					$scope.$apply();
				})
				.catch($scope.logError);
			$scope.loading = true;
		};

		$scope.edit = function(formDoc, dataDoc) {
			$scope.loading = true;
			EnketoTransform(jQuery.parseXML(formDoc.xml))
				.then(function(form) {
					$('#enketo-form').html(form.html);
					$scope.form = {
						doc: formDoc,
						enketo: new Enketo('#enketo-form', {
							modelStr: form.model,
							instanceStr: null, // TODO fill if dataDoc
						}),
						finalised: true,
					};
					var loadErrors = $scope.form.enketo.init();
					if(loadErrors && loadErrors.length) {
						throw new Error('Error loading form.  ' +
								JSON.stringify(loadErrors));
					}
					$scope.loading = false;
				})
				.catch(function(err) {
					$scope.loading = false;
					$scope.logError(err);
				});
		};

		$scope.save = function() {
			$scope.saving = true;
			$scope.form.enketo.validate()
				.then(function(valid) {
					if(!valid) {
						$scope.saving = false;
						$scope.$apply();
						return;
					}
					var record = $scope.form.enketo.getDataStr();
					var doc = {
						record: record,
						formId: $scope.form.doc._id,
						finalised: $scope.form.finalised,
					};
					return db.post(doc);
				})
				.then(function() {
					$scope.saving = false;
					$scope.form = null;
					$('#enketo-form').html('');
					$scope.$apply();
				})
				.catch(function(err) {
					$scope.saving = false;
					$scope.$apply();
					$scope.logError(err);
				});
		}

		$scope.refresh();
	}
]);

ncollectApp.controller('formFetchCtrl',
	['$http', '$scope',
	function($http, $scope) {
		function ona2local(ona) {
			var local = _.pick(ona, ['title', 'url']);
			local.url = local.url + '/form.xml';
			local.remote_id = ona.formid;
			return local;
		}

		$scope.refreshAvailable = function() {
			$scope.loading = true;
			delete $scope.availableForms;

			$http.get('/samples/ona/api/v1/forms?owner=mr_alex')
				.then(function(res) {
					$scope.loading = false;
					$scope.availableForms = _.map(res.data, ona2local);
					$scope.download = [];
					_.each($scope.availableForms, function(f, i) {
						$scope.download[i] = false;
					});
				})
				.catch($scope.logError);
		};

		$scope.toggleAll = function() {
			var select = true;
			if(_.every($scope.download)) {
				select = false;
			}
			_.each($scope.download, function(d, i) {
				$scope.download[i] = select;
			});
		};

		$scope.fetchSelected = function() {
			_.each($scope.download, function(requested, i) {
				if(!requested) return;
				var form = $scope.availableForms[i];
				$http.get(form.url)
					.then(function(res) {
						var xml = res.data;
						return db.post({
							type: 'form',
							title: form.title,
							remote_id: form.remote_id,
							xml: xml,
						});
					})
					.catch($scope.logError);
			});
		};

		$scope.refreshAvailable();
	}
]);
