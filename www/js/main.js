var ENKETO_CONTAINER = '#enketo-form .pages';

require('angular');
require('lodash');
var PouchDB = require('pouchdb');
// set window.jQuery for enketo's sake
var $ = window.jQuery = require('jquery');
var Enketo = require('enketo-core');

var db;

var ncollectApp = angular.module('ncollectApp', []);

ncollectApp.service('AppState', [
	function() {
		return {
		};
	}
]);

ncollectApp.service('EnketoDisplay', [
	'EnketoTransform', 'AppState',
	function(EnketoTransform, AppState) {
		return function(formDoc, record) {
			AppState.enketoLoading = true;
			return EnketoTransform(jQuery.parseXML(formDoc.xml))
				.then(function(form) {
					$(ENKETO_CONTAINER).html(form.html);
					AppState.form = {
						doc: formDoc,
						enketo: new Enketo(ENKETO_CONTAINER, {
							modelStr: form.model,
							instanceStr: record && record.data,
						}),
						finalised: true,
						record: record,
					};
					var loadErrors = AppState.form.enketo.init();
					if(loadErrors && loadErrors.length) {
						throw new Error('Error loading form.  ' +
								JSON.stringify(loadErrors));
					}
					AppState.enketoLoading = false;
				});
		}
	}
]);

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
	['$scope', '$q', 'AppState',
	function($scope, $q, AppState) {
		$scope.loading = true;
		$scope.state = AppState;

		$scope.errors = [];

		$scope.setPane = function(pane) { $scope.state.pane = pane; };

		$scope.logError = function(err) {
			console.log(err);
			$scope.errors.unshift({ date:new Date(), err:err });
		};

		db = new PouchDB('ncollect');

		ddocs = _.map({
			forms: function(doc) { if(doc.type === 'form') emit(doc.title); },
			records_unfinalised: function(doc) {
				if(doc.type === 'record' && !doc.finalised) {
					emit(doc);
				}
			},
		}, function(map, name) {
			var doc = { _id:'_design/'+name, views:{} };
			doc.views[name] = { map:map.toString() };

			return db.get(doc._id)
				.then(function(old) {
					doc._rev = old._rev;
					return db.put(doc);
				})
				.catch(function(err) {
					if(err.status !== 404) {
						$scope.logError(err);
						return;
					}
					db.put(doc)
						.catch($scope.logError);
				});
		});
		$q.all(ddocs)
			.then(function() {
				$scope.loading = false;
				$scope.state.pane = 'main-menu';
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

ncollectApp.controller('recordListCtrl',
	['$scope', 'EnketoDisplay',
	function($scope, EnketoDisplay) {
		$scope.refresh = function() {
			$scope.loading = true;
			db.query('records_unfinalised', { include_docs:true })
				.then(function(res) {
					$scope.records = _.map(res.rows, 'doc');
					$scope.loading = false;
					$scope.$apply();
				})
				.catch(function(err) {
					$scope.loading = false;
					$scope.logError(err);
					$scope.$apply();
				});
		};

		$scope.delete = function(record) {
			db.remove(record)
				.then($scope.refresh)
				.catch($scope.logError);
		};

		$scope.edit = function(record) {
			db.get(record.formId)
				.then(function(formDoc) {
					$scope.setPane('form-edit');
					EnketoDisplay(formDoc, record)
						.catch(function(err) {
							$scope.state.enketoLoading = false;
							$scope.logError(err);
						});
					$scope.$apply();
				})
				.catch($scope.logError);
		};

		$scope.refresh();
	}
]);

ncollectApp.controller('formEditCtrl',
	['$scope', 'AppState', 'EnketoDisplay',
	function($scope, AppState, EnketoDisplay) {
		$scope.state = AppState;

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

		$scope.edit = function(formDoc, record) {
			EnketoDisplay(formDoc, record)
				.catch(function(err) {
					$scope.state.enketoLoading = false;
					$scope.logError(err);
				});
		};

		$scope.save = function() {
			$scope.saving = true;
			$scope.state.form.enketo.validate()
				.then(function(valid) {
					if(!valid) {
						$scope.saving = false;
						$scope.$apply();
						return;
					}
					var data = $scope.state.form.enketo.getDataStr();
					var doc = $scope.state.form.record || {
						type: 'record',
						formId: $scope.state.form.doc._id,
						formTitle: $scope.state.form.doc.title,
					};
					doc.data = data;
					doc.finalised = $scope.state.form.finalised;
					doc.lastEditDate = new Date();

					return db.post(doc);
				})
				.then(function() {
					$scope.saving = false;
					$scope.state.form = null;
					$(ENKETO_CONTAINER).html('');
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
