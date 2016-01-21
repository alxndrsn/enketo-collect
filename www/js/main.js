require('angular');
require('lodash');
var PouchDB = require('pouchdb');

var db = new PouchDB('ncollect');

var ncollectApp = angular.module('ncollectApp', []);

ncollectApp.controller('ncollectCtrl',
	['$scope',
	function($scope) {
		$scope.showSettings = function() { $scope.settingsVisible = true; };
		$scope.hideSettings = function() { $scope.settingsVisible = false; };

		$scope.showFormFetch = function() { $scope.formFetchVisible = true; };
		$scope.hideFormFetch = function() { $scope.formFetchVisible = false; };

		$scope.logError = function(err) {
			$scope.errors.unshift({ date:new Date(), err:err });
		};
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
						return db.put({
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
