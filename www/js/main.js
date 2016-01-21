require('angular');
require('lodash');
var PouchDB = require('pouchdb');

var db;

var ncollectApp = angular.module('ncollectApp', []);

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
	['$scope',
	function($scope) {
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

		$scope.edit = function(form) {
			$scope.form = form;
			// TODO load enketo
		};
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
